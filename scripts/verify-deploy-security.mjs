const configuredBaseUrl =
  process.env.PROJEX_VERIFY_BASE_URL?.trim() ||
  process.env.PROJEX_SMOKE_BASE_URL?.trim() ||
  'http://localhost:3000';
const verifyAuthEmail = process.env.PROJEX_VERIFY_AUTH_EMAIL?.trim() ?? '';
const verifyAuthPassword =
  process.env.PROJEX_VERIFY_AUTH_PASSWORD?.trim() ?? '';

const baseUrl = new URL(configuredBaseUrl);

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchWithRedirectControl(url, init) {
  return fetch(url, {
    redirect: 'manual',
    ...init,
  });
}

function requireHeader(headers, name, predicate, message) {
  const value = headers.get(name);
  assertCondition(value !== null, `Missing required header: ${name}`);
  assertCondition(predicate(value), message ?? `Invalid header: ${name}`);
  return value;
}

async function verifyHealthEndpoints() {
  const health = await fetchWithRedirectControl(new URL('/api/health', baseUrl));
  assertCondition(health.status === 200, `/api/health returned ${health.status}`);

  const ready = await fetchWithRedirectControl(new URL('/api/ready', baseUrl));
  assertCondition(ready.status === 200, `/api/ready returned ${ready.status}`);
}

async function verifyHtmlHeaders() {
  const login = await fetchWithRedirectControl(new URL('/login', baseUrl));
  assertCondition(login.status === 200, `/login returned ${login.status}`);

  const csp = requireHeader(
    login.headers,
    'content-security-policy',
    (value) =>
      value.includes("script-src 'self' 'nonce-") &&
      value.includes("script-src-attr 'none'") &&
      value.includes("style-src 'self' 'nonce-") &&
      value.includes("style-src-attr 'unsafe-inline'"),
    'CSP header is missing the expected nonce-based directives'
  );

  const html = await login.text();
  const metaNonceMatch = html.match(
    /<meta property="csp-nonce" content="([^"]+)"/i
  );
  assertCondition(metaNonceMatch?.[1], 'Missing csp-nonce meta tag in HTML');
  assertCondition(
    csp.includes(`nonce-${metaNonceMatch[1]}`),
    'CSP header nonce does not match HTML nonce'
  );

  requireHeader(
    login.headers,
    'x-content-type-options',
    (value) => value.toLowerCase() === 'nosniff'
  );
  requireHeader(
    login.headers,
    'x-frame-options',
    (value) => value.toUpperCase() === 'DENY'
  );
  requireHeader(
    login.headers,
    'referrer-policy',
    (value) => value === 'strict-origin-when-cross-origin'
  );
  requireHeader(
    login.headers,
    'permissions-policy',
    (value) =>
      value.includes('camera=()') &&
      value.includes('microphone=()') &&
      value.includes('geolocation=()')
  );

  if (baseUrl.protocol === 'https:') {
    requireHeader(
      login.headers,
      'strict-transport-security',
      (value) => value.toLowerCase().includes('max-age=')
    );
  }
}

async function verifyNonProductionEndpointsDisabled() {
  const devSession = await fetchWithRedirectControl(
    new URL('/api/dev/session', baseUrl),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'usr_smoke_probe' }),
    }
  );
  assertCondition(
    devSession.status === 403 || devSession.status === 404,
    `/api/dev/session should be disabled, got ${devSession.status}`
  );

  const adminSmoke = await fetchWithRedirectControl(
    new URL('/api/admin/smoke', baseUrl),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sectionId: 'basics' }),
    }
  );
  assertCondition(
    adminSmoke.status === 404 || adminSmoke.status === 401 || adminSmoke.status === 403,
    `/api/admin/smoke should not be openly available, got ${adminSmoke.status}`
  );
}

function getSetCookieHeaders(response) {
  const headers = response.headers;
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function parseCookieHeaderValue(setCookieHeaders) {
  return setCookieHeaders
    .map((header) => header.split(';', 1)[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

async function verifySessionEndpointCacheControl() {
  const session = await fetchWithRedirectControl(new URL('/api/session', baseUrl));
  assertCondition(session.status === 200, `/api/session returned ${session.status}`);
  requireHeader(
    session.headers,
    'cache-control',
    (value) => value.toLowerCase().includes('no-store'),
    '/api/session must be served with cache-control: no-store'
  );
}

async function verifyAuthSessionCookies() {
  if (!verifyAuthEmail || !verifyAuthPassword) return;

  const signIn = await fetchWithRedirectControl(
    new URL('/api/auth/sign-in/email', baseUrl),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: verifyAuthEmail,
        password: verifyAuthPassword,
      }),
    }
  );
  assertCondition(signIn.status === 200, `/api/auth/sign-in/email returned ${signIn.status}`);

  const setCookieHeaders = getSetCookieHeaders(signIn);
  assertCondition(setCookieHeaders.length > 0, 'Sign-in response did not set any cookies');

  for (const header of setCookieHeaders) {
    const lower = header.toLowerCase();
    assertCondition(lower.includes('httponly'), `Auth cookie is missing HttpOnly: ${header}`);
    assertCondition(
      lower.includes('samesite='),
      `Auth cookie is missing SameSite: ${header}`
    );
    if (baseUrl.protocol === 'https:') {
      assertCondition(lower.includes('secure'), `HTTPS auth cookie is missing Secure: ${header}`);
    }
  }

  const cookieHeader = parseCookieHeaderValue(setCookieHeaders);
  assertCondition(cookieHeader, 'Unable to build Cookie header from sign-in response');

  const session = await fetchWithRedirectControl(new URL('/api/session', baseUrl), {
    headers: { cookie: cookieHeader },
  });
  assertCondition(
    session.status === 200,
    `Authenticated /api/session returned ${session.status}`
  );
  const sessionBody = await session.json();
  assertCondition(
    sessionBody && typeof sessionBody.userId === 'string' && sessionBody.userId.length > 0,
    'Authenticated /api/session did not return a userId'
  );
}

async function verifyHttpsRedirect() {
  if (baseUrl.protocol !== 'https:') return;

  const httpUrl = new URL(baseUrl);
  httpUrl.protocol = 'http:';
  if (httpUrl.port === '443') httpUrl.port = '80';

  const response = await fetchWithRedirectControl(httpUrl);
  assertCondition(
    response.status >= 300 && response.status < 400,
    `Expected HTTP origin to redirect, got ${response.status}`
  );
  const location = response.headers.get('location') ?? '';
  assertCondition(
    location.startsWith('https://'),
    `Expected HTTPS redirect location, got ${location || '(missing)'}`
  );
}

async function main() {
  console.log(`Verifying deployed security surface at ${baseUrl.origin}`);
  await verifyHealthEndpoints();
  await verifySessionEndpointCacheControl();
  await verifyHtmlHeaders();
  await verifyNonProductionEndpointsDisabled();
  await verifyAuthSessionCookies();
  await verifyHttpsRedirect();
  console.log('Security verification checks passed.');
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Unexpected verification error'
  );
  process.exitCode = 1;
});

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function appendHeaderValue(headers: Headers, name: string, value: string) {
  const existing = headers.get(name);
  if (!existing) {
    headers.set(name, value);
    return;
  }

  const values = existing
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (!values.includes(value.toLowerCase())) {
    headers.set(name, `${existing}, ${value}`);
  }
}

function isHttpsRequest(request: Request): boolean {
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProto) return forwardedProto === 'https';

  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isOriginAllowed(origin: string | null, requestOrigin?: string): boolean {
  if (!origin) return true; // same-origin or non-browser request
  if (requestOrigin && origin === requestOrigin) return true;
  const allowed = parseAllowedOrigins();
  if (!allowed.length) return false;
  return allowed.includes(origin);
}

export function buildCorsHeaders(origin: string | null, requestOrigin?: string): Headers {
  const headers = new Headers();
  if (!origin) return headers;
  if (!isOriginAllowed(origin, requestOrigin)) return headers;

  headers.set('access-control-allow-origin', origin);
  appendHeaderValue(headers, 'vary', 'Origin');
  headers.set('access-control-allow-credentials', 'true');
  headers.set('access-control-allow-headers', 'content-type,authorization,x-request-id');
  headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  return headers;
}

export function buildSecurityHeaders(request: Request): Headers {
  const headers = new Headers();
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=()'
  );
  headers.set('x-frame-options', 'DENY');

  if (isHttpsRequest(request)) {
    headers.set(
      'strict-transport-security',
      'max-age=31536000; includeSubDomains'
    );
  }

  return headers;
}

export function withSecurityHeaders(
  request: Request,
  response: Response,
  options?: {
    origin?: string | null;
    requestOrigin?: string;
  }
): Response {
  const headers = new Headers(response.headers);

  for (const [key, value] of buildSecurityHeaders(request).entries()) {
    if (!headers.has(key)) headers.set(key, value);
  }

  if (options) {
    for (const [key, value] of buildCorsHeaders(
      options.origin ?? null,
      options.requestOrigin
    ).entries()) {
      if (key.toLowerCase() === 'vary') appendHeaderValue(headers, key, value);
      else headers.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { createApp, eventHandler, fromWebHandler } from 'h3-v2';
import { toNodeHandler } from 'srvx/node';

const CSP_NONCE_REQUEST_HEADER = 'x-projex-csp-nonce';

async function loadEnvFile(fileName) {
  if (!existsSync(fileName)) return;
  const content = await readFile(fileName, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] != null) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync('dist/server/server.js')) {
  console.error('Missing dist/server/server.js. Run `pnpm run build` first.');
  process.exit(1);
}

if (process.env.NODE_ENV !== 'production') {
  await loadEnvFile('.env.local');
}

const { validateServerStartupEnv } = await import('../src/server/env.ts');
validateServerStartupEnv();

const runMigrations = process.env.PROJEX_RUN_MIGRATIONS === 'true';
if (runMigrations) {
  run('npm', ['run', 'db:migrate']);
}

const host = process.env.HOST ?? '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const clientDistDir = resolve('dist/client');
const fallbackDistDir = resolve('dist');

if (Number.isNaN(port)) {
  console.error(`Invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
}

const { default: server } = await import('../dist/server/server.js');

if (typeof server?.fetch !== 'function') {
  console.error('Built server entry does not expose a fetch handler.');
  process.exit(1);
}

function contentTypeFor(pathname) {
  switch (extname(pathname)) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.map':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function resolveStaticFile(pathname) {
  const cleanPath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidates = [
    join(clientDistDir, cleanPath),
    join(fallbackDistDir, cleanPath),
  ];

  for (const candidate of candidates) {
    if (
      candidate.startsWith(clientDistDir) ||
      candidate.startsWith(fallbackDistDir)
    ) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function buildStaticResponse(filePath, method, cacheControl) {
  return readFile(filePath).then((body) =>
    new Response(method === 'HEAD' ? null : body, {
      status: 200,
      headers: {
        'content-type': contentTypeFor(filePath),
        'cache-control': cacheControl,
      },
    })
  );
}

function createCspNonce() {
  return randomBytes(16).toString('base64url');
}

function buildAppCsp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "script-src-attr 'none'",
    // Keep script CSP strict, but allow inline styles because Mantine runtime
    // style tags and browser nonce redaction cause SSR hydration mismatches.
    "style-src 'self' 'unsafe-inline'",
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

function injectNonceIntoHtml(html, nonce) {
  let output = html;

  if (!output.includes('property="csp-nonce"')) {
    output = output.replace(
      '</head>',
      `  <meta property="csp-nonce" content="${nonce}" />\n      </head>`
    );
  }

  output = output.replace(/\bnonce=(['"])\1/g, `nonce="${nonce}"`);

  output = output.replace(
    /<script\b(?![^>]*\bnonce=)/g,
    `<script nonce="${nonce}"`
  );

  return output;
}

function cloneRequestWithHeaders(request, headers) {
  return new Request(request.url, {
    method: request.method,
    headers,
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : request.body,
    duplex:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : 'half',
    redirect: request.redirect,
    signal: request.signal,
  });
}

const app = createApp();

app.use(
  '/assets/**',
  eventHandler(async (event) => {
    const filePath = resolveStaticFile(event.url.pathname);
    if (!filePath) {
      return new Response('Not found', { status: 404 });
    }
    return buildStaticResponse(
      filePath,
      event.req.method,
      'public, max-age=31536000, immutable'
    );
  })
);

app.use(
  '/favicon.svg',
  eventHandler(async (event) => {
    const filePath = resolveStaticFile(event.url.pathname);
    if (!filePath) {
      return new Response('Not found', { status: 404 });
    }
    return buildStaticResponse(filePath, event.req.method, 'public, max-age=3600');
  })
);

app.use(
  '/vite.svg',
  eventHandler(async (event) => {
    const filePath = resolveStaticFile(event.url.pathname);
    if (!filePath) {
      return new Response('Not found', { status: 404 });
    }
    return buildStaticResponse(filePath, event.req.method, 'public, max-age=3600');
  })
);

app.use(
  fromWebHandler(async (request) => {
    const nonce = createCspNonce();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(CSP_NONCE_REQUEST_HEADER, nonce);

    const response = await server.fetch(
      cloneRequestWithHeaders(request, requestHeaders)
    );

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      return response;
    }

    const html = injectNonceIntoHtml(await response.text(), nonce);
    const headers = new Headers(response.headers);
    headers.set('content-security-policy', buildAppCsp(nonce));

    return new Response(request.method === 'HEAD' ? null : html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  })
);

console.info(`Starting Projex SSR server on http://${host}:${port}`);
const httpServer = createServer(toNodeHandler(app.fetch));

await new Promise((resolve, reject) => {
  httpServer.once('error', reject);
  httpServer.listen(port, host, () => {
    httpServer.off('error', reject);
    resolve();
  });
});

await new Promise(() => {});

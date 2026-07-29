import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { extname, join, normalize, resolve } from 'node:path';
import { createApp, eventHandler, fromWebHandler } from 'h3-v2';
import { toNodeHandler } from 'srvx/node';
import {
  buildAppCsp,
  CSP_NONCE_REQUEST_HEADER,
  injectNonceIntoHtml,
} from '../src/server/http/csp.ts';
import {
  cacheControlForClientAsset,
  collectViteManifestAssetPaths,
  REVALIDATE_CACHE_CONTROL,
} from './cache-policy.mjs';
import { loadEnvFile } from './env-file.mjs';
import { logNodeRuntime } from './node-runtime.mjs';
const LOCAL_DEV_ORIGIN_PATTERN = /^https?:\/\/localhost:(4173|5173)(\/|$)/i;

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function resolveTlsOptions() {
  const keyFile = process.env.PROJEX_TLS_KEY_FILE?.trim();
  const certFile = process.env.PROJEX_TLS_CERT_FILE?.trim();
  if (!keyFile && !certFile) return null;
  if (!keyFile || !certFile) {
    console.error(
      'PROJEX_TLS_KEY_FILE and PROJEX_TLS_CERT_FILE must both be set to enable HTTPS.'
    );
    process.exit(1);
  }

  return {
    key: await readFile(resolve(keyFile)),
    cert: await readFile(resolve(certFile)),
  };
}

if (!existsSync('dist/server/server.js')) {
  console.error('Missing dist/server/server.js. Run `pnpm run build` first.');
  process.exit(1);
}

if (process.env.NODE_ENV !== 'production') {
  loadEnvFile('.env.local');
}

const host = process.env.HOST ?? '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

if (Number.isNaN(port)) {
  console.error(`Invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
}

logNodeRuntime('start-server');

if (process.env.NODE_ENV !== 'production') {
  const localAppOrigin = `http://localhost:${port}`;
  if (
    !process.env.BETTER_AUTH_URL ||
    LOCAL_DEV_ORIGIN_PATTERN.test(process.env.BETTER_AUTH_URL)
  ) {
    process.env.BETTER_AUTH_URL = localAppOrigin;
  }
  if (
    !process.env.PROJEX_APP_BASE_URL ||
    LOCAL_DEV_ORIGIN_PATTERN.test(process.env.PROJEX_APP_BASE_URL)
  ) {
    process.env.PROJEX_APP_BASE_URL = localAppOrigin;
  }
}

const { validateServerStartupEnv } = await import('../src/server/env.ts');
validateServerStartupEnv();

const runMigrations = process.env.PROJEX_RUN_MIGRATIONS === 'true';
if (runMigrations) {
  run('pnpm', ['run', 'db:migrate']);
}

const { recoverStaleCompanyExportJobsOnStartup } =
  await import('../src/server/fns/exportJobs.ts');
await recoverStaleCompanyExportJobsOnStartup();

const clientDistDir = resolve('dist/client');
const fallbackDistDir = resolve('dist');
const clientManifestPath = join(clientDistDir, '.vite', 'manifest.json');
const immutableClientAssetPaths = collectViteManifestAssetPaths(
  JSON.parse(await readFile(clientManifestPath, 'utf8'))
);

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
  const cleanPath = normalize(pathname)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '');
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
  return readFile(filePath).then(
    (body) =>
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
      cacheControlForClientAsset(event.url.pathname, immutableClientAssetPaths)
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
    return buildStaticResponse(
      filePath,
      event.req.method,
      'public, max-age=3600'
    );
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
    headers.set('cache-control', REVALIDATE_CACHE_CONTROL);
    headers.set('content-security-policy', buildAppCsp(nonce));

    return new Response(request.method === 'HEAD' ? null : html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  })
);

const tlsOptions = await resolveTlsOptions();
const serverProtocol = tlsOptions ? 'https' : 'http';
console.info(
  `Starting Projex SSR server on ${serverProtocol}://${host}:${port}`
);
const httpServer = tlsOptions
  ? createHttpsServer(tlsOptions, toNodeHandler(app.fetch))
  : createServer(toNodeHandler(app.fetch));

await new Promise((resolve, reject) => {
  httpServer.once('error', reject);
  httpServer.listen(port, host, () => {
    httpServer.off('error', reject);
    resolve();
  });
});

await new Promise(() => {});

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extname, join, normalize, resolve } from 'node:path';
import { createApp, eventHandler, fromWebHandler, serve } from 'h3-v2';

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync('dist/server/server.js')) {
  console.error('Missing dist/server/server.js. Run `npm run build` first.');
  process.exit(1);
}

const runMigrations = process.env.PROJEX_RUN_MIGRATIONS !== 'false';
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
    if (candidate.startsWith(clientDistDir) || candidate.startsWith(fallbackDistDir)) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

const app = createApp();

app.use('/assets/**', eventHandler(async (event) => {
  const filePath = resolveStaticFile(event.url.pathname);
  if (!filePath) {
    return new Response('Not found', { status: 404 });
  }

  const body = await readFile(filePath);
  return new Response(event.req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'content-type': contentTypeFor(filePath),
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}));

app.use('/vite.svg', eventHandler(async (event) => {
  const filePath = resolveStaticFile(event.url.pathname);
  if (!filePath) {
    return new Response('Not found', { status: 404 });
  }

  const body = await readFile(filePath);
  return new Response(event.req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'content-type': contentTypeFor(filePath),
      'cache-control': 'public, max-age=3600',
    },
  });
}));

app.use(fromWebHandler((request) => server.fetch(request)));

console.info(`Starting Projex SSR server on http://${host}:${port}`);
serve(app, { hostname: host, port });

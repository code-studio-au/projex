import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { describe, expect, test } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verifierPath = resolve(repoRoot, 'scripts/verify-deploy-security.mjs');
const nonce = 'deployment-verifier-test-nonce';
const html = `<!doctype html>
<html>
  <head>
    <meta property="csp-nonce" content="${nonce}">
    <link rel="icon" href="/favicon.svg">
    <link rel="stylesheet" href="/assets/app-AbCd1234.css">
  </head>
  <body>
    <script type="module" src="/assets/app-EfGh5678.js"></script>
  </body>
</html>`;
const immutableCacheControl = 'public, max-age=31536000, immutable';

function securityHeaders() {
  return {
    'content-security-policy': `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'`,
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
}

type CompressionMode = 'all' | 'html-and-js' | 'none';
type CacheMode =
  | 'correct'
  | 'html-immutable'
  | 'malformed-assets'
  | 'missing-assets'
  | 'unhashed-immutable';

async function createVerifierServer({
  cacheMode = 'correct',
  compressionMode = 'all',
  immutableOperationalPath,
}: {
  cacheMode?: CacheMode;
  compressionMode?: CompressionMode;
  immutableOperationalPath?: string;
} = {}) {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    const operationalHeaders =
      requestUrl.pathname === immutableOperationalPath
        ? { 'cache-control': immutableCacheControl }
        : {};

    if (requestUrl.pathname === '/api/health') {
      response.writeHead(200, operationalHeaders).end('ok');
      return;
    }
    if (requestUrl.pathname === '/api/ready') {
      response.writeHead(200, operationalHeaders).end('ready');
      return;
    }
    if (requestUrl.pathname === '/api/session') {
      response
        .writeHead(200, {
          'cache-control':
            requestUrl.pathname === immutableOperationalPath
              ? immutableCacheControl
              : 'no-store',
          'content-type': 'application/json',
        })
        .end('{"userId":null}');
      return;
    }
    if (requestUrl.pathname === '/api/auth/get-session') {
      response
        .writeHead(200, {
          'cache-control':
            requestUrl.pathname === immutableOperationalPath
              ? immutableCacheControl
              : 'no-store',
          'content-type': 'application/json',
        })
        .end('null');
      return;
    }
    if (
      requestUrl.pathname === '/__maintenance.js' ||
      requestUrl.pathname === '/__maintenance_ready'
    ) {
      response
        .writeHead(200, {
          'cache-control':
            requestUrl.pathname === immutableOperationalPath
              ? immutableCacheControl
              : 'no-store, no-cache, must-revalidate, max-age=0',
          'content-type':
            requestUrl.pathname === '/__maintenance.js'
              ? 'application/javascript'
              : 'application/json',
        })
        .end(
          requestUrl.pathname === '/__maintenance.js'
            ? 'globalThis.__maintenance = true;'
            : '{"ready":true}'
        );
      return;
    }
    if (
      requestUrl.pathname === '/api/dev/session' ||
      requestUrl.pathname === '/api/admin/smoke'
    ) {
      response.writeHead(403).end('forbidden');
      return;
    }

    const asset =
      requestUrl.pathname === '/login'
        ? { body: html, contentType: 'text/html; charset=utf-8' }
        : requestUrl.pathname === '/assets/app-EfGh5678.js'
          ? {
              body: 'globalThis.__projexCompressionTest = true;',
              contentType: 'application/javascript',
            }
          : requestUrl.pathname === '/assets/app-AbCd1234.css'
            ? {
                body: 'body { color: rgb(20, 20, 20); }',
                contentType: 'text/css',
              }
            : requestUrl.pathname === '/favicon.svg'
              ? {
                  body: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
                  contentType: 'image/svg+xml',
                }
              : null;

    if (!asset) {
      response.writeHead(404).end('not found');
      return;
    }

    const headers: Record<string, string> = {
      'content-type': asset.contentType,
      ...(requestUrl.pathname === '/login' ? securityHeaders() : {}),
    };
    if (requestUrl.pathname === '/login') {
      headers['cache-control'] =
        cacheMode === 'html-immutable' ? immutableCacheControl : 'no-cache';
    } else if (requestUrl.pathname === '/favicon.svg') {
      headers['cache-control'] =
        cacheMode === 'unhashed-immutable'
          ? immutableCacheControl
          : 'public, max-age=3600';
    } else if (cacheMode !== 'missing-assets') {
      headers['cache-control'] =
        cacheMode === 'malformed-assets'
          ? 'public, max-age=3153600, immutable'
          : immutableCacheControl;
    }
    const compressResponse =
      compressionMode === 'all' ||
      (compressionMode === 'html-and-js' &&
        requestUrl.pathname !== '/assets/app-AbCd1234.css');
    const body = compressResponse ? gzipSync(asset.body) : asset.body;
    if (compressResponse) {
      headers['content-encoding'] = 'gzip';
      headers.vary = 'Accept-Encoding';
    }
    response.writeHead(200, headers).end(body);
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Verifier test server did not expose a TCP address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      }),
  };
}

function runVerifier(baseUrl: string) {
  return new Promise<{
    status: number | null;
    stderr: string;
    stdout: string;
  }>((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [verifierPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PROJEX_VERIFY_AUTH_EMAIL: '',
        PROJEX_VERIFY_AUTH_PASSWORD: '',
        PROJEX_VERIFY_BASE_URL: baseUrl,
        PROJEX_VERIFY_REQUIRE_COMPRESSION: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', rejectRun);
    child.once('close', (status) => {
      resolveRun({ status, stderr, stdout });
    });
  });
}

describe('deployed response compression verification', () => {
  test('accepts compressed HTML, JavaScript, and CSS with a Vary header', async () => {
    const server = await createVerifierServer();
    try {
      const result = await runVerifier(server.baseUrl);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Security verification checks passed.');
    } finally {
      await server.close();
    }
  });

  test('rejects an uncompressed login response', async () => {
    const server = await createVerifierServer({ compressionMode: 'none' });
    try {
      const result = await runVerifier(server.baseUrl);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        '/login must be served with gzip or Brotli compression'
      );
    } finally {
      await server.close();
    }
  });

  test('rejects an uncompressed CSS asset', async () => {
    const server = await createVerifierServer({
      compressionMode: 'html-and-js',
    });
    try {
      const result = await runVerifier(server.baseUrl);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'CSS asset must be served with gzip or Brotli compression'
      );
    } finally {
      await server.close();
    }
  });
});

describe('deployed cache policy verification', () => {
  test('rejects a missing immutable asset policy', async () => {
    const server = await createVerifierServer({ cacheMode: 'missing-assets' });
    try {
      const result = await runVerifier(server.baseUrl);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'JavaScript asset must be served with cache-control: public, max-age=31536000, immutable'
      );
    } finally {
      await server.close();
    }
  });

  test('rejects a malformed immutable asset policy', async () => {
    const server = await createVerifierServer({
      cacheMode: 'malformed-assets',
    });
    try {
      const result = await runVerifier(server.baseUrl);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'JavaScript asset must be served with cache-control: public, max-age=31536000, immutable'
      );
    } finally {
      await server.close();
    }
  });

  test('rejects HTML accidentally marked immutable', async () => {
    const server = await createVerifierServer({ cacheMode: 'html-immutable' });
    try {
      const result = await runVerifier(server.baseUrl);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        '/login must be served with cache-control: no-cache'
      );
    } finally {
      await server.close();
    }
  });

  test('rejects an unhashed asset accidentally marked immutable', async () => {
    const server = await createVerifierServer({
      cacheMode: 'unhashed-immutable',
    });
    try {
      const result = await runVerifier(server.baseUrl);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        '/favicon.svg must not be served with immutable caching'
      );
    } finally {
      await server.close();
    }
  });

  test.each([
    '/api/health',
    '/api/ready',
    '/api/session',
    '/api/auth/get-session',
    '/__maintenance.js',
    '/__maintenance_ready',
  ])('rejects immutable caching on %s', async (immutableOperationalPath) => {
    const server = await createVerifierServer({ immutableOperationalPath });
    try {
      const result = await runVerifier(server.baseUrl);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(immutableOperationalPath);
      expect(result.stderr).toContain(
        ['/api/session', '/__maintenance.js', '/__maintenance_ready'].includes(
          immutableOperationalPath
        )
          ? 'no-store'
          : 'immutable'
      );
    } finally {
      await server.close();
    }
  });
});

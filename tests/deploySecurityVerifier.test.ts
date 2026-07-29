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
    <link rel="stylesheet" href="/assets/app.css">
  </head>
  <body>
    <script type="module" src="/assets/app.js"></script>
  </body>
</html>`;

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

async function createVerifierServer(compressionMode: CompressionMode) {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');

    if (requestUrl.pathname === '/api/health') {
      response.writeHead(200).end('ok');
      return;
    }
    if (requestUrl.pathname === '/api/ready') {
      response.writeHead(200).end('ready');
      return;
    }
    if (requestUrl.pathname === '/api/session') {
      response
        .writeHead(200, {
          'cache-control': 'no-store',
          'content-type': 'application/json',
        })
        .end('{"userId":null}');
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
        : requestUrl.pathname === '/assets/app.js'
          ? {
              body: 'globalThis.__projexCompressionTest = true;',
              contentType: 'application/javascript',
            }
          : requestUrl.pathname === '/assets/app.css'
            ? {
                body: 'body { color: rgb(20, 20, 20); }',
                contentType: 'text/css',
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
    const compressResponse =
      compressionMode === 'all' ||
      (compressionMode === 'html-and-js' &&
        requestUrl.pathname !== '/assets/app.css');
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
    const server = await createVerifierServer('all');
    try {
      const result = await runVerifier(server.baseUrl);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Security verification checks passed.');
    } finally {
      await server.close();
    }
  });

  test('rejects an uncompressed login response', async () => {
    const server = await createVerifierServer('none');
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
    const server = await createVerifierServer('html-and-js');
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

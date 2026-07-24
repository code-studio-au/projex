import assert from 'node:assert/strict';
import { z } from 'zod';
import { test } from 'vitest';

import { AppError } from '../src/api/errors.ts';
import {
  loadRouteServerExport,
  loadRouteServerModule,
  readJsonBody,
  readValidatedJsonBody,
  requireApiRouteContext,
  requirePublicApiRouteContext,
} from '../src/routes/-api-shared.ts';
import { asUserId } from '../src/types/index.ts';

test('readJsonBody rejects malformed JSON bodies with a validation error', async () => {
  const request = new Request('http://localhost:3000/api/test', {
    method: 'POST',
    body: '{bad json',
    headers: { 'content-type': 'application/json' },
  });

  await assert.rejects(
    () => readJsonBody(request),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.message, 'Request body must be valid JSON');
      return true;
    }
  );
});

test('readJsonBody rejects declared and streamed bodies above the endpoint limit', async () => {
  const declaredRequest = new Request('http://localhost:3000/api/test', {
    method: 'POST',
    body: '{}',
    headers: {
      'content-length': '100',
      'content-type': 'application/json',
    },
  });
  const streamedRequest = new Request('http://localhost:3000/api/test', {
    method: 'POST',
    body: JSON.stringify({ value: 'too large' }),
    headers: { 'content-type': 'application/json' },
  });

  for (const request of [declaredRequest, streamedRequest]) {
    await assert.rejects(
      () => readJsonBody(request, { maxBytes: 8 }),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, 'PAYLOAD_TOO_LARGE');
        return true;
      }
    );
  }
});

test('readValidatedJsonBody parses valid JSON and applies the endpoint schema', async () => {
  const request = new Request('http://localhost:3000/api/test', {
    method: 'POST',
    body: JSON.stringify({ name: 'Acme Co' }),
    headers: { 'content-type': 'application/json' },
  });

  const payload = await readValidatedJsonBody(
    request,
    z.object({ name: z.string().min(1) })
  );

  assert.deepEqual(payload, { name: 'Acme Co' });
});

test('readValidatedJsonBody surfaces schema validation errors consistently', async () => {
  const request = new Request('http://localhost:3000/api/test', {
    method: 'POST',
    body: JSON.stringify({ name: '' }),
    headers: { 'content-type': 'application/json' },
  });

  await assert.rejects(
    () => readValidatedJsonBody(request, z.object({ name: z.string().min(1) })),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.match(error.message, /(at least 1 character|>=1 characters)/i);
      assert.ok(Array.isArray(error.meta?.issues));
      return true;
    }
  );
});

test('requireApiRouteContext accepts normalized server context and rejects missing state', () => {
  const context = {
    session: { userId: asUserId('usr_1') },
    serverContext: { sessionVerified: true },
    requestId: 'req_1',
    origin: 'http://localhost:3000',
    requestOrigin: 'http://localhost:3000',
    started: 123,
  };

  assert.equal(requireApiRouteContext(context), context);
  assert.throws(
    () => requireApiRouteContext({ requestId: 'req_1' }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.match(error.message, /Missing API route context/);
      return true;
    }
  );
});

test('requirePublicApiRouteContext accepts public metadata and rejects missing state', () => {
  const context = {
    requestId: 'req_1',
    origin: null,
    requestOrigin: 'http://localhost:3000',
    started: 123,
  };

  assert.equal(requirePublicApiRouteContext(context), context);
  assert.throws(
    () => requirePublicApiRouteContext(null),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.match(error.message, /Missing public API route context/);
      return true;
    }
  );
});

test('loadRouteServerModule rejects missing route server modules', async () => {
  await assert.rejects(
    () => loadRouteServerModule('../server/http/does-not-exist'),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.match(error.message, /Missing route server module/);
      return true;
    }
  );
});

test('loadRouteServerExport resolves existing modules and rejects missing exports', async () => {
  const mod = await loadRouteServerModule<{
    resolveRequestServerContext: unknown;
  }>('../server/http/requestContext');
  assert.equal(typeof mod.resolveRequestServerContext, 'function');

  await assert.rejects(
    () =>
      loadRouteServerExport(
        '../server/http/requestContext',
        'missingRequestContextExport'
      ),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.match(error.message, /Missing server export/);
      return true;
    }
  );
});

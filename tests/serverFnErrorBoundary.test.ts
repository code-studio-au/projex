import assert from 'node:assert/strict';
import { test } from 'vitest';

import { AppError } from '../src/api/errors.ts';
import { withServerBoundary } from '../src/server/fns/runtime.ts';
import {
  normalizeAndLogServerFnError,
  serverFnRequestId,
} from '../src/server/start/errorBoundary.ts';
import { safeParseJson } from '../src/utils/json.ts';

const serverFnMeta = {
  id: 'server_fn_test_id',
  name: 'testServerFn',
  filename: 'src/server/start/functions/test.ts',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function captureConsoleError() {
  const original = console.error;
  const messages: string[] = [];
  console.error = (message?: unknown) => messages.push(String(message));
  return {
    messages,
    restore() {
      console.error = original;
    },
  };
}

test('serverFnRequestId preserves supplied ids and generates missing ids', () => {
  assert.equal(
    serverFnRequestId(
      new Request('http://localhost/_serverFn/test', {
        headers: { 'x-request-id': 'req_supplied' },
      })
    ),
    'req_supplied'
  );
  assert.match(
    serverFnRequestId(new Request('http://localhost/_serverFn/test')),
    /^[0-9a-f-]{36}$/
  );
});

test('native server-function errors classify causes without logging private details', async () => {
  const logs = captureConsoleError();
  const privateError = new Error(
    'database secret from native server function token=private'
  );

  try {
    let serverBoundaryError: unknown;
    try {
      await withServerBoundary(async () => {
        throw privateError;
      });
    } catch (error) {
      serverBoundaryError = error;
    }

    const publicError = normalizeAndLogServerFnError({
      error: serverBoundaryError,
      request: new Request('http://localhost/_serverFn/test', {
        method: 'POST',
      }),
      requestId: 'req_native_server_fn',
      serverFnMeta,
    });

    assert.ok(publicError instanceof AppError);
    assert.equal(publicError.code, 'INTERNAL_ERROR');
    assert.equal(publicError.message, 'Unexpected server error');
    assert.equal(publicError.meta, undefined);

    assert.equal(logs.messages.length, 1);
    const parsed = safeParseJson(logs.messages[0]);
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.ok(isRecord(parsed.data));
    assert.deepEqual(
      {
        level: parsed.data.level,
        type: parsed.data.type,
        requestId: parsed.data.requestId,
        method: parsed.data.method,
        path: parsed.data.path,
        status: parsed.data.status,
        code: parsed.data.code,
        message: parsed.data.message,
        serverFnId: parsed.data.serverFnId,
        errorType: parsed.data.errorType,
      },
      {
        level: 'error',
        type: 'server_fn',
        requestId: 'req_native_server_fn',
        method: 'POST',
        path: '/_serverFn/test',
        status: 500,
        code: 'INTERNAL_ERROR',
        message: undefined,
        serverFnId: 'server_fn_test_id',
        errorType: 'Error',
      }
    );
    assert.doesNotMatch(logs.messages[0], /database secret|token=private/u);
  } finally {
    logs.restore();
  }
});

test('native server-function boundary preserves deliberate app errors without private logging', () => {
  const logs = captureConsoleError();
  try {
    const domainError = new AppError('CONFLICT', 'Public conflict');
    const result = normalizeAndLogServerFnError({
      error: domainError,
      request: new Request('http://localhost/_serverFn/test'),
      requestId: 'req_domain_server_fn',
      serverFnMeta,
    });

    assert.equal(result, domainError);
    assert.equal(result.message, 'Public conflict');
    assert.equal(logs.messages.length, 0);
  } finally {
    logs.restore();
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../src/api/errors.ts';
import { withPublicApi } from '../src/routes/-api-shared.ts';
import { safeParseJson } from '../src/utils/json.ts';

type RequestLog = {
  level: string;
  type: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs?: number;
  code?: string;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new TypeError(`Expected ${key} to be a string`);
  }
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number') {
    throw new TypeError(`Expected ${key} to be a number`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  if (typeof value === 'undefined') return undefined;
  if (typeof value !== 'string') {
    throw new TypeError(`Expected ${key} to be a string`);
  }
  return value;
}

function optionalNumber(
  record: Record<string, unknown>,
  key: string
): number | undefined {
  const value = record[key];
  if (typeof value === 'undefined') return undefined;
  if (typeof value !== 'number') {
    throw new TypeError(`Expected ${key} to be a number`);
  }
  return value;
}

function parseRequestLog(value: string): RequestLog {
  const parseResult = safeParseJson(value);
  assert.equal(parseResult.success, true);
  if (!parseResult.success) throw new Error('Expected valid JSON log entry');
  const parsed = parseResult.data;
  assert.ok(isRecord(parsed));
  return {
    level: requiredString(parsed, 'level'),
    type: requiredString(parsed, 'type'),
    requestId: requiredString(parsed, 'requestId'),
    method: requiredString(parsed, 'method'),
    path: requiredString(parsed, 'path'),
    status: requiredNumber(parsed, 'status'),
    durationMs: optionalNumber(parsed, 'durationMs'),
    code: optionalString(parsed, 'code'),
    message: optionalString(parsed, 'message'),
  };
}

function captureConsole(method: 'info' | 'warn' | 'error') {
  const original = console[method];
  const messages: string[] = [];
  console[method] = (message?: unknown) => {
    messages.push(String(message));
  };
  return {
    messages,
    restore() {
      console[method] = original;
    },
  };
}

test('withPublicApi propagates request ids and emits structured success logs', async () => {
  const logs = captureConsole('info');
  try {
    const response = await withPublicApi(
      new Request('http://localhost/api/example', {
        headers: { 'x-request-id': 'req_test_success' },
      }),
      async () => ({ ok: true })
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'req_test_success');
    assert.deepEqual(await response.json(), { ok: true });

    assert.equal(logs.messages.length, 1);
    const log = parseRequestLog(logs.messages[0]);
    assert.equal(log.level, 'info');
    assert.equal(log.type, 'api_request');
    assert.equal(log.requestId, 'req_test_success');
    assert.equal(log.method, 'GET');
    assert.equal(log.path, '/api/example');
    assert.equal(log.status, 200);
    assert.equal(typeof log.durationMs, 'number');
  } finally {
    logs.restore();
  }
});

test('withPublicApi converts AppError into request-id responses and warning logs', async () => {
  const logs = captureConsole('warn');
  try {
    const response = await withPublicApi(
      new Request('http://localhost/api/example', {
        method: 'POST',
        headers: { 'x-request-id': 'req_test_validation' },
      }),
      async () => {
        throw new AppError('VALIDATION_ERROR', 'Bad input');
      }
    );

    assert.equal(response.status, 422);
    assert.equal(response.headers.get('x-request-id'), 'req_test_validation');
    assert.deepEqual(await response.json(), {
      code: 'VALIDATION_ERROR',
      message: 'Bad input',
      meta: null,
    });

    assert.equal(logs.messages.length, 1);
    const log = parseRequestLog(logs.messages[0]);
    assert.equal(log.level, 'warn');
    assert.equal(log.type, 'api_request');
    assert.equal(log.requestId, 'req_test_validation');
    assert.equal(log.method, 'POST');
    assert.equal(log.path, '/api/example');
    assert.equal(log.status, 422);
    assert.equal(log.code, 'VALIDATION_ERROR');
    assert.equal(log.message, 'Bad input');
  } finally {
    logs.restore();
  }
});

test('withPublicApi maps rate-limited errors to 429 and retry-after', async () => {
  const logs = captureConsole('warn');
  try {
    const response = await withPublicApi(
      new Request('http://localhost/api/example', {
        method: 'POST',
        headers: { 'x-request-id': 'req_test_rate_limit' },
      }),
      async () => {
        throw new AppError('RATE_LIMITED', 'Slow down', {
          retryAfterSeconds: 17,
        });
      }
    );

    assert.equal(response.status, 429);
    assert.equal(response.headers.get('x-request-id'), 'req_test_rate_limit');
    assert.equal(response.headers.get('retry-after'), '17');
    assert.deepEqual(await response.json(), {
      code: 'RATE_LIMITED',
      message: 'Slow down',
      meta: { retryAfterSeconds: 17 },
    });

    assert.equal(logs.messages.length, 1);
    const log = parseRequestLog(logs.messages[0]);
    assert.equal(log.level, 'warn');
    assert.equal(log.status, 429);
    assert.equal(log.code, 'RATE_LIMITED');
    assert.equal(log.message, 'Slow down');
  } finally {
    logs.restore();
  }
});

test('withPublicApi hides unexpected error messages from clients', async () => {
  const logs = captureConsole('error');
  try {
    const response = await withPublicApi(
      new Request('http://localhost/api/example', {
        method: 'POST',
        headers: { 'x-request-id': 'req_test_internal' },
      }),
      async () => {
        throw new Error('database connection exploded');
      }
    );

    assert.equal(response.status, 500);
    assert.equal(response.headers.get('x-request-id'), 'req_test_internal');
    assert.deepEqual(await response.json(), {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error',
    });

    assert.equal(logs.messages.length, 1);
    const log = parseRequestLog(logs.messages[0]);
    assert.equal(log.level, 'error');
    assert.equal(log.status, 500);
    assert.equal(log.message, undefined);
  } finally {
    logs.restore();
  }
});

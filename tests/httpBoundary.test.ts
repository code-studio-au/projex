import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import { AppError } from '../src/api/errors.ts';
import { withPublicApi } from '../src/routes/-api-shared.ts';
import { safeParseJson } from '../src/utils/json.ts';
import { requireAt } from './helpers/assertions.ts';

const ORIGINAL_ENV = { ...process.env };

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
  errorType?: string;
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
    errorType: optionalString(parsed, 'errorType'),
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

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

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
    const log = parseRequestLog(requireAt(logs.messages, 0));
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
    const log = parseRequestLog(requireAt(logs.messages, 0));
    assert.equal(log.level, 'warn');
    assert.equal(log.type, 'api_request');
    assert.equal(log.requestId, 'req_test_validation');
    assert.equal(log.method, 'POST');
    assert.equal(log.path, '/api/example');
    assert.equal(log.status, 422);
    assert.equal(log.code, 'VALIDATION_ERROR');
    assert.equal(log.message, undefined);
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
    const log = parseRequestLog(requireAt(logs.messages, 0));
    assert.equal(log.level, 'warn');
    assert.equal(log.status, 429);
    assert.equal(log.code, 'RATE_LIMITED');
    assert.equal(log.message, undefined);
  } finally {
    logs.restore();
  }
});

test('withPublicApi hides unexpected error details from clients and logs', async () => {
  const logs = captureConsole('error');
  try {
    const response = await withPublicApi(
      new Request('http://localhost/api/example', {
        method: 'POST',
        headers: { 'x-request-id': 'req_test_internal' },
      }),
      async () => {
        const error = new Error(
          'database connection exploded authorization=Bearer secret-token'
        );
        Object.assign(error, {
          headers: { cookie: 'session=private' },
          connectionUrl: 'postgres://private-credential@database/projex',
        });
        throw error;
      }
    );

    assert.equal(response.status, 500);
    assert.equal(response.headers.get('x-request-id'), 'req_test_internal');
    assert.deepEqual(await response.json(), {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error',
    });

    assert.equal(logs.messages.length, 1);
    const log = parseRequestLog(requireAt(logs.messages, 0));
    assert.equal(log.level, 'error');
    assert.equal(log.requestId, 'req_test_internal');
    assert.equal(log.status, 500);
    assert.equal(log.message, undefined);
    assert.equal(log.errorType, 'Error');
    assert.doesNotMatch(
      requireAt(logs.messages, 0),
      /secret-token|private-credential/u
    );
  } finally {
    logs.restore();
  }
});

test('withPublicApi hides and classifies unexpected server-boundary causes', async () => {
  const logs = captureConsole('error');
  try {
    const { withServerBoundary } = await import('../src/server/fns/runtime.ts');
    const response = await withPublicApi(
      new Request('http://localhost/api/example', {
        method: 'POST',
        headers: { 'x-request-id': 'req_test_server_boundary' },
      }),
      () =>
        withServerBoundary(async () => {
          throw new Error('duplicate key value violates secret_constraint');
        })
    );

    assert.equal(response.status, 500);
    assert.equal(
      response.headers.get('x-request-id'),
      'req_test_server_boundary'
    );
    assert.deepEqual(await response.json(), {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error',
      meta: null,
    });

    assert.equal(logs.messages.length, 1);
    const log = parseRequestLog(requireAt(logs.messages, 0));
    assert.equal(log.level, 'error');
    assert.equal(log.requestId, 'req_test_server_boundary');
    assert.equal(log.status, 500);
    assert.equal(log.code, 'INTERNAL_ERROR');
    assert.equal(log.message, undefined);
    assert.equal(log.errorType, 'Error');
    assert.doesNotMatch(requireAt(logs.messages, 0), /secret_constraint/u);
  } finally {
    logs.restore();
  }
});

test('withPublicApi rejects disallowed cross-origin browser requests', async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';
  const logs = captureConsole('warn');

  try {
    const response = await withPublicApi(
      new Request('https://api.example.com/api/example', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example.com',
          'x-request-id': 'req_test_origin_block',
        },
      }),
      async () => ({ ok: true })
    );

    assert.equal(response.status, 403);
    assert.equal(response.headers.get('x-request-id'), 'req_test_origin_block');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.deepEqual(await response.json(), {
      code: 'FORBIDDEN',
      message: 'Origin not allowed',
    });

    assert.equal(logs.messages.length, 1);
    const log = parseRequestLog(requireAt(logs.messages, 0));
    assert.equal(log.level, 'warn');
    assert.equal(log.status, 403);
    assert.equal(log.code, 'FORBIDDEN');
    assert.equal(log.message, undefined);
  } finally {
    logs.restore();
  }
});

test('withPublicApi answers allowed CORS preflight requests without invoking handlers', async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';

  let invoked = false;
  const response = await withPublicApi(
    new Request('https://api.example.com/api/example', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'POST',
        'x-request-id': 'req_test_preflight',
      },
    }),
    async () => {
      invoked = true;
      return { ok: true };
    }
  );

  assert.equal(invoked, false);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('x-request-id'), 'req_test_preflight');
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'https://app.example.com'
  );
  assert.equal(
    response.headers.get('access-control-allow-credentials'),
    'true'
  );
  assert.match(
    response.headers.get('access-control-allow-methods') ?? '',
    /OPTIONS/
  );
});

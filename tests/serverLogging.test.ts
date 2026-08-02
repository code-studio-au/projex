import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { afterEach, test, vi } from 'vitest';

import {
  logAuditEvent,
  logServerEvent,
  MAX_SERVER_LOG_BYTES,
  type ServerLogFields,
} from '../src/api/serverLogging.ts';
import {
  recordAuditLogEvent,
  withAuditLoggingTransaction,
} from '../src/server/logging/auditLogger.ts';
import { asCompanyId, asProjectId, asUserId } from '../src/types/index.ts';
import { sendAuthEmail } from '../src/server/auth/email.ts';
import { safeParseJson } from '../src/utils/json.ts';

const ORIGINAL_ENV = { ...process.env };
const ALLOWED_DIRECT_CONSOLE_FILES = new Set([
  'src/server/auth/createAuthUser.ts',
  'src/server/db/migrate.ts',
  'src/server/smoke/cli.ts',
]);

function parseLog(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') {
    throw new TypeError('Expected the server log to be a string');
  }
  const result = safeParseJson(value);
  assert.equal(result.success, true);
  if (!result.success) throw new Error('Expected a structured JSON log');
  assert.equal(typeof result.data, 'object');
  assert.notEqual(result.data, null);
  return result.data as Record<string, unknown>;
}

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(path)));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

test('structured server logs classify errors without serializing private details', () => {
  const privateValue = 'Bearer private-token-value';
  const error = new Error(`Provider failed with ${privateValue}`);
  Object.assign(error, {
    headers: { cookie: 'session=private-cookie' },
    connectionUrl: 'postgres://private-user:private-password@database/projex',
    responseBody: 'imported financial text',
    toJSON() {
      throw new Error('The raw error serializer must never be invoked');
    },
  });
  const messages: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
    messages.push(String(message));
  });

  logServerEvent({
    level: 'error',
    event: 'company_export_job_failed',
    error,
    fields: {
      requestId: 'req_safe',
      jobId: 'job_safe',
      authorization: privateValue,
      cookie: 'private-cookie',
      emailBody: 'private email body',
      resetLink: 'https://example.test/reset/private',
      importedFinancialText: 'private financial text',
    },
  });

  assert.equal(messages.length, 1);
  const rawLog = messages[0];
  const log = parseLog(rawLog);
  assert.deepEqual(log, {
    level: 'error',
    type: 'company_export_job_failed',
    category: 'operational',
    requestId: 'req_safe',
    jobId: 'job_safe',
    errorType: 'Error',
  });
  assert.doesNotMatch(
    String(rawLog),
    /private-token|private-cookie|private-password|financial|reset\/private/u
  );
});

test('structured server logging tolerates adversarial thrown values and fields', () => {
  const privateValue = 'proxy-private-value';
  const adversarialError = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error(privateValue);
      },
    }
  );
  const malformedFields = {
    requestId: 'req_proxy',
    nested: { privateValue },
    array: [privateValue],
    level: 'info',
    type: 'overridden',
    errorType: 'overridden',
  } as unknown as ServerLogFields;
  const messages: string[] = [];
  vi.spyOn(console, 'warn').mockImplementation((message?: unknown) => {
    messages.push(String(message));
  });

  logServerEvent({
    level: 'warn',
    event: 'Invalid event containing private-value',
    error: adversarialError,
    fields: malformedFields,
  });

  const rawLog = messages[0];
  assert.deepEqual(parseLog(rawLog), {
    level: 'warn',
    type: 'invalid_server_log_event',
    category: 'operational',
    requestId: 'req_proxy',
    errorType: 'UnknownThrownValue',
  });
  assert.doesNotMatch(String(rawLog), /proxy-private-value|overridden/u);
});

test('operational log level can suppress lower-priority output', () => {
  process.env.PROJEX_LOG_LEVEL = 'error';
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  logServerEvent({ level: 'info', event: 'suppressed_info_event' });
  logServerEvent({ level: 'warn', event: 'suppressed_warn_event' });
  logServerEvent({ level: 'error', event: 'retained_error_event' });

  assert.equal(info.mock.calls.length, 0);
  assert.equal(warn.mock.calls.length, 0);
  assert.equal(error.mock.calls.length, 1);
  assert.deepEqual(parseLog(error.mock.calls[0]?.[0]), {
    level: 'error',
    type: 'retained_error_event',
    category: 'operational',
  });
});

test('audit logging is independently switchable and sanitizes fields', () => {
  process.env.PROJEX_LOG_LEVEL = 'off';
  const messages: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((message?: unknown) => {
    messages.push(String(message));
  });

  logAuditEvent({ event: 'company.created', fields: { companyId: 'co_1' } });
  assert.equal(messages.length, 0);

  process.env.PROJEX_AUDIT_LOGGING = 'true';
  logAuditEvent({
    event: 'company.created',
    fields: {
      companyId: 'co_1',
      actorUserId: 'usr_1',
      reason: 'free-form content is not accepted by audit callers',
      privatePayload: 'private value',
    },
  });

  assert.equal(messages.length, 1);
  assert.deepEqual(parseLog(messages[0]), {
    level: 'info',
    type: 'company.created',
    category: 'audit',
    companyId: 'co_1',
    actorUserId: 'usr_1',
  });
  assert.doesNotMatch(messages[0]!, /free-form|private value/u);
});

test('mutation audit logs flush after success and are discarded on failure', async () => {
  process.env.PROJEX_AUDIT_LOGGING = 'true';
  const messages: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((message?: unknown) => {
    messages.push(String(message));
  });
  const event = {
    companyId: asCompanyId('co_1'),
    projectId: asProjectId('prj_1'),
    actorUserId: asUserId('usr_1'),
    eventClass: 'workflow' as const,
    eventType: 'transaction.locked',
    entityType: 'transaction',
    entityId: 'txn_1',
  };

  await withAuditLoggingTransaction(async () => {
    await recordAuditLogEvent(event);
    assert.equal(
      messages.length,
      0,
      'event must remain buffered before commit'
    );
  });
  assert.equal(messages.length, 1);
  assert.deepEqual(parseLog(messages[0]), {
    level: 'info',
    type: 'transaction.locked',
    category: 'audit',
    actorUserId: 'usr_1',
    companyId: 'co_1',
    projectId: 'prj_1',
    entityType: 'transaction',
    entityId: 'txn_1',
    eventClass: 'workflow',
    outcome: 'succeeded',
  });

  await assert.rejects(
    withAuditLoggingTransaction(async () => {
      await recordAuditLogEvent({
        ...event,
        eventType: 'transaction.reopened',
      });
      throw new Error('transaction rolled back');
    }),
    /transaction rolled back/u
  );
  assert.equal(messages.length, 1, 'rolled-back event must be discarded');
});

test('enabled mutation audit logging rejects calls without a transaction buffer', async () => {
  process.env.PROJEX_AUDIT_LOGGING = 'true';
  await assert.rejects(
    recordAuditLogEvent({
      companyId: asCompanyId('co_1'),
      actorUserId: asUserId('usr_1'),
      eventClass: 'lifecycle',
      eventType: 'company.created',
      entityType: 'company',
      entityId: 'co_1',
    }),
    /withAuditLoggingTransaction/u
  );
});

test('structured log entries have a hard serialized byte limit', () => {
  process.env.PROJEX_AUDIT_LOGGING = 'true';
  const messages: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((message?: unknown) => {
    messages.push(String(message));
  });
  const largeValue = '🙂'.repeat(600);

  logAuditEvent({
    event: 'transaction.imported',
    fields: {
      actorUserId: largeValue,
      companyId: largeValue,
      projectId: largeValue,
      entityType: largeValue,
      entityId: largeValue,
      eventClass: largeValue,
      outcome: largeValue,
      reasonCode: largeValue,
    },
  });

  assert.ok(
    new TextEncoder().encode(messages[0]).byteLength <= MAX_SERVER_LOG_BYTES
  );
  assert.deepEqual(parseLog(messages[0]), {
    level: 'info',
    type: 'server_log_entry_too_large',
    category: 'audit',
  });
});

test('auth email fallback never writes recipients, bodies, or links to logs', async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  delete process.env.PROJEX_AUTH_EMAIL_WEBHOOK_URL;
  const messages: string[] = [];
  vi.spyOn(console, 'info').mockImplementation((message?: unknown) => {
    messages.push(String(message));
  });

  const delivery = await sendAuthEmail({
    to: 'private-recipient@example.test',
    subject: 'Private reset subject',
    text: 'Reset at https://example.test/reset/private-token',
    html: '<a href="https://example.test/reset/private-token">Reset</a>',
  });

  assert.equal(delivery, 'log');
  assert.equal(messages.length, 1);
  const rawLog = messages[0];
  assert.deepEqual(parseLog(rawLog), {
    level: 'info',
    type: 'auth_email_delivery_unconfigured',
    category: 'operational',
  });
  assert.doesNotMatch(
    String(rawLog),
    /private-recipient|reset subject|private-token/u
  );
});

test('production TypeScript routes all console output through the logging boundary', async () => {
  const repositoryRoot = process.cwd();
  const directConsolePattern = /\bconsole\.(?:error|warn|info|log)\s*\(/u;
  const directConsoleFiles: string[] = [];

  for (const path of await collectTypeScriptFiles(
    resolve(repositoryRoot, 'src')
  )) {
    const source = await readFile(path, 'utf8');
    if (directConsolePattern.test(source)) {
      directConsoleFiles.push(relative(repositoryRoot, path));
    }
  }

  assert.deepEqual(
    directConsoleFiles.sort(),
    [...ALLOWED_DIRECT_CONSOLE_FILES].sort()
  );
});

test('the direct-Node migration graph resolves the logging boundary', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      "await import('./src/server/db/migrate.ts')",
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    }
  );

  assert.equal(
    result.status,
    0,
    `Direct migration import failed:\n${result.stderr || result.stdout}`
  );
});

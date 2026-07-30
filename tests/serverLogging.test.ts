import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { afterEach, test, vi } from 'vitest';

import {
  logServerEvent,
  type ServerLogFields,
} from '../src/api/serverLogging.ts';
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
    requestId: 'req_proxy',
    errorType: 'UnknownThrownValue',
  });
  assert.doesNotMatch(String(rawLog), /proxy-private-value|overridden/u);
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

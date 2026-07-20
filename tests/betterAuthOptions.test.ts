import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import { buildBetterAuthOptions } from '../src/server/auth/betterAuthInstance.ts';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

test('Better Auth trusts only the proxy-controlled client IP header', () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'test-secret';
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'http://localhost:3000';

  const options = buildBetterAuthOptions();

  assert.deepEqual(options.advanced?.ipAddress?.ipAddressHeaders, [
    'x-real-ip',
  ]);
});

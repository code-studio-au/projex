import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetServerStartupEnvValidationForTests,
  validateServerStartupEnv,
} from '../src/server/env.ts';
import { AppError } from '../src/api/errors.ts';

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
  __resetServerStartupEnvValidationForTests();
});

test('production env validation does not cache a failed validation attempt', () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = '';
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.BETTER_AUTH_URL = 'https://app.example.com';
  delete process.env.BETTER_AUTH_SESSION_URL;
  process.env.BETTER_AUTH_DIRECT_SESSION_FN =
    './dist/server/auth/authProvider.js#getSessionFromRequest';

  assert.throws(() => validateServerStartupEnv(), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'INTERNAL_ERROR');
    assert.match(error.message, /DATABASE_URL/);
    return true;
  });

  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  assert.doesNotThrow(() => validateServerStartupEnv());
});

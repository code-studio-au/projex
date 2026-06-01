import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetServerStartupEnvValidationForTests,
  validateServerStartupEnv,
} from '../src/server/env.ts';
import { AppError } from '../src/api/errors.ts';

const GENERIC_STARTUP_ENV_ERROR = 'Invalid server configuration';

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
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://app.example.com';

  assert.throws(() => validateServerStartupEnv(), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'INTERNAL_ERROR');
    assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
    return true;
  });

  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  assert.doesNotThrow(() => validateServerStartupEnv());
});

test('production env validation rejects dev and smoke tooling flags', () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.BETTER_AUTH_URL = 'https://app.example.com';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://app.example.com';

  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'true';
  assert.throws(() => validateServerStartupEnv(), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'INTERNAL_ERROR');
    assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
    return true;
  });

  __resetServerStartupEnvValidationForTests();
  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
  process.env.PROJEX_ENABLE_SMOKE_TOOLS = 'true';
  assert.throws(() => validateServerStartupEnv(), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'INTERNAL_ERROR');
    assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
    return true;
  });
});

test('production env validation requires trusted auth origins', () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.BETTER_AUTH_URL = 'https://app.example.com';
  delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;

  assert.throws(() => validateServerStartupEnv(), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'INTERNAL_ERROR');
    assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
    return true;
  });
});

test('production env validation rejects insecure auth urls and origins', () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'secret';

  process.env.BETTER_AUTH_URL = 'http://app.example.com';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://app.example.com';
  assert.throws(() => validateServerStartupEnv(), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'INTERNAL_ERROR');
    assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
    return true;
  });

  __resetServerStartupEnvValidationForTests();
  process.env.BETTER_AUTH_URL = 'https://app.example.com';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS =
    'https://app.example.com,http://evil.example.com';
  assert.throws(() => validateServerStartupEnv(), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'INTERNAL_ERROR');
    assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
    return true;
  });

  __resetServerStartupEnvValidationForTests();
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://app.example.com';
  process.env.PROJEX_AUTH_RESET_REDIRECT_URL =
    'http://app.example.com/reset-password';
  assert.throws(() => validateServerStartupEnv(), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'INTERNAL_ERROR');
    assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
    return true;
  });
});

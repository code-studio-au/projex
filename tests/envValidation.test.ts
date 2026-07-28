import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';

import {
  __resetServerStartupEnvValidationForTests,
  requireDatabaseUrl,
  validateServerStartupEnv,
} from '../src/server/env.ts';
import { AppError } from '../src/api/errors.ts';

const GENERIC_STARTUP_ENV_ERROR = 'Invalid server configuration';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.PROJEX_APP_BASE_URL = 'https://app.example.com';
});

afterEach(() => {
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
  process.env.PROJEX_AUTH_RESET_REDIRECT_URL =
    'https://app.example.com/reset-password';
  process.env.PROJEX_AUTH_EMAIL_CHANGE_REDIRECT_URL =
    'https://app.example.com/verify-email-change';
  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
  process.env.PROJEX_ENABLE_SMOKE_TOOLS = 'false';

  assert.throws(
    () => validateServerStartupEnv(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
      return true;
    }
  );

  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  assert.doesNotThrow(() => validateServerStartupEnv());
});

test('production env validation rejects dev and smoke tooling flags', () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.BETTER_AUTH_URL = 'https://app.example.com';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://app.example.com';
  process.env.PROJEX_ENABLE_SMOKE_TOOLS = 'false';

  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'true';
  assert.throws(
    () => validateServerStartupEnv(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
      return true;
    }
  );

  __resetServerStartupEnvValidationForTests();
  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
  process.env.PROJEX_ENABLE_SMOKE_TOOLS = 'true';
  assert.throws(
    () => validateServerStartupEnv(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
      return true;
    }
  );
});

test('production env validation requires trusted auth origins', () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.BETTER_AUTH_URL = 'https://app.example.com';
  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
  process.env.PROJEX_ENABLE_SMOKE_TOOLS = 'false';
  delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;

  assert.throws(
    () => validateServerStartupEnv(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
      return true;
    }
  );
});

test('production env validation rejects trusted origins that contain only delimiters or whitespace', () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.BETTER_AUTH_URL = 'https://app.example.com';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = ' , , ';
  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
  process.env.PROJEX_ENABLE_SMOKE_TOOLS = 'false';

  assert.throws(
    () => validateServerStartupEnv(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
      return true;
    }
  );
});

test('production env validation rejects a non-HTTPS public app URL', () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.BETTER_AUTH_URL = 'https://app.example.com';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://app.example.com';
  process.env.PROJEX_APP_BASE_URL = 'http://app.example.com';
  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
  process.env.PROJEX_ENABLE_SMOKE_TOOLS = 'false';

  assert.throws(
    () => validateServerStartupEnv(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
      return true;
    }
  );
});

test('production env validation rejects a missing required auth url', () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.BETTER_AUTH_URL = '   ';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://app.example.com';
  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
  process.env.PROJEX_ENABLE_SMOKE_TOOLS = 'false';

  assert.throws(
    () => validateServerStartupEnv(),
    /Invalid server configuration/
  );
});

test('production env validation rejects insecure auth urls and origins', () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
  process.env.PROJEX_ENABLE_SMOKE_TOOLS = 'false';

  process.env.BETTER_AUTH_URL = 'http://app.example.com';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://app.example.com';
  assert.throws(
    () => validateServerStartupEnv(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
      return true;
    }
  );

  __resetServerStartupEnvValidationForTests();
  process.env.BETTER_AUTH_URL = 'https://app.example.com';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS =
    'https://app.example.com,http://evil.example.com';
  assert.throws(
    () => validateServerStartupEnv(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
      return true;
    }
  );

  __resetServerStartupEnvValidationForTests();
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://app.example.com';
  process.env.PROJEX_AUTH_RESET_REDIRECT_URL =
    'http://app.example.com/reset-password';
  assert.throws(
    () => validateServerStartupEnv(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
      return true;
    }
  );
});

test('production env validation rejects invalid url formats and optional non-https redirect urls', () => {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
  process.env.PROJEX_ENABLE_SMOKE_TOOLS = 'false';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://app.example.com';

  process.env.BETTER_AUTH_URL = 'not a url';
  assert.throws(
    () => validateServerStartupEnv(),
    /Invalid server configuration/
  );

  __resetServerStartupEnvValidationForTests();
  process.env.BETTER_AUTH_URL = 'https://app.example.com';
  process.env.PROJEX_AUTH_EMAIL_CHANGE_REDIRECT_URL =
    'http://app.example.com/change';
  assert.throws(
    () => validateServerStartupEnv(),
    /Invalid server configuration/
  );
});

test('requireDatabaseUrl trims configured values and rejects blank values', () => {
  process.env.DATABASE_URL = '  postgres://localhost/projex_test  ';
  assert.equal(requireDatabaseUrl(), 'postgres://localhost/projex_test');

  process.env.DATABASE_URL = '   ';
  assert.throws(
    () => requireDatabaseUrl(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
      return true;
    }
  );

  delete process.env.DATABASE_URL;
  assert.throws(
    () => requireDatabaseUrl(),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'INTERNAL_ERROR');
      assert.equal(error.message, GENERIC_STARTUP_ENV_ERROR);
      return true;
    }
  );
});

test('non-production env validation is a no-op and successful production validation is cached', () => {
  process.env.NODE_ENV = 'development';
  delete process.env.DATABASE_URL;
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.BETTER_AUTH_URL;
  delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;

  assert.doesNotThrow(() => validateServerStartupEnv());

  __resetServerStartupEnvValidationForTests();
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/projex_test';
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.BETTER_AUTH_URL = 'https://app.example.com';
  process.env.BETTER_AUTH_TRUSTED_ORIGINS =
    ' https://app.example.com , https://admin.example.com ';
  process.env.PROJEX_AUTH_RESET_REDIRECT_URL =
    'https://app.example.com/reset-password';
  process.env.PROJEX_AUTH_EMAIL_CHANGE_REDIRECT_URL =
    'https://app.example.com/change-email';
  process.env.PROJEX_ENABLE_DEV_ENDPOINTS = 'false';
  process.env.PROJEX_ENABLE_SMOKE_TOOLS = 'false';

  assert.doesNotThrow(() => validateServerStartupEnv());

  process.env.BETTER_AUTH_URL = 'http://broken.example.com';
  assert.doesNotThrow(() => validateServerStartupEnv());
});

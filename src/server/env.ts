import { AppError } from '../api/errors.ts';

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function listMissing(required: Array<{ key: string; ok: boolean }>): string[] {
  return required.filter((r) => !r.ok).map((r) => r.key);
}

let startupValidated = false;

/**
 * Startup-level validation for server deployments.
 *
 * Strict checks only apply in production so local/dev/test flows remain ergonomic.
 */
export function validateServerStartupEnv(): void {
  if (startupValidated) return;
  startupValidated = true;

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) return;

  const missing = listMissing([
    { key: 'DATABASE_URL', ok: nonEmpty(process.env.DATABASE_URL) },
    { key: 'BETTER_AUTH_SECRET', ok: nonEmpty(process.env.BETTER_AUTH_SECRET) },
    { key: 'BETTER_AUTH_URL', ok: nonEmpty(process.env.BETTER_AUTH_URL) },
  ]);
  const hasEndpointAuth = nonEmpty(process.env.BETTER_AUTH_SESSION_URL);
  const hasDirectAuth = nonEmpty(process.env.BETTER_AUTH_DIRECT_SESSION_FN);
  if (!hasEndpointAuth && !hasDirectAuth) {
    missing.push('BETTER_AUTH_SESSION_URL or BETTER_AUTH_DIRECT_SESSION_FN');
  }

  if (process.env.PROJEX_ENABLE_DEV_ENDPOINTS === 'true') {
    throw new AppError(
      'INTERNAL_ERROR',
      'Invalid server config: PROJEX_ENABLE_DEV_ENDPOINTS must not be true in production'
    );
  }

  if (missing.length) {
    throw new AppError(
      'INTERNAL_ERROR',
      `Missing required production env var(s): ${missing.join(', ')}`
    );
  }
}

// Test-only helper to allow deterministic env-validation assertions.
export function __resetServerStartupEnvValidationForTests(): void {
  startupValidated = false;
}

/**
 * Runtime DB guard to produce a targeted error when DB access is attempted without config.
 */
export function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL ?? '';
  if (!value.trim()) {
    throw new AppError('INTERNAL_ERROR', 'DATABASE_URL is not set');
  }
  return value.trim();
}

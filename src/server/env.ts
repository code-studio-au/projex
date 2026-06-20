import { AppError } from '../api/errors.ts';

const GENERIC_STARTUP_ENV_ERROR = 'Invalid server configuration';

function throwStartupEnvError(
  reason: string,
  detail?: Record<string, unknown>
) {
  console.error(
    JSON.stringify({
      level: 'error',
      type: 'startup_env_validation',
      reason,
      nodeEnv: process.env.NODE_ENV ?? null,
      detail: detail ?? null,
    })
  );
  throw new AppError('INTERNAL_ERROR', GENERIC_STARTUP_ENV_ERROR);
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function listMissing(required: Array<{ key: string; ok: boolean }>): string[] {
  return required.filter((r) => !r.ok).map((r) => r.key);
}

function parseHttpsUrl(
  value: string | undefined,
  options?: { required?: boolean; label?: string }
): URL | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    if (options?.required) {
      throwStartupEnvError('missing_required_https_url', {
        key: options.label ?? 'unknown',
      });
    }
    return null;
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(trimmed);
  } catch {
    throwStartupEnvError('invalid_url_format', {
      key: options?.label ?? 'unknown',
    });
  }

  if (!parsed || parsed.protocol !== 'https:') {
    throwStartupEnvError('non_https_url', {
      key: options?.label ?? 'unknown',
      protocol: parsed?.protocol ?? null,
    });
  }

  return parsed;
}

let startupValidated = false;

/**
 * Startup-level validation for server deployments.
 *
 * Strict checks only apply in production so local/dev/test flows remain ergonomic.
 */
export function validateServerStartupEnv(): void {
  if (startupValidated) return;

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) return;

  const missing = listMissing([
    { key: 'DATABASE_URL', ok: nonEmpty(process.env.DATABASE_URL) },
    { key: 'BETTER_AUTH_SECRET', ok: nonEmpty(process.env.BETTER_AUTH_SECRET) },
    { key: 'BETTER_AUTH_URL', ok: nonEmpty(process.env.BETTER_AUTH_URL) },
  ]);
  if (!nonEmpty(process.env.BETTER_AUTH_TRUSTED_ORIGINS)) {
    missing.push('BETTER_AUTH_TRUSTED_ORIGINS');
  }

  if (process.env.PROJEX_ENABLE_DEV_ENDPOINTS === 'true') {
    throwStartupEnvError('dev_endpoints_enabled');
  }

  if (process.env.PROJEX_ENABLE_SMOKE_TOOLS === 'true') {
    throwStartupEnvError('smoke_tools_enabled');
  }

  if (missing.length) {
    throwStartupEnvError('missing_required_env', { missing });
  }

  parseHttpsUrl(process.env.BETTER_AUTH_URL, {
    required: true,
    label: 'BETTER_AUTH_URL',
  });
  parseHttpsUrl(process.env.PROJEX_AUTH_RESET_REDIRECT_URL, {
    label: 'PROJEX_AUTH_RESET_REDIRECT_URL',
  });
  parseHttpsUrl(process.env.PROJEX_AUTH_EMAIL_CHANGE_REDIRECT_URL, {
    label: 'PROJEX_AUTH_EMAIL_CHANGE_REDIRECT_URL',
  });

  for (const origin of (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)) {
    parseHttpsUrl(origin, {
      required: true,
      label: 'BETTER_AUTH_TRUSTED_ORIGINS',
    });
  }

  startupValidated = true;
}

// Test-only helper to allow deterministic env-validation assertions.
export function __resetServerStartupEnvValidationForTests(): void {
  startupValidated = false;
}

/**
 * Runtime DB guard to fail closed when DB access is attempted without config.
 */
export function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL ?? '';
  if (!value.trim()) {
    throw new AppError('INTERNAL_ERROR', GENERIC_STARTUP_ENV_ERROR);
  }
  return value.trim();
}

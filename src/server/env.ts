import { AppError } from '../api/errors.ts';
import { logServerEvent, type ServerLogFields } from '../api/serverLogging.ts';

const GENERIC_STARTUP_ENV_ERROR = 'Invalid server configuration';

function throwStartupEnvError(reason: string, fields?: ServerLogFields) {
  logServerEvent({
    level: 'error',
    event: 'startup_env_validation',
    fields: {
      reason,
      // This helper only runs from production validation paths.
      nodeEnv: process.env.NODE_ENV,
      ...fields,
    },
  });
  throw new AppError('INTERNAL_ERROR', GENERIC_STARTUP_ENV_ERROR);
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function listMissing(required: Array<{ key: string; ok: boolean }>): string[] {
  return required.flatMap((requirement) =>
    requirement.ok ? [] : [requirement.key]
  );
}

function parseTrustedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function validateOptionalEnumEnv(
  name: string,
  allowedValues: readonly string[]
): void {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value || allowedValues.includes(value)) return;
  throwStartupEnvError('invalid_config_value', { configKey: name });
}

function parseHttpsUrl(
  value: string | undefined,
  options: { required?: boolean; label: string }
): URL | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    if (options?.required) {
      throwStartupEnvError('missing_required_https_url', {
        configKey: options.label,
      });
    }
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throwStartupEnvError('invalid_url_format', {
      configKey: options.label,
    });
    throw new Error('unreachable');
  }

  if (parsed.protocol !== 'https:') {
    throwStartupEnvError('non_https_url', {
      configKey: options.label,
      protocol: parsed.protocol,
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
  ]);
  const trustedOrigins = parseTrustedOrigins(
    process.env.BETTER_AUTH_TRUSTED_ORIGINS
  );
  if (!trustedOrigins.length) {
    missing.push('BETTER_AUTH_TRUSTED_ORIGINS');
  }

  if (process.env.PROJEX_ENABLE_DEV_ENDPOINTS === 'true') {
    throwStartupEnvError('dev_endpoints_enabled');
  }

  if (process.env.PROJEX_ENABLE_SMOKE_TOOLS === 'true') {
    throwStartupEnvError('smoke_tools_enabled');
  }

  validateOptionalEnumEnv('PROJEX_LOG_LEVEL', ['off', 'error', 'warn', 'info']);
  validateOptionalEnumEnv('PROJEX_AUDIT_LOGGING', ['true', 'false']);

  if (missing.length) {
    throwStartupEnvError('missing_required_env', {
      missingConfigCount: missing.length,
    });
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
  parseHttpsUrl(process.env.PROJEX_APP_BASE_URL, {
    label: 'PROJEX_APP_BASE_URL',
  });

  for (const origin of trustedOrigins) {
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

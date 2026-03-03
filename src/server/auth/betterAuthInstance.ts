import { betterAuth } from 'better-auth';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import type { BetterAuthOptions } from 'better-auth';
import { getDb } from '../db/db.ts';

export type BetterAuthSessionApi = ReturnType<typeof betterAuth>;

let authInstance: BetterAuthSessionApi | undefined;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `BetterAuth is not configured. Missing required env var: ${name}`
    );
  }
  return value;
}

function optionalCsvEnv(name: string): string[] {
  const raw = process.env[name]?.trim() ?? '';
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Lazily builds the BetterAuth instance from environment variables.
 *
 * Required env vars (for direct auth mode):
 * - BETTER_AUTH_SECRET
 * - BETTER_AUTH_URL
 */
export function buildBetterAuthOptions(): BetterAuthOptions {
  const secret = requireEnv('BETTER_AUTH_SECRET');
  const baseURL = requireEnv('BETTER_AUTH_URL');
  const trustedOrigins = optionalCsvEnv('BETTER_AUTH_TRUSTED_ORIGINS');

  return {
    secret,
    baseURL,
    trustedOrigins: trustedOrigins.length ? trustedOrigins : undefined,
    database: {
      db: getDb(),
      type: 'postgres',
    },
    user: { modelName: 'ba_user' },
    session: { modelName: 'ba_session' },
    account: { modelName: 'ba_account' },
    verification: { modelName: 'ba_verification' },
    rateLimit: { modelName: 'ba_rate_limit' },
    emailAndPassword: { enabled: true },
    plugins: [tanstackStartCookies()],
  };
}

export function getBetterAuthInstance(): BetterAuthSessionApi {
  if (authInstance) return authInstance;

  authInstance = betterAuth(buildBetterAuthOptions());

  return authInstance;
}

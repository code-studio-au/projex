import { betterAuth } from 'better-auth';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import type { BetterAuthOptions } from 'better-auth';
import { getDb } from '../db/db.ts';
import { sendAuthEmail } from './email.ts';
import { AppError } from '../../api/errors.ts';
import { betterAuthSignUpResponseSchema } from '../../validation/authResponseSchemas.ts';
import { buildPasswordSetupEmailMessage } from '../email/authMessages.ts';

export type BetterAuthSessionApi = ReturnType<typeof betterAuth>;

let authInstance: BetterAuthSessionApi | undefined;
let trustedProvisioningAuthInstance: BetterAuthSessionApi | undefined;

type AuthInstancePurpose = 'public-handler' | 'trusted-provisioning';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError('INTERNAL_ERROR', 'Invalid server configuration');
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
function buildBetterAuthOptionsForPurpose(
  purpose: AuthInstancePurpose
): BetterAuthOptions {
  const secret = requireEnv('BETTER_AUTH_SECRET');
  const baseURL = requireEnv('BETTER_AUTH_URL');
  const trustedOrigins = optionalCsvEnv('BETTER_AUTH_TRUSTED_ORIGINS');

  return {
    secret,
    baseURL,
    trustedOrigins: trustedOrigins.length ? trustedOrigins : undefined,
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['x-real-ip'],
      },
    },
    database: {
      db: getDb(),
      type: 'postgres',
    },
    user: { modelName: 'ba_user' },
    session: { modelName: 'ba_session' },
    account: { modelName: 'ba_account' },
    verification: { modelName: 'ba_verification' },
    rateLimit: { modelName: 'ba_rate_limit' },
    emailAndPassword: {
      enabled: true,
      disableSignUp: purpose === 'public-handler',
      async sendResetPassword({ user, url }) {
        const message = buildPasswordSetupEmailMessage({
          recipientName: user.name,
          recipientEmail: user.email,
          url,
        });
        await sendAuthEmail({
          to: user.email,
          ...message,
        });
      },
    },
    plugins: [tanstackStartCookies()],
  };
}

export function buildBetterAuthOptions(): BetterAuthOptions {
  return buildBetterAuthOptionsForPurpose('public-handler');
}

export function getBetterAuthInstance(): BetterAuthSessionApi {
  if (authInstance) return authInstance;

  authInstance = betterAuth(buildBetterAuthOptions());

  return authInstance;
}

function getTrustedProvisioningAuthInstance(): BetterAuthSessionApi {
  if (trustedProvisioningAuthInstance) {
    return trustedProvisioningAuthInstance;
  }

  trustedProvisioningAuthInstance = betterAuth(
    buildBetterAuthOptionsForPurpose('trusted-provisioning')
  );
  return trustedProvisioningAuthInstance;
}

/**
 * Creates a credential-bearing BetterAuth user from trusted server-only
 * workflows. This auth instance is never exposed through an HTTP handler.
 */
export async function provisionBetterAuthCredentialUser(input: {
  email: string;
  password: string;
  name: string;
}) {
  const response = await getTrustedProvisioningAuthInstance().api.signUpEmail({
    body: input,
  });
  const payload = betterAuthSignUpResponseSchema.parse(response);
  return {
    id: payload.user.id,
    email: payload.user.email ?? input.email,
    name: payload.user.name ?? input.name,
  };
}

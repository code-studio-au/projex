import { AppError } from '../../api/errors.ts';

export function getPublicAppBaseUrl(): string | null {
  return (
    process.env.PROJEX_APP_BASE_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    null
  );
}

export function requireBetterAuthBaseUrl(context: string): string {
  const baseUrl = process.env.BETTER_AUTH_URL?.trim();
  if (baseUrl) return baseUrl;

  throw new AppError(
    'INTERNAL_ERROR',
    `Missing BETTER_AUTH_URL while ${context}`
  );
}

export function getAuthRedirectUrl(args: {
  configuredUrl: string | undefined;
  fallbackPath: string;
  context: string;
}): string {
  const configuredUrl = args.configuredUrl?.trim();
  if (configuredUrl) return configuredUrl;
  return new URL(
    args.fallbackPath,
    requireBetterAuthBaseUrl(args.context)
  ).toString();
}

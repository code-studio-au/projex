import { afterEach, describe, expect, test } from 'vitest';
import {
  getAuthRedirectUrl,
  getPublicAppBaseUrl,
  requireBetterAuthBaseUrl,
} from '../src/server/email/urls.ts';

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
});

describe('email URL resolution', () => {
  test('prefers the explicit public app origin and falls back to auth', () => {
    process.env.PROJEX_APP_BASE_URL = 'https://public.example.com';
    process.env.BETTER_AUTH_URL = 'https://auth.example.com';
    expect(getPublicAppBaseUrl()).toBe('https://public.example.com');

    delete process.env.PROJEX_APP_BASE_URL;
    expect(getPublicAppBaseUrl()).toBe('https://auth.example.com');
  });

  test('builds auth redirect fallbacks from the shared auth origin', () => {
    process.env.BETTER_AUTH_URL = 'https://app.example.com';
    expect(
      getAuthRedirectUrl({
        configuredUrl: undefined,
        fallbackPath: '/reset-password',
        context: 'preparing a reset link',
      })
    ).toBe('https://app.example.com/reset-password');
  });

  test('fails closed when an auth URL is required but missing', () => {
    delete process.env.BETTER_AUTH_URL;
    expect(() => requireBetterAuthBaseUrl('preparing an email')).toThrow(
      'Missing BETTER_AUTH_URL while preparing an email'
    );
  });
});

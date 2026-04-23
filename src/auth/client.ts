import { betterAuthLikePayloadSchema } from '../validation/responseSchemas';

type AuthError = {
  code?: string;
  message?: string;
};

type AuthResult<T> = {
  data: T | null;
  error: AuthError | null;
};

type SignInEmailInput = {
  email: string;
  password: string;
};

const fallbackBaseURL =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
const configuredBaseURL = String(import.meta.env.VITE_BETTER_AUTH_URL ?? fallbackBaseURL);

function authUrl(path: string): string {
  return new URL(path, configuredBaseURL).toString();
}

function parseAuthBody(text: string): { error?: AuthError; message?: string } | Record<string, unknown> | null {
  if (!text) return null;

  try {
    const parsed = betterAuthLikePayloadSchema.safeParse(JSON.parse(text) as unknown);
    return parsed.success ? (parsed.data as Record<string, unknown> | null) : null;
  } catch {
    return null;
  }
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<AuthResult<T>> {
  const res = await fetch(authUrl(path), {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const body = parseAuthBody(text);

  if (!res.ok) {
    const authError =
      body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object'
        ? (body.error as AuthError)
        : null;
    const authMessage =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : null;
    return {
      data: null,
      error: authError ?? { message: authMessage ?? `Request failed (${res.status})` },
    };
  }

  return {
    data: (body as T | null) ?? null,
    error: null,
  };
}

export const authClient = {
  signIn: {
    email(input: SignInEmailInput) {
      return authFetch<unknown>('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
  },
};

export async function signOutAuth(): Promise<void> {
  const result = await authFetch<unknown>('/api/auth/sign-out', {
    method: 'POST',
    body: JSON.stringify({}),
  });

  if (result.error) {
    throw new Error(result.error.message ?? 'Sign out failed');
  }
}

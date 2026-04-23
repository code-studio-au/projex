import {
  authClientErrorResponseSchema,
  authClientSignInResponseSchema,
  authClientSignOutResponseSchema,
  type AuthClientError,
} from '../validation/responseSchemas';

type AuthResult = {
  data: unknown;
  error: AuthClientError | null;
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

function parseAuthBody(text: string): unknown {
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseAuthError(body: unknown): AuthClientError | null {
  const parsed = authClientErrorResponseSchema.safeParse(body);
  if (!parsed.success || !parsed.data) return null;

  if (parsed.data.error) return parsed.data.error;
  if (parsed.data.message) return { message: parsed.data.message };
  return null;
}

async function authFetch(path: string, init?: RequestInit): Promise<{ body: unknown; error: AuthClientError | null }> {
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
    return {
      body: null,
      error: parseAuthError(body) ?? { message: `Request failed (${res.status})` },
    };
  }

  return {
    body,
    error: null,
  };
}

export const authClient = {
  signIn: {
    async email(input: SignInEmailInput): Promise<AuthResult> {
      const result = await authFetch('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify(input),
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return {
        data: authClientSignInResponseSchema.parse(result.body),
        error: null,
      };
    },
  },
};

export async function signOutAuth(): Promise<void> {
  const result = await authFetch('/api/auth/sign-out', {
    method: 'POST',
    body: JSON.stringify({}),
  });

  if (result.error) {
    throw new Error(result.error.message ?? 'Sign out failed');
  }

  authClientSignOutResponseSchema.parse(result.body);
}

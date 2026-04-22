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

function parseAuthBody<T>(text: string): (T & { error?: AuthError; message?: string }) | null {
  if (!text) return null;

  try {
    return JSON.parse(text) as T & { error?: AuthError; message?: string };
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
  const body = parseAuthBody<T>(text);

  if (!res.ok) {
    return {
      data: null,
      error: body?.error ?? { message: body?.message ?? `Request failed (${res.status})` },
    };
  }

  return {
    data: body as T,
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

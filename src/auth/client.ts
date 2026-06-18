import { createAuthClient } from 'better-auth/react';

const fallbackBaseURL =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:3000';

const configuredBaseURL = String(
  import.meta.env.VITE_BETTER_AUTH_URL ?? fallbackBaseURL
);

export const authClient = createAuthClient({
  baseURL: configuredBaseURL,
  fetchOptions: {
    credentials: 'include',
  },
  sessionOptions: {
    refetchInterval: 0,
    refetchOnWindowFocus: true,
    refetchWhenOffline: false,
  },
});

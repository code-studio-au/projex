import { createAuthClient } from 'better-auth/react';

const fallbackBaseURL =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:3000';

export const authClient = createAuthClient({
  // Projex deploys frontend and auth endpoints on the same origin, so the
  // browser client should follow the current app origin instead of a separate
  // Vite-scoped base URL.
  baseURL: fallbackBaseURL,
  fetchOptions: {
    credentials: 'include',
  },
  sessionOptions: {
    refetchInterval: 0,
    refetchOnWindowFocus: true,
    refetchWhenOffline: false,
  },
});

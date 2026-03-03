import { createAuthClient } from 'better-auth/react';

const fallbackBaseURL =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BETTER_AUTH_URL ?? fallbackBaseURL,
});

export const getAuthSession = authClient.getSession;
export const signOutAuth = authClient.signOut;

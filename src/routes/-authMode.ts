const env = (import.meta as unknown as { env?: Record<string, string> }).env;

export const isServerAuthMode = env?.VITE_API_MODE === 'server';
export const isLocalAuthMode = !isServerAuthMode;

/**
 * Local auth relies on client-side seeded session state, so SSR cannot make a
 * meaningful auth decision. Keep this bypass strictly local-only.
 */
export function shouldBypassSsrAuthGuardForLocalMode() {
  return isLocalAuthMode && typeof window === 'undefined';
}

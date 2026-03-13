const env = (import.meta as unknown as { env?: Record<string, string> }).env;

export const isServerAuthMode = env?.VITE_API_MODE === 'server';

export function shouldSkipSsrAuthGuard() {
  return !isServerAuthMode && typeof window === 'undefined';
}

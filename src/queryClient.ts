import { QueryClient } from '@tanstack/react-query';

function createDefaultOptions() {
  return {
    queries: {
      // Local backend is synchronous; keep data “fresh” to avoid refetch spam.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 0,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  } as const;
}

let browserQueryClient: QueryClient | null = null;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: createDefaultOptions(),
  });
}

export function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient();
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

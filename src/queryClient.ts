import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
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
  },
});

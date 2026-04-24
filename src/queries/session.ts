import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ProjexApi } from '../api/contract';
import { useApi } from '../hooks/useApi';
import { qk } from './keys';

const env = (import.meta as unknown as { env?: Record<string, string> }).env;
const isServerMode = env?.VITE_API_MODE === 'server';

export function sessionQueryOptions(boundary: ProjexApi) {
  return {
    queryKey: qk.session(),
    queryFn: () => boundary.getSession(),
    // Session is an auth boundary; do not treat it as fresh for long.
    staleTime: 0,
  } as const;
}

export function useSessionQuery() {
  const api = useApi();
  return useQuery(sessionQueryOptions(api));
}

/**
 * When auth changes, user-scoped queries (companies/projects/etc) must be refreshed.
 * We keep the users list warm, but invalidate everything else.
 */
export async function refreshAfterAuthChange(queryClient: QueryClient) {
  // Drop any anonymous companies cache (pre-login), otherwise staleTime can keep it “fresh” post-login.
  queryClient.removeQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      q.queryKey[0] === 'companies' &&
      q.queryKey[1] === 'anonymous',
  });

  await queryClient.invalidateQueries({
    predicate: (q) => !(Array.isArray(q.queryKey) && q.queryKey[0] === 'users'),
  });
}

export async function clearProtectedDataAfterLogout(queryClient: QueryClient) {
  await queryClient.cancelQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      q.queryKey[0] !== 'users' &&
      q.queryKey[0] !== 'session',
  });

  queryClient.removeQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      q.queryKey[0] !== 'users' &&
      q.queryKey[0] !== 'session',
  });
}

export function useLogoutMutation() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: { deferCacheReset?: boolean }) => {
      if (isServerMode) {
        const { signOutAuth } = await import('../auth/client');
        await signOutAuth();
        return options;
      }
      await api.logout();
      return options;
    },
    onSuccess: async (options) => {
      if (options?.deferCacheReset) return;
      // Clear session cache immediately so guards stop treating the user as authed.
      queryClient.setQueryData(qk.session(), null);
      await clearProtectedDataAfterLogout(queryClient);
    },
  });
}

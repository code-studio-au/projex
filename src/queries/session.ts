import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from './keys';
import { getSessionServerFn } from '../server/start/functions/auth';

export function sessionQueryOptions() {
  return {
    queryKey: qk.session(),
    queryFn: () => getSessionServerFn(),
    // Session is an auth boundary; do not treat it as fresh for long.
    staleTime: 0,
  } as const;
}

export function useSessionQuery() {
  return useQuery(sessionQueryOptions());
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: { deferCacheReset?: boolean }) => {
      const { signOutAuth } = await import('../auth/client');
      await signOutAuth();
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

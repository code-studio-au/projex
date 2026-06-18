import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { authClient } from '../auth/client';
import { qk } from './keys';
import { getSessionServerFn } from '../server/start/functions/auth';

export function sessionQueryOptions() {
  return {
    queryKey: qk.session(),
    queryFn: () => getSessionServerFn(),
    // Session is an auth boundary, but a brief freshness window avoids
    // immediate duplicate refetches after route-level server preloading.
    staleTime: 5_000,
  } as const;
}

export function useSessionQuery() {
  const session = authClient.useSession();
  return {
    ...session,
    data: session.data?.user?.id
      ? { userId: session.data.user.id }
      : null,
    fetchStatus: session.isPending || session.isRefetching
      ? ('fetching' as const)
      : ('idle' as const),
    status: session.isPending
      ? ('pending' as const)
      : session.error
        ? ('error' as const)
        : ('success' as const),
  };
}

/**
 * When auth changes, user-scoped queries (companies/projects/etc) must be refreshed.
 */
export async function refreshAfterAuthChange(queryClient: QueryClient) {
  // Drop any anonymous caches (pre-login), otherwise staleTime can keep them
  // looking “fresh” after the auth boundary changes.
  queryClient.removeQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      ['companies', 'users', 'currentUser'].includes(String(q.queryKey[0])) &&
      q.queryKey[1] === 'anonymous',
  });

  await queryClient.invalidateQueries();
}

export async function clearProtectedDataAfterLogout(queryClient: QueryClient) {
  await queryClient.cancelQueries({
    predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] !== 'session',
  });

  queryClient.removeQueries({
    predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] !== 'session',
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options?: { deferCacheReset?: boolean }) => {
      const result = await authClient.signOut();
      if (result.error) {
        throw new Error(result.error.message ?? 'Sign out failed');
      }
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

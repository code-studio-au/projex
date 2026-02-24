import { useMutation, useQuery } from '@tanstack/react-query';

import type { ProjexApi } from '../api/contract';
import { api } from '../api';
import { qk } from './keys';
import { queryClient } from '../queryClient';
import type { UserId } from '../types';

export function sessionQueryOptions(boundary: ProjexApi) {
  return {
    queryKey: qk.session(),
    queryFn: () => boundary.getSession(),
    // Session is an auth boundary; do not treat it as fresh for long.
    staleTime: 0,
  } as const;
}

export function useSessionQuery() {
  return useQuery(sessionQueryOptions(api));
}

/**
 * When auth changes, user-scoped queries (companies/projects/etc) must be refreshed.
 * We keep the seeded users list warm, but invalidate everything else.
 */
async function refreshAfterAuthChange() {
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

export function useLoginMutation() {
  return useMutation({
    mutationFn: (userId: UserId) => api.loginAs(userId),
    onSuccess: async (session) => {
      // Ensure route guards see the new session immediately (router loaders use ensureQueryData).
      queryClient.setQueryData(qk.session(), session);
      await refreshAfterAuthChange();
    },
  });
}

export function useLogoutMutation() {
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: async () => {
      // Clear session cache immediately so guards stop treating the user as authed.
      queryClient.setQueryData(qk.session(), null);
      await refreshAfterAuthChange();
    },
  });
}

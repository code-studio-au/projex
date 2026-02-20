import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { qk } from './keys';
import { queryClient } from '../queryClient';
import type { UserId } from '../types';

export function useSessionQuery() {
  return useQuery({
    queryKey: qk.session(),
    queryFn: () => api.getSession(),
  });
}

/**
 * When auth changes, user-scoped queries (companies/projects/etc) must be refreshed.
 * We keep the seeded users list warm, but invalidate everything else.
 */
async function refreshAfterAuthChange() {
  // Drop any anonymous companies cache (pre-login), otherwise staleTime can keep it “fresh” post-login.
  queryClient.removeQueries({
    predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'companies' && q.queryKey[1] === 'anonymous',
  });

  await queryClient.invalidateQueries({
    predicate: (q) => !(Array.isArray(q.queryKey) && q.queryKey[0] === 'users'),
  });
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (userId: UserId) => api.loginAs(userId),
    onSuccess: async () => {
      await refreshAfterAuthChange();
    },
  });
}

export function useLogoutMutation() {
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: async () => {
      await refreshAfterAuthChange();
    },
  });
}

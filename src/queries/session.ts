import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ProjexApi } from '../api/contract';
import { useApi } from '../hooks/useApi';
import { qk } from './keys';
import type { UserId } from '../types';
import type { Session } from '../api/types';

const env = (import.meta as unknown as { env?: Record<string, string> }).env;
const isServerMode = env?.VITE_API_MODE === 'server';

function toSessionFromAuthClientResult(value: unknown): Session | null | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const root = value as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown> | null;
  if (!data || typeof data !== 'object') return undefined;

  const user = (data.user ?? null) as Record<string, unknown> | null;
  const userId =
    (user?.id as string | undefined) ??
    (data.userId as string | undefined) ??
    ((data.session as Record<string, unknown> | null)?.userId as string | undefined);

  if (!userId) return null;
  return { userId: userId as UserId };
}

export function sessionQueryOptions(boundary: ProjexApi) {
  return {
    queryKey: qk.session(),
    queryFn: async () => {
      if (isServerMode && typeof window !== 'undefined') {
        const { getAuthSession } = await import('../auth/client');
        const result = await getAuthSession();
        const session = toSessionFromAuthClientResult(result);
        if (typeof session !== 'undefined') return session;
      }
      return boundary.getSession();
    },
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
 * We keep the seeded users list warm, but invalidate everything else.
 */
async function refreshAfterAuthChange(queryClient: QueryClient) {
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
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: UserId) => api.loginAs(userId),
    onSuccess: async (session) => {
      // Ensure route guards see the new session immediately (router loaders use ensureQueryData).
      queryClient.setQueryData(qk.session(), session);
      await refreshAfterAuthChange(queryClient);
    },
  });
}

export function useLogoutMutation() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (isServerMode) {
        const { signOutAuth } = await import('../auth/client');
        await signOutAuth();
        return;
      }
      await api.logout();
    },
    onSuccess: async () => {
      // Clear session cache immediately so guards stop treating the user as authed.
      queryClient.setQueryData(qk.session(), null);
      await refreshAfterAuthChange(queryClient);
    },
  });
}

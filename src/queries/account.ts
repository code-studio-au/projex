import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from './keys';
import { useSessionQuery } from './session';
import {
  cancelEmailChangeServerFn,
  getCurrentUserServerFn,
  getPendingEmailChangeServerFn,
  requestEmailChangeServerFn,
  resendEmailChangeServerFn,
  updateCurrentUserProfileServerFn,
} from '../server/start/functions/account';

const accountKeys = {
  pendingEmailChange: (userId: string) =>
    ['account', 'pendingEmailChange', userId] as const,
};

export function useCurrentUserQuery() {
  const session = useSessionQuery();
  return useQuery(currentUserQueryOptions(session.data?.userId));
}

export function currentUserQueryOptions(userId?: string) {
  return {
    enabled: !!userId,
    queryKey: userId ? qk.currentUser(userId) : ['currentUser', 'anonymous'],
    queryFn: () => getCurrentUserServerFn(),
  } as const;
}

export function usePendingEmailChangeQuery() {
  const session = useSessionQuery();
  const userId = session.data?.userId;
  return useQuery(pendingEmailChangeQueryOptions(userId));
}

export function pendingEmailChangeQueryOptions(userId?: string) {
  return {
    enabled: !!userId,
    queryKey: userId
      ? accountKeys.pendingEmailChange(userId)
      : (['account', 'pendingEmailChange', 'anonymous'] as const),
    queryFn: () => getPendingEmailChangeServerFn(),
  } as const;
}

export function useUpdateCurrentUserProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      updateCurrentUserProfileServerFn({ data: input }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === 'users',
        }),
        qc.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === 'currentUser',
        }),
      ]);
    },
  });
}

export function useRequestEmailChangeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { newEmail: string }) =>
      requestEmailChangeServerFn({ data: input }),
    onSuccess: async () => {
      await qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === 'account' &&
          q.queryKey[1] === 'pendingEmailChange',
      });
    },
  });
}

export function useResendEmailChangeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resendEmailChangeServerFn(),
    onSuccess: async () => {
      await qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === 'account' &&
          q.queryKey[1] === 'pendingEmailChange',
      });
    },
  });
}

export function useCancelEmailChangeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cancelEmailChangeServerFn(),
    onSuccess: async () => {
      await qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === 'account' &&
          q.queryKey[1] === 'pendingEmailChange',
      });
    },
  });
}

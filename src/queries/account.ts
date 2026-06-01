import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from './keys';
import {
  cancelEmailChangeServerFn,
  getPendingEmailChangeServerFn,
  requestEmailChangeServerFn,
  resendEmailChangeServerFn,
  updateCurrentUserProfileServerFn,
} from '../server/start/functions/account';

const accountKeys = {
  pendingEmailChange: () => ['account', 'pendingEmailChange'] as const,
};

export function usePendingEmailChangeQuery() {
  return useQuery({
    queryKey: accountKeys.pendingEmailChange(),
    queryFn: () => getPendingEmailChangeServerFn(),
  });
}

export function useUpdateCurrentUserProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      updateCurrentUserProfileServerFn({ data: input }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.users() });
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
        queryKey: accountKeys.pendingEmailChange(),
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
        queryKey: accountKeys.pendingEmailChange(),
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
        queryKey: accountKeys.pendingEmailChange(),
      });
    },
  });
}

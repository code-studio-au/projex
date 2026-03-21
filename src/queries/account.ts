import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import { qk } from './keys';

const accountKeys = {
  pendingEmailChange: () => ['account', 'pendingEmailChange'] as const,
};

export function usePendingEmailChangeQuery() {
  const api = useApi();
  return useQuery({
    queryKey: accountKeys.pendingEmailChange(),
    queryFn: () => api.getPendingEmailChange(),
  });
}

export function useUpdateCurrentUserProfileMutation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => api.updateCurrentUserProfile(input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.users() });
    },
  });
}

export function useRequestEmailChangeMutation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { newEmail: string }) => api.requestEmailChange(input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountKeys.pendingEmailChange() });
    },
  });
}

export function useResendEmailChangeMutation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.resendEmailChange(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountKeys.pendingEmailChange() });
    },
  });
}

export function useCancelEmailChangeMutation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.cancelEmailChange(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: accountKeys.pendingEmailChange() });
    },
  });
}

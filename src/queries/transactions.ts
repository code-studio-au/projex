import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '../api';
import { qk } from './keys';
import { queryClient } from '../queryClient';
import { useQueryScopeUserId } from './scope';
import type { ProjectId, TxnId } from '../types';
import type { TxnCreateInput, TxnUpdateInput } from '../api/contract';

export function useTransactionsQuery(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.transactions(scopeUserId, projectId),
    queryFn: () => api.listTransactions(projectId),
  });
}

export function useCreateTxnMutation(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnCreateInput) => api.createTransaction(projectId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
    },
  });
}

export function useUpdateTxnMutation(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnUpdateInput) => api.updateTransaction(projectId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
    },
  });
}

export function useDeleteTxnMutation(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (txnId: TxnId) => api.deleteTransaction(projectId, txnId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
    },
  });
}

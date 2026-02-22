import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { qk } from './keys';
import { queryClient } from '../queryClient';
import type { ProjectId, TxnId } from '../types';
import type { TxnCreateInput, TxnUpdateInput } from '../api/contract';

export function useTransactionsQuery(projectId: ProjectId) {
  return useQuery({
    queryKey: qk.transactions(projectId),
    queryFn: () => api.listTransactions(projectId),
  });
}

export function useCreateTxnMutation(projectId: ProjectId) {
  return useMutation({
    mutationFn: (input: TxnCreateInput) => api.createTransaction(projectId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.transactions(projectId) });
    },
  });
}

export function useUpdateTxnMutation(projectId: ProjectId) {
  return useMutation({
    mutationFn: (input: TxnUpdateInput) => api.updateTransaction(projectId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.transactions(projectId) });
    },
  });
}

export function useDeleteTxnMutation(projectId: ProjectId) {
  return useMutation({
    mutationFn: (txnId: TxnId) => api.deleteTransaction(projectId, txnId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.transactions(projectId) });
    },
  });
}

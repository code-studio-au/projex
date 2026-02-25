import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import type { ProjectId, TxnId } from '../types';
import type { TxnCreateInput, TxnUpdateInput } from '../api/contract';

export function useTransactionsQuery(projectId: ProjectId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.transactions(scopeUserId, projectId),
    queryFn: () => api.listTransactions(projectId),
  });
}

export function useCreateTxnMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnCreateInput) => api.createTxn(projectId, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
    },
  });
}

export function useUpdateTxnMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnUpdateInput) => api.updateTxn(projectId, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
    },
  });
}

export function useDeleteTxnMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (txnId: TxnId) => api.deleteTxn(projectId, txnId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
    },
  });
}

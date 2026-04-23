import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import type { ProjectId, Txn, TxnId } from '../types';
import type { TxnCreateInput, TxnUpdateInput } from '../api/contract';
import { normalizeTxnPatch } from '../utils/transactions';

export function useTransactionsQuery(projectId: ProjectId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.transactions(scopeUserId, projectId),
    queryFn: () => api.listTransactions(projectId),
    placeholderData: keepPreviousData,
  });
}

export function useCreateTxnMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnCreateInput) => api.createTxn(projectId, input),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}

export function useUpdateTxnMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  const queryKey = qk.transactions(scopeUserId, projectId);
  return useMutation({
    mutationFn: (input: TxnUpdateInput) => api.updateTxn(projectId, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<Txn[]>(queryKey);
      const normalizedInput = normalizeTxnPatch(input);
      if (previous) {
        qc.setQueryData<Txn[]>(
          queryKey,
          previous.map((txn) =>
            txn.id === normalizedInput.id ? { ...txn, ...normalizedInput } : txn
          )
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
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
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}

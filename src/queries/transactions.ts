import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import type { ProjectId, Txn, TxnId } from '../types';
import type { TxnCreateInput, TxnUpdateInput } from '../api/contract';

function normalizeTxnUpdateForCache(input: TxnUpdateInput): Partial<Txn> & { id: TxnId } {
  return {
    ...input,
    externalId: input.externalId ?? undefined,
    categoryId: input.categoryId ?? undefined,
    subCategoryId: input.subCategoryId ?? undefined,
  };
}

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
      await qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
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
      const normalizedInput = normalizeTxnUpdateForCache(input);
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
      await qc.invalidateQueries({ queryKey });
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

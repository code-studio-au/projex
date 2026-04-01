import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import type { ProjectId, Txn, TxnId } from '../types';
import type { TxnCreateInput, TxnUpdateInput } from '../api/contract';

function normalizeTxnUpdateForCache(input: TxnUpdateInput): Partial<Txn> & { id: TxnId } {
  const next: Partial<Txn> & { id: TxnId } = { id: input.id };
  if (typeof input.companyId !== 'undefined') next.companyId = input.companyId;
  if (typeof input.projectId !== 'undefined') next.projectId = input.projectId;
  if (typeof input.date !== 'undefined') next.date = input.date;
  if (typeof input.item !== 'undefined') next.item = input.item;
  if (typeof input.description !== 'undefined') next.description = input.description;
  if (typeof input.amountCents !== 'undefined') next.amountCents = input.amountCents;
  if (typeof input.createdAt !== 'undefined') next.createdAt = input.createdAt;
  if (typeof input.updatedAt !== 'undefined') next.updatedAt = input.updatedAt;
  if (typeof input.companyDefaultMappingRuleId !== 'undefined') {
    next.companyDefaultMappingRuleId = input.companyDefaultMappingRuleId ?? undefined;
  }
  if (typeof input.codingSource !== 'undefined') next.codingSource = input.codingSource;
  if (typeof input.codingPendingApproval !== 'undefined') {
    next.codingPendingApproval = input.codingPendingApproval;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'externalId')) {
    next.externalId = input.externalId ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'categoryId')) {
    next.categoryId = input.categoryId ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'subCategoryId')) {
    next.subCategoryId = input.subCategoryId ?? undefined;
  }
  return next;
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

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import type { ProjectId, Txn, TxnId } from '../types';
import type {
  TxnListPageInput,
  TxnCreateInput,
  TxnSplitInput,
  TxnTransferInput,
  TxnUpdateInput,
  TxnWorkflowStateInput,
} from '../api/contract';
import { normalizeTxnPatch } from '../utils/transactions';
import {
  createTxnServerFn,
  deleteTxnServerFn,
  listTransactionsPageServerFn,
  listTransactionsServerFn,
  splitTxnServerFn,
  transferTxnServerFn,
  updateTxnServerFn,
  updateTxnWorkflowStateServerFn,
} from '../server/start/functions/transactionReads';

function toTransactionsPageServerQuery(input: TxnListPageInput) {
  return {
    mode: 'page' as const,
    pageIndex: input.pageIndex,
    pageSize: input.pageSize,
    sortField: input.sort?.field,
    sortDirection: input.sort?.direction,
    yearFilter: input.yearFilter ?? undefined,
    quarterFilter: input.quarterFilter ?? undefined,
    monthFilterKey: input.monthFilterKey ?? undefined,
    transactionView: input.transactionView ?? undefined,
    drilldownKind: input.drilldown?.kind,
    categoryId: input.drilldown?.categoryId,
    subCategoryId:
      input.drilldown?.kind === 'subcategory'
        ? input.drilldown.subCategoryId
        : undefined,
  };
}

export function useTransactionsQuery(
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(transactionsQueryOptions(scopeUserId, projectId, options));
}

export function transactionsQueryOptions(
  userId: string,
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  return {
    queryKey: qk.transactions(userId, projectId),
    queryFn: () => listTransactionsServerFn({ data: { projectId } }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  } as const;
}

export function useTransactionsPageQuery(
  projectId: ProjectId,
  input: TxnListPageInput,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(
    transactionsPageQueryOptions(scopeUserId, projectId, input, options)
  );
}

export function transactionsPageQueryOptions(
  userId: string,
  projectId: ProjectId,
  input: TxnListPageInput,
  options: { enabled?: boolean } = {}
) {
  return {
    queryKey: qk.transactionsPage(userId, projectId, input),
    queryFn: () =>
      listTransactionsPageServerFn({
        data: { projectId, query: toTransactionsPageServerQuery(input) },
      }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  } as const;
}

export function useCreateTxnMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnCreateInput) =>
      createTxnServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.transactions(scopeUserId, projectId),
        }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}

export function useUpdateTxnMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  const queryKey = qk.transactions(scopeUserId, projectId);
  return useMutation({
    mutationFn: (input: TxnUpdateInput) =>
      updateTxnServerFn({ data: { projectId, payload: input } }),
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
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (txnId: TxnId) =>
      deleteTxnServerFn({ data: { projectId, txnId } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.transactions(scopeUserId, projectId),
        }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}

export function useSplitTxnMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  const queryKey = qk.transactions(scopeUserId, projectId);
  return useMutation({
    mutationFn: (input: TxnSplitInput) =>
      splitTxnServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}

export function useTransferTxnMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  const sourceQueryKey = qk.transactions(scopeUserId, projectId);
  return useMutation({
    mutationFn: (input: TxnTransferInput) =>
      transferTxnServerFn({ data: { projectId, payload: input } }),
    onSuccess: async (_result, input) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: sourceQueryKey }),
        qc.invalidateQueries({
          queryKey: qk.transactions(scopeUserId, input.destinationProjectId),
        }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}

export function useUpdateTxnWorkflowStateMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  const queryKey = qk.transactions(scopeUserId, projectId);
  return useMutation({
    mutationFn: (input: TxnWorkflowStateInput) =>
      updateTxnWorkflowStateServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}

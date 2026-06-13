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
  TxnListSortDirection,
  TxnListSortField,
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
  listTransactionsServerFn,
  splitTxnServerFn,
  transferTxnServerFn,
  updateTxnServerFn,
  updateTxnWorkflowStateServerFn,
} from '../server/start/functions/transactionReads';
import type { TxnListPageResult } from '../api/contract';
import { AppError } from '../api/errors';

type TransactionsPageQueryParams = {
  mode: 'page';
  pageIndex: number;
  pageSize: number;
  sortField?: TxnListSortField;
  sortDirection?: TxnListSortDirection;
  yearFilter?: string;
  quarterFilter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  monthFilterKey?: string;
  transactionView?: TxnListPageInput['transactionView'];
  drilldownKind?: 'category' | 'subcategory';
  categoryId?: string;
  subCategoryId?: string;
};

export function toTransactionsPageQueryParams(
  input: TxnListPageInput
): TransactionsPageQueryParams {
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

async function fetchTransactionsPageViaApi(
  projectId: ProjectId,
  input: TxnListPageInput
): Promise<TxnListPageResult> {
  const query = toTransactionsPageQueryParams(input);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/transactions?${params.toString()}`,
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    }
  );
  const payload = (await res.json()) as
    | TxnListPageResult
    | { code?: string; message?: string };
  if (!res.ok) {
    throw new AppError(
      (typeof payload === 'object' && payload && 'code' in payload
        ? (payload.code as
            | 'UNAUTHENTICATED'
            | 'FORBIDDEN'
            | 'NOT_FOUND'
            | 'RATE_LIMITED'
            | 'VALIDATION_ERROR'
            | 'CONFLICT'
            | 'NOT_IMPLEMENTED'
            | 'INTERNAL_ERROR')
        : 'INTERNAL_ERROR') ?? 'INTERNAL_ERROR',
      (typeof payload === 'object' && payload && 'message' in payload
        ? payload.message
        : 'Could not load transactions page') ??
        'Could not load transactions page'
    );
  }
  return payload as TxnListPageResult;
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
  const queryParams = toTransactionsPageQueryParams(input);
  return {
    queryKey: qk.transactionsPage(userId, projectId, queryParams),
    queryFn: () => fetchTransactionsPageViaApi(projectId, input),
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

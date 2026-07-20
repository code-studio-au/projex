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
  TxnBulkActionInput,
  TxnBulkActionResult,
  TxnListPageInput,
  TxnListSortDirection,
  TxnListSortField,
  TxnCreateInput,
  TxnReversalActionInput,
  TxnReversalActionResult,
  TxnReversalMatchSuggestion,
  TxnSplitInput,
  TxnTransferInput,
  TxnUpdateInput,
  TxnWorkflowStateInput,
} from '../api/types';
import { normalizeTxnPatch } from '../utils/transactions';
import {
  readJsonResponseOrNull,
  readJsonResponseWithSchema,
} from '../utils/json';
import { txnListPageResultResponseSchema } from '../validation/responseSchemas';
import { apiErrorFromBody } from '../api/errorResponses';
import {
  createTxnServerFn,
  deleteTxnServerFn,
  getTransactionServerFn,
  listProjectTransactionSummaryServerFn,
  listTransactionsServerFn,
  splitTxnServerFn,
  transferTxnServerFn,
  bulkTxnActionServerFn,
  applyTxnReversalActionServerFn,
  listTxnReversalMatchSuggestionsServerFn,
  updateTxnServerFn,
  updateTxnWorkflowStateServerFn,
} from '../server/start/functions/transactionReads';
import type { TxnListPageResult } from '../api/types';

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

  if (!res.ok) {
    const body = await readJsonResponseOrNull(res);
    throw apiErrorFromBody(body, 'Could not load transactions page');
  }

  const payload = await readJsonResponseWithSchema(
    res,
    txnListPageResultResponseSchema
  );
  if (!payload.success) {
    throw apiErrorFromBody(
      null,
      'Transactions page response was not valid JSON'
    );
  }
  return payload.data satisfies TxnListPageResult;
}

export function useTransactionsQuery(
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(transactionsQueryOptions(scopeUserId, projectId, options));
}

export function useTransactionQuery(
  projectId: ProjectId,
  txnId: TxnId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(
    transactionQueryOptions(scopeUserId, projectId, txnId, options)
  );
}

export function transactionQueryOptions(
  userId: string,
  projectId: ProjectId,
  txnId: TxnId,
  options: { enabled?: boolean } = {}
) {
  return {
    queryKey: qk.transaction(userId, projectId, txnId),
    queryFn: () => getTransactionServerFn({ data: { projectId, txnId } }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  } as const;
}

export function useProjectTransactionSummaryQuery(
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(
    projectTransactionSummaryQueryOptions(scopeUserId, projectId, options)
  );
}

export function projectTransactionSummaryQueryOptions(
  userId: string,
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  return {
    queryKey: qk.transactionSummary(userId, projectId),
    queryFn: () =>
      listProjectTransactionSummaryServerFn({ data: { projectId } }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  } as const;
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

export async function invalidateProjectTransactionQueries(args: {
  qc: ReturnType<typeof useQueryClient>;
  scopeUserId: string;
  projectId: ProjectId;
}) {
  await Promise.all([
    args.qc.invalidateQueries({
      queryKey: qk.transactions(args.scopeUserId, args.projectId),
      exact: true,
    }),
    args.qc.invalidateQueries({
      queryKey: qk.transactionSummary(args.scopeUserId, args.projectId),
      exact: true,
    }),
    args.qc.invalidateQueries({
      queryKey: ['transactions', args.scopeUserId, args.projectId, 'by-id'],
      exact: false,
    }),
    args.qc.invalidateQueries({
      queryKey: ['transactions', args.scopeUserId, args.projectId, 'page'],
      exact: false,
    }),
    args.qc.invalidateQueries({
      queryKey: [
        'transactionCommentSummaries',
        args.scopeUserId,
        args.projectId,
      ],
      exact: false,
    }),
    args.qc.invalidateQueries({
      queryKey: ['transactionComments', args.scopeUserId, args.projectId],
      exact: false,
    }),
    args.qc.invalidateQueries({
      queryKey: qk.companySummaries(args.scopeUserId),
    }),
  ]);
}

export function useCreateTxnMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnCreateInput) =>
      createTxnServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () =>
      invalidateProjectTransactionQueries({ qc, scopeUserId, projectId }),
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
    onSuccess: async () =>
      invalidateProjectTransactionQueries({ qc, scopeUserId, projectId }),
  });
}

export function useDeleteTxnMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (txnId: TxnId) =>
      deleteTxnServerFn({ data: { projectId, txnId } }),
    onSuccess: async () =>
      invalidateProjectTransactionQueries({ qc, scopeUserId, projectId }),
  });
}

export function useSplitTxnMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnSplitInput) =>
      splitTxnServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () =>
      invalidateProjectTransactionQueries({ qc, scopeUserId, projectId }),
  });
}

export function useTransferTxnMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnTransferInput) =>
      transferTxnServerFn({ data: { projectId, payload: input } }),
    onSuccess: async (_result, input) => {
      await Promise.all([
        invalidateProjectTransactionQueries({ qc, scopeUserId, projectId }),
        invalidateProjectTransactionQueries({
          qc,
          scopeUserId,
          projectId: input.destinationProjectId,
        }),
      ]);
    },
  });
}

export function useUpdateTxnWorkflowStateMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnWorkflowStateInput) =>
      updateTxnWorkflowStateServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () =>
      invalidateProjectTransactionQueries({ qc, scopeUserId, projectId }),
  });
}

export function useBulkTxnActionMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnBulkActionInput): Promise<TxnBulkActionResult> =>
      bulkTxnActionServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () =>
      invalidateProjectTransactionQueries({ qc, scopeUserId, projectId }),
  });
}

export function useTxnReversalSuggestionsMutation(projectId: ProjectId) {
  return useMutation({
    mutationFn: (txnId: TxnId): Promise<TxnReversalMatchSuggestion[]> =>
      listTxnReversalMatchSuggestionsServerFn({ data: { projectId, txnId } }),
  });
}

export function useTxnReversalActionMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (
      input: TxnReversalActionInput
    ): Promise<TxnReversalActionResult> =>
      applyTxnReversalActionServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () =>
      invalidateProjectTransactionQueries({ qc, scopeUserId, projectId }),
  });
}

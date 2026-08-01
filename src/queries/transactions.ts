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
  TxnBulkSelectionResult,
  TxnBulkActionInput,
  TxnBulkActionResult,
  TxnListFilterInput,
  TxnListPageInput,
  TxnListSortDirection,
  TxnListSortField,
  TxnReversalActionInput,
  TxnReversalActionResult,
  TxnReversalMatchSuggestion,
  TxnSplitInput,
  TxnTransferInput,
  TxnUpdateInput,
  TxnWorkflowStateInput,
  TxnUnlockRequestInput,
  TxnUnlockResolutionInput,
} from '../api/types';
import {
  applyNormalizedTxnPatch,
  normalizeTxnPatch,
} from '../utils/transactions';
import {
  readJsonResponseOrNull,
  readJsonResponseWithSchema,
} from '../utils/json';
import {
  txnBulkSelectionResultResponseSchema,
  txnListPageResultResponseSchema,
} from '../validation/transactionResponseSchemas';
import { apiErrorFromBody } from '../api/errorResponses';
import {
  getTransactionServerFn,
  listProjectTransactionSummaryServerFn,
  splitTxnServerFn,
  transferTxnServerFn,
  bulkTxnActionServerFn,
  applyTxnReversalActionServerFn,
  listTxnReversalMatchSuggestionsServerFn,
  updateTxnServerFn,
  updateTxnWorkflowStateServerFn,
  requestTxnUnlockServerFn,
  resolveTxnUnlockRequestServerFn,
} from '../server/start/functions/transactionReads';
import type { TxnListPageResult } from '../api/types';
import { transactionUpdateMutationScope } from './mutationScopes';
import { omitUndefinedProperties } from '../utils/optionalProperties';

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
  search?: string;
  drilldownKind?: 'category' | 'subcategory';
  categoryId?: string;
  subCategoryId?: string;
};

type TransactionsSelectionQueryParams = Omit<
  TransactionsPageQueryParams,
  'mode' | 'pageIndex' | 'pageSize'
> & { mode: 'selection' };

function toTransactionsPageQueryParams(
  input: TxnListPageInput
): TransactionsPageQueryParams {
  return omitUndefinedProperties({
    mode: 'page' as const,
    pageIndex: input.pageIndex,
    pageSize: input.pageSize,
    sortField: input.sort?.field,
    sortDirection: input.sort?.direction,
    yearFilter: input.yearFilter ?? undefined,
    quarterFilter: input.quarterFilter ?? undefined,
    monthFilterKey: input.monthFilterKey ?? undefined,
    transactionView: input.transactionView ?? undefined,
    search: input.search?.trim() || undefined,
    drilldownKind: input.drilldown?.kind,
    categoryId: input.drilldown?.categoryId,
    subCategoryId:
      input.drilldown?.kind === 'subcategory'
        ? input.drilldown.subCategoryId
        : undefined,
  });
}

function toTransactionsSelectionQueryParams(
  input: TxnListFilterInput
): TransactionsSelectionQueryParams {
  return omitUndefinedProperties({
    mode: 'selection' as const,
    sortField: input.sort?.field,
    sortDirection: input.sort?.direction,
    yearFilter: input.yearFilter ?? undefined,
    quarterFilter: input.quarterFilter ?? undefined,
    monthFilterKey: input.monthFilterKey ?? undefined,
    transactionView: input.transactionView ?? undefined,
    search: input.search?.trim() || undefined,
    drilldownKind: input.drilldown?.kind,
    categoryId: input.drilldown?.categoryId,
    subCategoryId:
      input.drilldown?.kind === 'subcategory'
        ? input.drilldown.subCategoryId
        : undefined,
  });
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

async function fetchTransactionsSelectionViaApi(
  projectId: ProjectId,
  input: TxnListFilterInput
): Promise<TxnBulkSelectionResult> {
  const query = toTransactionsSelectionQueryParams(input);
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
    throw apiErrorFromBody(body, 'Could not select filtered transactions');
  }

  const payload = await readJsonResponseWithSchema(
    res,
    txnBulkSelectionResultResponseSchema
  );
  if (!payload.success) {
    throw apiErrorFromBody(
      null,
      'Transaction selection response was not valid JSON'
    );
  }
  return payload.data satisfies TxnBulkSelectionResult;
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

function transactionQueryOptions(
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

function projectTransactionSummaryQueryOptions(
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

export function useTransactionsBulkSelectionMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnListFilterInput) =>
      fetchTransactionsSelectionViaApi(projectId, input),
    onSuccess: (selection, input) => {
      qc.setQueryData(
        qk.transactionsPage(
          scopeUserId,
          projectId,
          toTransactionsSelectionQueryParams(input)
        ),
        selection
      );
    },
  });
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
    placeholderData: keepPreviousData,
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
    args.qc.invalidateQueries({
      queryKey: qk.companyWorkQueues(args.scopeUserId),
    }),
  ]);
}

export function useUpdateTxnMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  const queryKey = qk.transactions(scopeUserId, projectId);
  return useMutation({
    scope: transactionUpdateMutationScope(projectId),
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
            txn.id === normalizedInput.id
              ? applyNormalizedTxnPatch(txn, normalizedInput)
              : txn
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

export function useRequestTxnUnlockMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnUnlockRequestInput) =>
      requestTxnUnlockServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () =>
      invalidateProjectTransactionQueries({ qc, scopeUserId, projectId }),
  });
}

export function useResolveTxnUnlockRequestMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: TxnUnlockResolutionInput) =>
      resolveTxnUnlockRequestServerFn({ data: { projectId, payload: input } }),
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
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (txnId: TxnId): Promise<TxnReversalMatchSuggestion[]> =>
      listTxnReversalMatchSuggestionsServerFn({ data: { projectId, txnId } }),
    onSuccess: (suggestions, txnId) => {
      qc.setQueryData(
        qk.transactionReversalSuggestions(scopeUserId, projectId, txnId),
        suggestions
      );
    },
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

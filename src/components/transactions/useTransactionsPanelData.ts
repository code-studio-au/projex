import { useMemo } from 'react';
import type {
  MRT_PaginationState,
  MRT_SortingState,
} from 'mantine-react-table-open';
import type { TxnBulkSelectionRow } from '../../api/types';
import type { TaxonomyHook } from '../../hooks/useTaxonomy';
import type {
  ProjectId,
  TransactionDrilldownFilter,
  Txn,
  TxnId,
} from '../../types';
import { asCategoryId, asTxnId } from '../../types/ids';
import { transactionCanBeLocked } from '../../utils/transactionWorkflow';
import {
  useTransactionCommentsQuery,
  useTransactionCommentSummariesQuery,
} from '../../queries/transactionComments';
import {
  useTransactionQuery,
  useTransactionsPageQuery,
} from '../../queries/transactions';
import type { QuarterOption } from './transactionsPanelUtils';
import type { TransactionView } from './transactionViews';

const EMPTY_TXNS: Txn[] = [];

export function useTransactionsPanelData(args: {
  projectId: ProjectId;
  taxonomy: TaxonomyHook;
  yearFilter: string | null;
  quarterFilter: QuarterOption | null;
  monthFilterKey: string | null;
  transactionView: TransactionView;
  transactionSearch: string;
  transactionDrilldown?: TransactionDrilldownFilter | null;
  initialCommentTxnId?: TxnId | null;
  dismissedLinkedCommentTxnId: TxnId | null;
  expandedCommentsTxn: Txn | null;
  bulkRecodeCategoryId: string | null;
  isHydrated: boolean;
  pagination: MRT_PaginationState;
  sorting: MRT_SortingState;
  rowSelection: Record<string, boolean>;
  bulkSelectionRows: TxnBulkSelectionRow[] | null;
}) {
  const transactionsPageInput = useMemo(() => {
    const sortField =
      args.sorting[0]?.id === 'transaction' ||
      args.sorting[0]?.id === 'amountCents' ||
      args.sorting[0]?.id === 'date'
        ? args.sorting[0].id
        : 'date';
    return {
      pageIndex: args.pagination.pageIndex,
      pageSize: args.pagination.pageSize,
      sort: {
        field: sortField,
        direction: args.sorting[0]?.desc ? 'desc' : 'asc',
      } as const,
      yearFilter: args.yearFilter,
      quarterFilter: args.quarterFilter,
      monthFilterKey: args.monthFilterKey,
      transactionView: args.transactionView,
      search: args.transactionSearch.trim() || undefined,
      drilldown: args.transactionDrilldown
        ? args.transactionDrilldown.kind === 'subcategory'
          ? {
              kind: 'subcategory' as const,
              categoryId: args.transactionDrilldown.categoryId,
              subCategoryId: args.transactionDrilldown.subCategoryId,
            }
          : {
              kind: 'category' as const,
              categoryId: args.transactionDrilldown.categoryId,
            }
        : undefined,
    };
  }, [
    args.monthFilterKey,
    args.pagination.pageIndex,
    args.pagination.pageSize,
    args.quarterFilter,
    args.sorting,
    args.transactionDrilldown,
    args.transactionSearch,
    args.transactionView,
    args.yearFilter,
  ]);
  const transactionsPageQ = useTransactionsPageQuery(
    args.projectId,
    transactionsPageInput,
    { enabled: args.isHydrated }
  );
  const linkedCommentsTxnQ = useTransactionQuery(
    args.projectId,
    args.initialCommentTxnId ?? asTxnId('__no_linked_txn__'),
    {
      enabled: Boolean(
        args.initialCommentTxnId &&
        args.dismissedLinkedCommentTxnId !== args.initialCommentTxnId
      ),
    }
  );
  const expandedCommentsTxnId =
    args.expandedCommentsTxn?.id ?? asTxnId('__no_expanded_txn__');
  const expandedCommentsQ = useTransactionCommentsQuery(
    args.projectId,
    expandedCommentsTxnId,
    { enabled: Boolean(args.expandedCommentsTxn) }
  );
  const pagedTxns = transactionsPageQ.data?.rows ?? EMPTY_TXNS;
  const visibleTxnIds = useMemo(
    () => pagedTxns.map((txn) => txn.id),
    [pagedTxns]
  );
  const commentSummariesQ = useTransactionCommentSummariesQuery(
    args.projectId,
    { txnIds: visibleTxnIds },
    { enabled: args.isHydrated && visibleTxnIds.length > 0 }
  );
  const commentSummaryByTxnId = useMemo(
    () =>
      new Map(
        (commentSummariesQ.data ?? []).map((summary) => [
          summary.txnId,
          summary,
        ])
      ),
    [commentSummariesQ.data]
  );
  const linkedCommentsTxn =
    args.initialCommentTxnId &&
    args.dismissedLinkedCommentTxnId !== args.initialCommentTxnId
      ? (linkedCommentsTxnQ.data ?? null)
      : null;
  const selectedRows = useMemo(
    () =>
      (
        args.bulkSelectionRows ??
        pagedTxns.map((txn) => ({
          id: txn.id,
          categorisable: txn.categorisable,
          subCategoryId: txn.subCategoryId,
          codingPendingApproval: Boolean(txn.codingPendingApproval),
          locked: Boolean(txn.lockedAt),
          workflowVersion: txn.workflowVersion ?? 0,
          reversal: txn.reversal
            ? {
                id: txn.reversal.id,
                status: txn.reversal.status,
                side: txn.reversal.side,
                version: txn.reversal.version,
                matchMethod: txn.reversal.matchMethod,
                sourceTxn: txn.reversal.sourceTxn,
                counterpartTxn: txn.reversal.counterpartTxn,
              }
            : undefined,
        }))
      ).filter((txn) => args.rowSelection[txn.id]),
    [args.bulkSelectionRows, args.rowSelection, pagedTxns]
  );
  const selectedTxnIds = useMemo(
    () => selectedRows.map((txn) => txn.id),
    [selectedRows]
  );
  const selectedWorkflowVersions = useMemo(
    () =>
      selectedRows.map((txn) => ({
        txnId: txn.id,
        version: txn.workflowVersion,
      })),
    [selectedRows]
  );
  const pageSummary = transactionsPageQ.data?.summary ?? {
    totalCount: 0,
    budgetImpactCents: 0,
    pendingReversalCount: 0,
    pendingReversalCents: 0,
    adjustedBudgetImpactCents: 0,
    uncodedCount: 0,
    uncodedCents: 0,
    codingApprovalCount: 0,
    reversalReviewCount: 0,
    reversalMatchReviewCount: 0,
    awaitingReversalCount: 0,
    sourceOnlyCount: 0,
    assignedToMeCount: 0,
    reviewedCount: 0,
    lockedCount: 0,
    invalidDateCount: 0,
  };
  const selectedAutoMappedPendingCount = useMemo(
    () =>
      selectedRows.filter(
        (txn) =>
          !txn.locked &&
          txn.categorisable &&
          txn.codingPendingApproval &&
          !!txn.subCategoryId &&
          args.taxonomy.validSubIds.has(txn.subCategoryId)
      ).length,
    [selectedRows, args.taxonomy.validSubIds]
  );
  const selectedSuggestedReversalPairs = useMemo(
    () => [
      ...new Map(
        selectedRows
          .filter(
            (txn) =>
              !txn.locked &&
              txn.reversal &&
              (txn.reversal.status === 'auto_matched_pending_approval' ||
                txn.reversal.status ===
                  'auto_matched_ambiguous_pending_approval')
          )
          .map((txn) => [txn.reversal!.id, txn.reversal!] as const)
      ).values(),
    ],
    [selectedRows]
  );
  const selectedSuggestedReversalIds = useMemo(
    () => selectedSuggestedReversalPairs.map((reversal) => reversal.id),
    [selectedSuggestedReversalPairs]
  );
  const selectedSuggestedReversalCount = selectedSuggestedReversalPairs.length;
  const selectedAmbiguousSuggestedReversalCount = useMemo(
    () =>
      selectedSuggestedReversalPairs.filter(
        (reversal) =>
          reversal.status === 'auto_matched_ambiguous_pending_approval'
      ).length,
    [selectedSuggestedReversalPairs]
  );
  const selectedUnlockedCategorisableCount = useMemo(
    () => selectedRows.filter((txn) => !txn.locked && txn.categorisable).length,
    [selectedRows]
  );
  const selectedDeletableCount = useMemo(
    () => selectedRows.filter((txn) => !txn.locked && !txn.reversal).length,
    [selectedRows]
  );
  const selectedLockEligibleCount = useMemo(
    () =>
      selectedRows.filter(
        (txn) =>
          !txn.locked &&
          transactionCanBeLocked({
            categorisable: txn.categorisable,
            hasValidSubCategory:
              !!txn.subCategoryId &&
              args.taxonomy.validSubIds.has(txn.subCategoryId),
            codingPendingApproval: txn.codingPendingApproval,
            reversalStatus: txn.reversal?.status,
          })
      ).length,
    [selectedRows, args.taxonomy.validSubIds]
  );
  const bulkRecodeSubCategoryOptions = useMemo(
    () =>
      args.bulkRecodeCategoryId
        ? args.taxonomy.subCategoryOptionsForCategory(
            asCategoryId(args.bulkRecodeCategoryId)
          )
        : [],
    [args.bulkRecodeCategoryId, args.taxonomy]
  );
  const drilldownLabel = args.transactionDrilldown
    ? args.transactionDrilldown.kind === 'subcategory'
      ? `${args.transactionDrilldown.categoryName} > ${args.transactionDrilldown.subCategoryName}`
      : args.transactionDrilldown.categoryName
    : null;
  return {
    bulkRecodeSubCategoryOptions,
    commentSummaryByTxnId,
    drilldownLabel,
    expandedCommentsQ,
    linkedCommentsTxn,
    pageSummary,
    pagedTxns,
    selectedAmbiguousSuggestedReversalCount,
    selectedAutoMappedPendingCount,
    selectedSuggestedReversalCount,
    selectedSuggestedReversalIds,
    selectedSuggestedReversalPairs,
    selectedDeletableCount,
    selectedLockEligibleCount,
    selectedTxnIds,
    selectedWorkflowVersions,
    selectedUnlockedCategorisableCount,
    transactionsPageInput,
    transactionsPageQ,
  };
}

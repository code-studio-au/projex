import { useState } from 'react';
import { Divider, Paper, Stack } from '@mantine/core';
import type { TransactionActions } from '../hooks/useTransactionActions';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import {
  asTxnId,
  type ProjectId,
  type TransactionDrilldownFilter,
  type TxnId,
} from '../types';
import type {
  ProjectRuleSuggestionPrompt,
  TxnBulkSelectionRow,
} from '../api/types';
import TransactionFiltersCard from './transactions/TransactionFiltersCard';
import TransactionsModalStack from './transactions/TransactionsModalStack';
import TransactionsDataTable from './transactions/TransactionsDataTable';
import TransactionsOverviewCard from './transactions/TransactionsOverviewCard';
import { createTransactionColumns } from './transactions/transactionTableColumns';
import {
  transactionEmptyStateMessage,
  type TransactionView,
} from './transactions/transactionViews';
import { useTransactionsPanelData } from './transactions/useTransactionsPanelData';
import { useTransactionsPanelState } from './transactions/useTransactionsPanelState';
import { useTransactionBulkActionsController } from './transactions/useTransactionBulkActionsController';
import { useCreateProjectAutoCodingRuleMutation } from '../queries/projectAutoCodingRules';
import {
  useTransactionQuery,
  useTransactionsBulkSelectionMutation,
} from '../queries/transactions';
import {
  formatTxnCountLabel,
  toQuarterOption,
  type QuarterOption,
} from './transactions/transactionsPanelUtils';
import classes from '../styles/ui.module.css';
import { showAppToast } from '../utils/toast';
import {
  canMoveReversalReviewQueue,
  createReversalReviewQueue,
  currentReversalReviewTxnId,
  moveReversalReviewQueue,
  resolveReversalReviewItem,
  reversalReviewQueueSummary,
} from './transactions/reversalReviewQueue';
import { useTransactionSearch } from './transactions/useTransactionSearch';

function useTransactionsPanelController(props: {
  projectId: ProjectId;
  transactionActions: TransactionActions;
  taxonomy: TaxonomyHook;
  autoMappedPendingCount: number;
  currencyCode: string;
  yearFilterOptions: { value: string; label: string }[];
  yearFilter: string | null;
  setYearFilter: (value: string | null) => void;
  quarterFilterOptions: { value: QuarterOption; label: string }[];
  quarterFilter: QuarterOption | null;
  setQuarterFilter: (value: QuarterOption | null) => void;
  monthFilterOptions: { value: string; label: string }[];
  monthFilterKey: string | null;
  setMonthFilterKey: (value: string | null) => void;
  transactionView: TransactionView;
  setTransactionView: (v: TransactionView) => void;
  transactionSearch: string;
  setTransactionSearch: (value: string) => void;
  transactionDrilldown?: TransactionDrilldownFilter | null;
  onClearTransactionDrilldown?: () => void;
  initialCommentTxnId?: TxnId | null;
  transferOutEnabled: boolean;
  transferProjectOptions: Array<{ value: ProjectId; label: string }>;
  onClearFilters: () => void;
  canEditTaxonomy: boolean;
  canManageReversals: boolean;
  canResolveUnlock: boolean;
  canAdminUnlock: boolean;
  readOnly?: boolean;
}) {
  const {
    projectId,
    transactionActions,
    taxonomy,
    autoMappedPendingCount,
    currencyCode,
    yearFilterOptions,
    yearFilter,
    setYearFilter,
    quarterFilterOptions,
    quarterFilter,
    setQuarterFilter,
    monthFilterOptions,
    monthFilterKey,
    setMonthFilterKey,
    transactionView,
    setTransactionView,
    transactionSearch,
    setTransactionSearch,
    transactionDrilldown = null,
    onClearTransactionDrilldown,
    initialCommentTxnId = null,
    transferOutEnabled,
    transferProjectOptions,
    onClearFilters,
    canEditTaxonomy,
    canManageReversals,
    canResolveUnlock,
    canAdminUnlock,
    readOnly = false,
  } = props;
  const {
    bulkRecodeCategoryId,
    bulkRecodeOpen,
    bulkRecodeSubCategoryId,
    commentsTxn,
    dismissedLinkedCommentTxnId,
    expandedCommentsTxn,
    isHydrated,
    isMobile,
    manageOpen,
    pagination,
    paginationScopeKey,
    projectRuleError,
    projectRuleMatchText,
    projectRulePrompt,
    rowSelection,
    reversalModalNonce,
    reversalReviewQueue,
    reversalTxn,
    sorting,
    splitTxn,
    transferTxn,
    unlockTxn,
    setBulkRecodeCategoryId,
    setBulkRecodeOpen,
    setBulkRecodeSubCategoryId,
    setCommentsTxn,
    setDismissedLinkedCommentTxnId,
    setExpandedCommentsTxn,
    setManageOpen,
    setPagination,
    setProjectRuleError,
    setProjectRuleMatchText,
    setProjectRulePrompt,
    setReversalModalNonce,
    setReversalReviewQueue,
    setReversalTxn,
    setRowSelection,
    setSorting,
    setSplitTxn,
    setTransferTxn,
    setUnlockTxn,
  } = useTransactionsPanelState({
    monthFilterKey,
    quarterFilter,
    transactionDrilldown,
    transactionView,
    yearFilter,
  });
  const createProjectRule = useCreateProjectAutoCodingRuleMutation(projectId);
  const selectTransactions = useTransactionsBulkSelectionMutation(projectId);
  const loadReversalReviewQueue =
    useTransactionsBulkSelectionMutation(projectId);
  const [bulkSelectionRows, setBulkSelectionRows] = useState<
    TxnBulkSelectionRow[] | null
  >(null);
  const {
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
  } = useTransactionsPanelData({
    bulkRecodeCategoryId,
    dismissedLinkedCommentTxnId,
    expandedCommentsTxn,
    initialCommentTxnId,
    isHydrated,
    monthFilterKey,
    pagination,
    projectId,
    quarterFilter,
    rowSelection,
    sorting,
    taxonomy,
    bulkSelectionRows,
    transactionDrilldown,
    transactionSearch,
    transactionView,
    yearFilter,
  });
  const activeReversalReviewTxnId =
    currentReversalReviewTxnId(reversalReviewQueue);
  const reversalReviewTxnQ = useTransactionQuery(
    projectId,
    activeReversalReviewTxnId ?? asTxnId('__no_reversal_review_txn__'),
    { enabled: Boolean(activeReversalReviewTxnId) }
  );
  const activeCommentsTxn = commentsTxn ?? linkedCommentsTxn;
  const activeReversalReviewTxn =
    reversalReviewTxnQ.data?.id === activeReversalReviewTxnId
      ? reversalReviewTxnQ.data
      : null;
  const activeReversalTxn = reversalReviewQueue
    ? activeReversalReviewTxn
    : reversalTxn;
  const reviewQueueSummary = reversalReviewQueue
    ? reversalReviewQueueSummary(reversalReviewQueue)
    : null;
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [
    bulkApproveSuggestedReversalsConfirmOpen,
    setBulkApproveSuggestedReversalsConfirmOpen,
  ] = useState(false);
  const resetPage = () =>
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  const clearSelection = () => {
    setRowSelection({});
    setBulkSelectionRows(null);
  };
  const { searchInput, queueSearch } = useTransactionSearch({
    value: transactionSearch,
    onCommit: setTransactionSearch,
    onBeforeCommit: () => {
      clearSelection();
      resetPage();
    },
  });
  const {
    reconcilePendingReversals,
    reconcilingPendingReversals,
    runBulkAction,
  } = useTransactionBulkActionsController({
    mutate: transactionActions.runBulkAction,
    clearSelection,
  });

  async function selectAllFilteredTransactions() {
    try {
      const result = await selectTransactions.mutateAsync(
        transactionsPageInput
      );
      setBulkSelectionRows(result.rows);
      setRowSelection(
        Object.fromEntries(result.rows.map((txn) => [txn.id, true]))
      );
    } catch (error) {
      showAppToast({
        tone: 'error',
        title: 'Could not select all transactions',
        message:
          error instanceof Error
            ? error.message
            : 'The filtered transactions could not be selected.',
      });
    }
  }

  async function openReversalReviewQueue() {
    try {
      const result = await loadReversalReviewQueue.mutateAsync(
        transactionsPageInput
      );
      const queue = createReversalReviewQueue(result.rows);
      if (!queue) {
        showAppToast({
          tone: 'info',
          title: 'No reversal matches to review',
          message:
            'No unlocked auto-matched reversal pairs match the current filters.',
        });
        return;
      }
      setReversalTxn(null);
      setReversalReviewQueue(queue);
    } catch (error) {
      showAppToast({
        tone: 'error',
        title: 'Could not open reversal review',
        message:
          error instanceof Error
            ? error.message
            : 'The reversal review queue could not be loaded.',
      });
    }
  }

  function closeReversalModal() {
    if (!reversalReviewQueue) {
      setReversalTxn(null);
      return;
    }
    const summary = reversalReviewQueueSummary(reversalReviewQueue);
    setReversalReviewQueue(null);
    if (summary.reviewedCount === 0) return;
    showAppToast({
      tone: 'info',
      title: 'Reversal review paused',
      message: `${summary.approvedCount} approved, ${summary.rejectedCount} rejected, and ${summary.remainingCount} remaining.`,
    });
  }

  function resolveReversalReviewQueueItem(outcome: 'approved' | 'rejected') {
    if (!reversalReviewQueue) return;
    const nextQueue = resolveReversalReviewItem(reversalReviewQueue, outcome);
    const summary = reversalReviewQueueSummary(nextQueue);
    if (summary.remainingCount > 0) {
      setReversalReviewQueue(nextQueue);
      return;
    }
    setReversalReviewQueue(null);
    showAppToast({
      tone: 'success',
      title: 'Reversal review complete',
      message: `${summary.approvedCount} approved and ${summary.rejectedCount} rejected across ${summary.totalCount} reversal match${summary.totalCount === 1 ? '' : 'es'}.`,
    });
  }

  const reversalReviewQueueControls =
    reversalReviewQueue && reviewQueueSummary
      ? {
          currentPosition: reversalReviewQueue.currentIndex + 1,
          totalCount: reviewQueueSummary.totalCount,
          reviewedCount: reviewQueueSummary.reviewedCount,
          remainingCount: reviewQueueSummary.remainingCount,
          hasPrevious: canMoveReversalReviewQueue(reversalReviewQueue, -1),
          hasNext: canMoveReversalReviewQueue(reversalReviewQueue, 1),
          onPrevious: () =>
            setReversalReviewQueue((current) =>
              current ? moveReversalReviewQueue(current, -1) : current
            ),
          onNext: () =>
            setReversalReviewQueue((current) =>
              current ? moveReversalReviewQueue(current, 1) : current
            ),
          onResolved: resolveReversalReviewQueueItem,
        }
      : undefined;

  function applyProjectRulePrompt(prompt: ProjectRuleSuggestionPrompt | null) {
    if (!prompt) return;
    setProjectRuleError(null);
    setProjectRulePrompt(prompt);
    setProjectRuleMatchText(prompt.suggestedMatchText);
  }

  // Note: keep columns as a plain value (no manual memoization).
  // This avoids conflicts with the React Compiler's memoization preservation rule.
  const txnColumns = createTransactionColumns({
    transactionActions,
    taxonomy,
    currencyCode,
    readOnly,
    commentSummaryByTxnId,
    expandedCommentsTxn,
    expandedComments: expandedCommentsQ.data ?? [],
    expandedCommentsLoading: expandedCommentsQ.isLoading,
    transferOutEnabled,
    transferProjectOptions,
    canManageReversals,
    canResolveUnlock,
    onApplyProjectRulePrompt: applyProjectRulePrompt,
    onProjectRuleError: setProjectRuleError,
    onOpenComments: setCommentsTxn,
    onToggleExpandedComments: (txn) =>
      setExpandedCommentsTxn((current) =>
        current?.id === txn.id ? null : txn
      ),
    onOpenReversal: (txn) => {
      setReversalReviewQueue(null);
      setReversalModalNonce((current) => current + 1);
      setReversalTxn(txn);
    },
    onOpenSplit: setSplitTxn,
    onOpenTransfer: setTransferTxn,
    onOpenUnlock: setUnlockTxn,
  });

  return {
    activeCommentsTxn,
    activeReversalReviewTxn,
    activeReversalTxn,
    autoMappedPendingCount,
    bulkApproveSuggestedReversalsConfirmOpen,
    bulkDeleteConfirmOpen,
    bulkRecodeCategoryId,
    bulkRecodeOpen,
    bulkRecodeSubCategoryId,
    bulkRecodeSubCategoryOptions,
    canAdminUnlock,
    canEditTaxonomy,
    canManageReversals,
    canResolveUnlock,
    clearSelection,
    closeReversalModal,
    createProjectRule,
    currencyCode,
    drilldownLabel,
    initialCommentTxnId,
    isHydrated,
    isMobile,
    loadReversalReviewQueue,
    manageOpen,
    monthFilterKey,
    monthFilterOptions,
    onClearFilters,
    onClearTransactionDrilldown,
    openReversalReviewQueue,
    pageSummary,
    pagedTxns,
    pagination,
    paginationScopeKey,
    projectId,
    projectRuleError,
    projectRuleMatchText,
    projectRulePrompt,
    quarterFilter,
    quarterFilterOptions,
    queueSearch,
    readOnly,
    reconcilePendingReversals,
    reconcilingPendingReversals,
    resetPage,
    reversalModalNonce,
    reversalReviewQueue,
    reversalReviewQueueControls,
    reversalReviewTxnQ,
    reversalTxn,
    rowSelection,
    runBulkAction,
    searchInput,
    selectAllFilteredTransactions,
    selectTransactions,
    selectedAmbiguousSuggestedReversalCount,
    selectedAutoMappedPendingCount,
    selectedDeletableCount,
    selectedLockEligibleCount,
    selectedSuggestedReversalCount,
    selectedSuggestedReversalIds,
    selectedSuggestedReversalPairs,
    selectedTxnIds,
    selectedUnlockedCategorisableCount,
    selectedWorkflowVersions,
    setBulkApproveSuggestedReversalsConfirmOpen,
    setBulkDeleteConfirmOpen,
    setBulkRecodeCategoryId,
    setBulkRecodeOpen,
    setBulkRecodeSubCategoryId,
    setCommentsTxn,
    setDismissedLinkedCommentTxnId,
    setManageOpen,
    setMonthFilterKey,
    setPagination,
    setProjectRuleError,
    setProjectRuleMatchText,
    setProjectRulePrompt,
    setQuarterFilter,
    setRowSelection,
    setSorting,
    setSplitTxn,
    setTransactionView,
    setTransferTxn,
    setUnlockTxn,
    setYearFilter,
    sorting,
    splitTxn,
    taxonomy,
    transactionActions,
    transactionDrilldown,
    transactionSearch,
    transactionView,
    transactionsPageQ,
    transferProjectOptions,
    transferTxn,
    txnColumns,
    unlockTxn,
    yearFilter,
    yearFilterOptions,
  };
}

type TransactionsPanelController = ReturnType<
  typeof useTransactionsPanelController
>;

function TransactionsOverviewSection({
  model,
}: {
  model: TransactionsPanelController;
}) {
  return (
    <Paper className={classes.surfaceCard} radius="xl" p="md">
      <Stack gap="md">
        <TransactionFiltersCard
          isMobile={model.isMobile}
          transactionView={model.transactionView}
          setTransactionView={model.setTransactionView}
          yearFilterOptions={model.yearFilterOptions}
          yearFilter={model.yearFilter}
          setYearFilter={model.setYearFilter}
          quarterFilterOptions={model.quarterFilterOptions}
          quarterFilter={model.quarterFilter}
          setQuarterFilter={model.setQuarterFilter}
          monthFilterOptions={model.monthFilterOptions}
          monthFilterKey={model.monthFilterKey}
          setMonthFilterKey={model.setMonthFilterKey}
          onClearFilters={model.onClearFilters}
          onResetPage={model.resetPage}
          onClearSelection={model.clearSelection}
          toQuarterOption={toQuarterOption}
        />

        <Divider />

        <TransactionsOverviewCard
          pageSummary={model.pageSummary}
          transactionView={model.transactionView}
          currencyCode={model.currencyCode}
          projectAutoMappedPendingCount={model.autoMappedPendingCount}
          isHydrated={model.isHydrated}
          isMobile={model.isMobile}
          readOnly={model.readOnly}
          canEditTaxonomy={model.canEditTaxonomy}
          canManageReversals={model.canManageReversals}
          canAdminUnlock={model.canAdminUnlock}
          reconcilingPendingReversals={model.reconcilingPendingReversals}
          loadingReversalReviewQueue={model.loadReversalReviewQueue.isPending}
          onReconcilePendingReversals={() => {
            void model.reconcilePendingReversals();
          }}
          onOpenReversalReviewQueue={() => {
            void model.openReversalReviewQueue();
          }}
          onApproveAllAutoMappings={() => {
            void model.runBulkAction({
              input: {
                action: 'approveAllAutoMappings',
              },
              successLabel: 'Approved',
              clearSelection: false,
            });
          }}
          onOpenTaxonomyManager={() => model.setManageOpen(true)}
          selectedTxnCount={model.selectedTxnIds.length}
          selectedCountLabel={formatTxnCountLabel(model.selectedTxnIds.length)}
          selectableTxnCount={model.pageSummary.totalCount}
          selectingAll={model.selectTransactions.isPending}
          selectedAutoMappedPendingCount={model.selectedAutoMappedPendingCount}
          selectedAmbiguousSuggestedReversalCount={
            model.selectedAmbiguousSuggestedReversalCount
          }
          selectedSuggestedReversalCount={model.selectedSuggestedReversalCount}
          selectedSuggestedReversalPairs={model.selectedSuggestedReversalPairs}
          selectedUnlockedCategorisableCount={
            model.selectedUnlockedCategorisableCount
          }
          selectedDeletableCount={model.selectedDeletableCount}
          selectedLockEligibleCount={model.selectedLockEligibleCount}
          onSelectAll={() => void model.selectAllFilteredTransactions()}
          onClearSelection={model.clearSelection}
          onMarkReviewed={() => {
            void model.runBulkAction({
              input: {
                action: 'setReviewed',
                txnIds: model.selectedTxnIds,
                reviewed: true,
                workflowVersions: model.selectedWorkflowVersions,
              },
              successLabel: 'Reviewed',
            });
          }}
          onMarkUnreviewed={() => {
            void model.runBulkAction({
              input: {
                action: 'setReviewed',
                txnIds: model.selectedTxnIds,
                reviewed: false,
                workflowVersions: model.selectedWorkflowVersions,
              },
              successLabel: 'Marked unreviewed for',
            });
          }}
          onLock={() => {
            void model.runBulkAction({
              input: {
                action: 'setLocked',
                txnIds: model.selectedTxnIds,
                locked: true,
                workflowVersions: model.selectedWorkflowVersions,
              },
              successLabel: 'Locked',
            });
          }}
          onUnlock={() => {
            void model.runBulkAction({
              input: {
                action: 'setLocked',
                txnIds: model.selectedTxnIds,
                locked: false,
                workflowVersions: model.selectedWorkflowVersions,
                reason: 'Bulk administrative unlock from transaction table',
              },
              successLabel: 'Unlocked',
            });
          }}
          onApproveAutoMappings={() => {
            void model.runBulkAction({
              input: {
                action: 'approveAutoMappings',
                txnIds: model.selectedTxnIds,
              },
              successLabel: 'Approved',
            });
          }}
          onOpenRecode={() => {
            model.setBulkRecodeCategoryId(null);
            model.setBulkRecodeSubCategoryId(null);
            model.setBulkRecodeOpen(true);
          }}
          onClearCoding={() => {
            void model.runBulkAction({
              input: {
                action: 'clearCoding',
                txnIds: model.selectedTxnIds,
              },
              successLabel: 'Cleared coding for',
            });
          }}
          bulkDeleteConfirmOpen={model.bulkDeleteConfirmOpen}
          bulkApproveSuggestedReversalsConfirmOpen={
            model.bulkApproveSuggestedReversalsConfirmOpen
          }
          onOpenBulkDeleteConfirm={() => model.setBulkDeleteConfirmOpen(true)}
          onCloseBulkDeleteConfirm={() => model.setBulkDeleteConfirmOpen(false)}
          onConfirmBulkDelete={() => {
            void model
              .runBulkAction({
                input: {
                  action: 'delete',
                  txnIds: model.selectedTxnIds,
                },
                successLabel: 'Deleted',
              })
              .then((result) => {
                if (result) {
                  model.setBulkDeleteConfirmOpen(false);
                }
              });
          }}
          onOpenBulkApproveSuggestedReversalsConfirm={() =>
            model.setBulkApproveSuggestedReversalsConfirmOpen(true)
          }
          onCloseBulkApproveSuggestedReversalsConfirm={() =>
            model.setBulkApproveSuggestedReversalsConfirmOpen(false)
          }
          onConfirmBulkApproveSuggestedReversals={() => {
            void model
              .runBulkAction({
                input: {
                  action: 'approveSuggestedReversals',
                  reversalIds: model.selectedSuggestedReversalIds,
                },
                successLabel: 'Approved reversal matches for',
              })
              .then((result) => {
                if (result) {
                  model.setBulkApproveSuggestedReversalsConfirmOpen(false);
                }
              });
          }}
          drilldownLabel={model.drilldownLabel}
          onClearDrilldown={() => {
            model.clearSelection();
            model.resetPage();
            model.onClearTransactionDrilldown?.();
          }}
          invalidDateCount={model.pageSummary.invalidDateCount}
          projectRuleError={model.projectRuleError}
          projectRulePromptOpen={Boolean(model.projectRulePrompt)}
        />
      </Stack>
    </Paper>
  );
}

function TransactionsTableSection({
  model,
}: {
  model: TransactionsPanelController;
}) {
  return (
    <TransactionsDataTable
      isHydrated={model.isHydrated}
      isLoading={model.transactionsPageQ.isLoading}
      transactionDrilldownActive={Boolean(model.transactionDrilldown)}
      paginationScopeKey={model.paginationScopeKey}
      txnColumns={model.txnColumns}
      pagedTxns={model.pagedTxns}
      readOnly={model.readOnly}
      pagination={model.pagination}
      rowSelection={model.rowSelection}
      sorting={model.sorting}
      globalFilter={model.searchInput}
      totalCount={model.pageSummary.totalCount}
      showProgressBars={model.transactionsPageQ.isFetching}
      emptyStateMessage={transactionEmptyStateMessage({
        transactionView: model.transactionView,
        yearFilter: model.yearFilter,
        quarterFilter: model.quarterFilter,
        monthFilterKey: model.monthFilterKey,
        drilldownLabel: model.drilldownLabel,
        search: model.transactionSearch,
      })}
      onPaginationChange={(updater) => {
        model.clearSelection();
        model.setPagination(updater);
      }}
      onRowSelectionChange={model.setRowSelection}
      onGlobalFilterChange={(nextValue) => {
        model.queueSearch(nextValue);
      }}
      onSortingChange={(updater) => {
        const nextSorting =
          typeof updater === 'function' ? updater(model.sorting) : updater;
        model.clearSelection();
        model.setSorting(nextSorting);
        model.resetPage();
      }}
    />
  );
}

function TransactionsModalSection({
  model,
}: {
  model: TransactionsPanelController;
}) {
  return (
    <TransactionsModalStack
      manageOpen={model.manageOpen}
      onCloseManage={() => model.setManageOpen(false)}
      taxonomy={model.taxonomy}
      canEditTaxonomy={model.canEditTaxonomy}
      splitTxn={model.splitTxn}
      currencyCode={model.currencyCode}
      onCloseSplit={() => model.setSplitTxn(null)}
      onSplit={(children) =>
        model.splitTxn
          ? model.transactionActions.splitTxn(model.splitTxn.id, children)
          : Promise.resolve()
      }
      transferTxn={model.transferTxn}
      transferProjectOptions={model.transferProjectOptions}
      onCloseTransfer={() => model.setTransferTxn(null)}
      onTransfer={(input) =>
        model.transferTxn
          ? model.transactionActions.transferTxn(model.transferTxn.id, input)
          : Promise.resolve()
      }
      reversalTxn={model.activeReversalTxn}
      reversalModalNonce={model.reversalModalNonce}
      {...(model.reversalReviewQueueControls
        ? { reversalReviewQueue: model.reversalReviewQueueControls }
        : {})}
      reversalReviewQueueLoading={Boolean(
        model.reversalReviewQueue &&
        !model.activeReversalReviewTxn &&
        (model.reversalReviewTxnQ.isLoading ||
          model.reversalReviewTxnQ.isFetching)
      )}
      reversalReviewQueueError={
        model.reversalReviewQueue && !model.activeReversalReviewTxn
          ? model.reversalReviewTxnQ.error instanceof Error
            ? model.reversalReviewTxnQ.error.message
            : model.reversalReviewTxnQ.isSuccess
              ? 'This transaction is no longer available for review.'
              : null
          : null
      }
      canManageReversals={model.canManageReversals}
      expectedProjectOptions={model.transferProjectOptions.filter(
        (option) => option.value !== model.projectId
      )}
      onCloseReversal={model.closeReversalModal}
      onSubmitReversalAction={(input) =>
        model.transactionActions.runReversalAction(input)
      }
      activeCommentsTxn={model.activeCommentsTxn}
      onCloseComments={() => {
        model.setCommentsTxn(null);
        if (model.initialCommentTxnId) {
          model.setDismissedLinkedCommentTxnId(model.initialCommentTxnId);
        }
      }}
      bulkRecodeOpen={model.bulkRecodeOpen}
      bulkRecodeCategoryId={model.bulkRecodeCategoryId}
      bulkRecodeSubCategoryId={model.bulkRecodeSubCategoryId}
      bulkRecodeSubCategoryOptions={model.bulkRecodeSubCategoryOptions}
      onCloseBulkRecode={() => model.setBulkRecodeOpen(false)}
      onCategoryChange={model.setBulkRecodeCategoryId}
      onSubCategoryChange={model.setBulkRecodeSubCategoryId}
      selectedTxnIds={model.selectedTxnIds}
      onSubmitBulkRecode={async ({ txnIds, categoryId, subCategoryId }) =>
        Boolean(
          await model.runBulkAction({
            input: {
              action: 'recode',
              txnIds,
              categoryId,
              subCategoryId,
            },
            successLabel: 'Recoded',
          })
        )
      }
      projectRulePrompt={model.projectRulePrompt}
      projectRuleMatchText={model.projectRuleMatchText}
      projectRuleError={model.projectRuleError}
      createProjectRulePending={model.createProjectRule.isPending}
      onCloseProjectRule={() => {
        model.setProjectRulePrompt(null);
        model.setProjectRuleError(null);
      }}
      onProjectRuleMatchTextChange={(value) => {
        model.setProjectRuleError(null);
        model.setProjectRuleMatchText(value);
      }}
      onSubmitProjectRule={async () => {
        if (!model.projectRulePrompt) return;
        try {
          model.setProjectRuleError(null);
          await model.createProjectRule.mutateAsync({
            matchText: model.projectRuleMatchText.trim(),
            subCategoryId: model.projectRulePrompt.subCategoryId,
          });
          model.setProjectRulePrompt(null);
        } catch (error) {
          model.setProjectRuleError(
            error instanceof Error
              ? error.message
              : 'Could not create project auto-coding rule.'
          );
        }
      }}
      unlockTxn={model.unlockTxn}
      canResolveUnlock={model.canResolveUnlock}
      canAdminUnlock={model.canAdminUnlock}
      transactionActions={model.transactionActions}
      onCloseUnlock={() => model.setUnlockTxn(null)}
    />
  );
}

function TransactionsPanelView({
  model,
}: {
  model: TransactionsPanelController;
}) {
  return (
    <Stack gap="lg" className={classes.pageStack}>
      <TransactionsOverviewSection model={model} />

      <TransactionsTableSection model={model} />

      <TransactionsModalSection model={model} />
    </Stack>
  );
}

export default function TransactionsPanel(
  props: Parameters<typeof useTransactionsPanelController>[0]
) {
  const model = useTransactionsPanelController(props);
  return <TransactionsPanelView model={model} />;
}

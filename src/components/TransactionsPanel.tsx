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

export default function TransactionsPanel(props: {
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

  return (
    <Stack gap="lg" className={classes.pageStack}>
      <Paper className={classes.surfaceCard} radius="xl" p="md">
        <Stack gap="md">
          <TransactionFiltersCard
            isMobile={isMobile}
            transactionView={transactionView}
            setTransactionView={setTransactionView}
            yearFilterOptions={yearFilterOptions}
            yearFilter={yearFilter}
            setYearFilter={setYearFilter}
            quarterFilterOptions={quarterFilterOptions}
            quarterFilter={quarterFilter}
            setQuarterFilter={setQuarterFilter}
            monthFilterOptions={monthFilterOptions}
            monthFilterKey={monthFilterKey}
            setMonthFilterKey={setMonthFilterKey}
            onClearFilters={onClearFilters}
            onResetPage={resetPage}
            onClearSelection={clearSelection}
            toQuarterOption={toQuarterOption}
          />

          <Divider />

          <TransactionsOverviewCard
            pageSummary={pageSummary}
            transactionView={transactionView}
            currencyCode={currencyCode}
            projectAutoMappedPendingCount={autoMappedPendingCount}
            isHydrated={isHydrated}
            isMobile={isMobile}
            readOnly={readOnly}
            canEditTaxonomy={canEditTaxonomy}
            canManageReversals={canManageReversals}
            canAdminUnlock={canAdminUnlock}
            reconcilingPendingReversals={reconcilingPendingReversals}
            loadingReversalReviewQueue={loadReversalReviewQueue.isPending}
            onReconcilePendingReversals={() => {
              void reconcilePendingReversals();
            }}
            onOpenReversalReviewQueue={() => {
              void openReversalReviewQueue();
            }}
            onApproveAllAutoMappings={() => {
              void runBulkAction({
                input: {
                  action: 'approveAllAutoMappings',
                },
                successLabel: 'Approved',
                clearSelection: false,
              });
            }}
            onOpenTaxonomyManager={() => setManageOpen(true)}
            selectedTxnCount={selectedTxnIds.length}
            selectedCountLabel={formatTxnCountLabel(selectedTxnIds.length)}
            selectableTxnCount={pageSummary.totalCount}
            selectingAll={selectTransactions.isPending}
            selectedAutoMappedPendingCount={selectedAutoMappedPendingCount}
            selectedAmbiguousSuggestedReversalCount={
              selectedAmbiguousSuggestedReversalCount
            }
            selectedSuggestedReversalCount={selectedSuggestedReversalCount}
            selectedSuggestedReversalPairs={selectedSuggestedReversalPairs}
            selectedUnlockedCategorisableCount={
              selectedUnlockedCategorisableCount
            }
            selectedDeletableCount={selectedDeletableCount}
            selectedLockEligibleCount={selectedLockEligibleCount}
            onSelectAll={() => void selectAllFilteredTransactions()}
            onClearSelection={clearSelection}
            onMarkReviewed={() => {
              void runBulkAction({
                input: {
                  action: 'setReviewed',
                  txnIds: selectedTxnIds,
                  reviewed: true,
                  workflowVersions: selectedWorkflowVersions,
                },
                successLabel: 'Reviewed',
              });
            }}
            onMarkUnreviewed={() => {
              void runBulkAction({
                input: {
                  action: 'setReviewed',
                  txnIds: selectedTxnIds,
                  reviewed: false,
                  workflowVersions: selectedWorkflowVersions,
                },
                successLabel: 'Marked unreviewed for',
              });
            }}
            onLock={() => {
              void runBulkAction({
                input: {
                  action: 'setLocked',
                  txnIds: selectedTxnIds,
                  locked: true,
                  workflowVersions: selectedWorkflowVersions,
                },
                successLabel: 'Locked',
              });
            }}
            onUnlock={() => {
              void runBulkAction({
                input: {
                  action: 'setLocked',
                  txnIds: selectedTxnIds,
                  locked: false,
                  workflowVersions: selectedWorkflowVersions,
                  reason: 'Bulk administrative unlock from transaction table',
                },
                successLabel: 'Unlocked',
              });
            }}
            onApproveAutoMappings={() => {
              void runBulkAction({
                input: {
                  action: 'approveAutoMappings',
                  txnIds: selectedTxnIds,
                },
                successLabel: 'Approved',
              });
            }}
            onOpenRecode={() => {
              setBulkRecodeCategoryId(null);
              setBulkRecodeSubCategoryId(null);
              setBulkRecodeOpen(true);
            }}
            onClearCoding={() => {
              void runBulkAction({
                input: {
                  action: 'clearCoding',
                  txnIds: selectedTxnIds,
                },
                successLabel: 'Cleared coding for',
              });
            }}
            bulkDeleteConfirmOpen={bulkDeleteConfirmOpen}
            bulkApproveSuggestedReversalsConfirmOpen={
              bulkApproveSuggestedReversalsConfirmOpen
            }
            onOpenBulkDeleteConfirm={() => setBulkDeleteConfirmOpen(true)}
            onCloseBulkDeleteConfirm={() => setBulkDeleteConfirmOpen(false)}
            onConfirmBulkDelete={() => {
              void runBulkAction({
                input: {
                  action: 'delete',
                  txnIds: selectedTxnIds,
                },
                successLabel: 'Deleted',
              }).then((result) => {
                if (result) {
                  setBulkDeleteConfirmOpen(false);
                }
              });
            }}
            onOpenBulkApproveSuggestedReversalsConfirm={() =>
              setBulkApproveSuggestedReversalsConfirmOpen(true)
            }
            onCloseBulkApproveSuggestedReversalsConfirm={() =>
              setBulkApproveSuggestedReversalsConfirmOpen(false)
            }
            onConfirmBulkApproveSuggestedReversals={() => {
              void runBulkAction({
                input: {
                  action: 'approveSuggestedReversals',
                  reversalIds: selectedSuggestedReversalIds,
                },
                successLabel: 'Approved reversal matches for',
              }).then((result) => {
                if (result) {
                  setBulkApproveSuggestedReversalsConfirmOpen(false);
                }
              });
            }}
            drilldownLabel={drilldownLabel}
            onClearDrilldown={() => {
              clearSelection();
              resetPage();
              onClearTransactionDrilldown?.();
            }}
            invalidDateCount={pageSummary.invalidDateCount}
            projectRuleError={projectRuleError}
            projectRulePromptOpen={Boolean(projectRulePrompt)}
          />
        </Stack>
      </Paper>

      <TransactionsDataTable
        isHydrated={isHydrated}
        isLoading={transactionsPageQ.isLoading}
        transactionDrilldownActive={Boolean(transactionDrilldown)}
        paginationScopeKey={paginationScopeKey}
        txnColumns={txnColumns}
        pagedTxns={pagedTxns}
        readOnly={readOnly}
        pagination={pagination}
        rowSelection={rowSelection}
        sorting={sorting}
        globalFilter={searchInput}
        totalCount={pageSummary.totalCount}
        showProgressBars={transactionsPageQ.isFetching}
        emptyStateMessage={transactionEmptyStateMessage({
          transactionView,
          yearFilter,
          quarterFilter,
          monthFilterKey,
          drilldownLabel,
          search: transactionSearch,
        })}
        onPaginationChange={(updater) => {
          clearSelection();
          setPagination(updater);
        }}
        onRowSelectionChange={setRowSelection}
        onGlobalFilterChange={(nextValue) => {
          queueSearch(nextValue);
        }}
        onSortingChange={(updater) => {
          const nextSorting =
            typeof updater === 'function' ? updater(sorting) : updater;
          clearSelection();
          setSorting(nextSorting);
          resetPage();
        }}
      />

      <TransactionsModalStack
        manageOpen={manageOpen}
        onCloseManage={() => setManageOpen(false)}
        taxonomy={taxonomy}
        canEditTaxonomy={canEditTaxonomy}
        splitTxn={splitTxn}
        currencyCode={currencyCode}
        onCloseSplit={() => setSplitTxn(null)}
        onSplit={(children) =>
          splitTxn
            ? transactionActions.splitTxn(splitTxn.id, children)
            : Promise.resolve()
        }
        transferTxn={transferTxn}
        transferProjectOptions={transferProjectOptions}
        onCloseTransfer={() => setTransferTxn(null)}
        onTransfer={(input) =>
          transferTxn
            ? transactionActions.transferTxn(transferTxn.id, input)
            : Promise.resolve()
        }
        reversalTxn={activeReversalTxn}
        reversalModalNonce={reversalModalNonce}
        reversalReviewQueue={reversalReviewQueueControls}
        reversalReviewQueueLoading={Boolean(
          reversalReviewQueue &&
          !activeReversalReviewTxn &&
          (reversalReviewTxnQ.isLoading || reversalReviewTxnQ.isFetching)
        )}
        reversalReviewQueueError={
          reversalReviewQueue && !activeReversalReviewTxn
            ? reversalReviewTxnQ.error instanceof Error
              ? reversalReviewTxnQ.error.message
              : reversalReviewTxnQ.isSuccess
                ? 'This transaction is no longer available for review.'
                : null
            : null
        }
        canManageReversals={canManageReversals}
        expectedProjectOptions={transferProjectOptions.filter(
          (option) => option.value !== projectId
        )}
        onCloseReversal={closeReversalModal}
        onLoadReversalSuggestions={(txnId) =>
          transactionActions.getReversalSuggestions(txnId)
        }
        onSubmitReversalAction={(input) =>
          transactionActions.runReversalAction(input)
        }
        activeCommentsTxn={activeCommentsTxn}
        onCloseComments={() => {
          setCommentsTxn(null);
          if (initialCommentTxnId) {
            setDismissedLinkedCommentTxnId(initialCommentTxnId);
          }
        }}
        bulkRecodeOpen={bulkRecodeOpen}
        bulkRecodeCategoryId={bulkRecodeCategoryId}
        bulkRecodeSubCategoryId={bulkRecodeSubCategoryId}
        bulkRecodeSubCategoryOptions={bulkRecodeSubCategoryOptions}
        onCloseBulkRecode={() => setBulkRecodeOpen(false)}
        onCategoryChange={setBulkRecodeCategoryId}
        onSubCategoryChange={setBulkRecodeSubCategoryId}
        selectedTxnIds={selectedTxnIds}
        onSubmitBulkRecode={async ({ txnIds, categoryId, subCategoryId }) =>
          Boolean(
            await runBulkAction({
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
        projectRulePrompt={projectRulePrompt}
        projectRuleMatchText={projectRuleMatchText}
        projectRuleError={projectRuleError}
        createProjectRulePending={createProjectRule.isPending}
        onCloseProjectRule={() => {
          setProjectRulePrompt(null);
          setProjectRuleError(null);
        }}
        onProjectRuleMatchTextChange={(value) => {
          setProjectRuleError(null);
          setProjectRuleMatchText(value);
        }}
        onSubmitProjectRule={async () => {
          if (!projectRulePrompt) return;
          try {
            setProjectRuleError(null);
            await createProjectRule.mutateAsync({
              matchText: projectRuleMatchText.trim(),
              subCategoryId: projectRulePrompt.subCategoryId,
            });
            setProjectRulePrompt(null);
          } catch (error) {
            setProjectRuleError(
              error instanceof Error
                ? error.message
                : 'Could not create project auto-coding rule.'
            );
          }
        }}
        unlockTxn={unlockTxn}
        canResolveUnlock={canResolveUnlock}
        canAdminUnlock={canAdminUnlock}
        transactionActions={transactionActions}
        onCloseUnlock={() => setUnlockTxn(null)}
      />
    </Stack>
  );
}

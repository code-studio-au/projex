import { Stack } from '@mantine/core';
import type { TransactionsHook } from '../hooks/useTransactions';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import type { ProjectId, TransactionDrilldownFilter, TxnId } from '../types';
import type { ProjectRuleSuggestionPrompt } from '../api/types';
import { asCategoryId, asSubCategoryId } from '../types/ids';
import TransactionFiltersCard from './transactions/TransactionFiltersCard';
import TransactionsModalStack from './transactions/TransactionsModalStack';
import TransactionsDataTable from './transactions/TransactionsDataTable';
import TransactionsOverviewCard, {
  type TransactionView,
} from './transactions/TransactionsOverviewCard';
import { createTransactionColumns } from './transactions/transactionTableColumns';
import { useTransactionsPanelData } from './transactions/useTransactionsPanelData';
import { useTransactionsPanelState } from './transactions/useTransactionsPanelState';
import { useCreateProjectAutoCodingRuleMutation } from '../queries/projectAutoCodingRules';
import { showAppToast } from '../utils/toast';
import {
  formatTxnCountLabel,
  showBulkActionResultToast,
  toQuarterOption,
  type QuarterOption,
} from './transactions/transactionsPanelUtils';
import classes from '../styles/ui.module.css';

export default function TransactionsPanel(props: {
  projectId: ProjectId;
  txns: TransactionsHook;
  taxonomy: TaxonomyHook;
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
  transactionDrilldown?: TransactionDrilldownFilter | null;
  onClearTransactionDrilldown?: () => void;
  initialCommentTxnId?: TxnId | null;
  transferOutEnabled: boolean;
  transferProjectOptions: Array<{ value: ProjectId; label: string }>;
  onClearFilters: () => void;
  canEditTaxonomy: boolean;
  readOnly?: boolean;
}) {
  const {
    projectId,
    txns,
    taxonomy,
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
    transactionDrilldown = null,
    onClearTransactionDrilldown,
    initialCommentTxnId = null,
    transferOutEnabled,
    transferProjectOptions,
    onClearFilters,
    canEditTaxonomy,
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
    sorting,
    splitTxn,
    transferTxn,
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
    setRowSelection,
    setSorting,
    setSplitTxn,
    setTransferTxn,
  } = useTransactionsPanelState({
    monthFilterKey,
    quarterFilter,
    transactionDrilldown,
    transactionView,
    yearFilter,
  });
  const createProjectRule = useCreateProjectAutoCodingRuleMutation(projectId);
  const {
    autoMappedPendingTxns,
    bulkRecodeSubCategoryOptions,
    commentSummaryByTxnId,
    drilldownLabel,
    expandedCommentsQ,
    isTransitioningPageData,
    linkedCommentsTxn,
    pageSummary,
    pagedTxns,
    selectedAutoMappedPendingCount,
    selectedTxnIds,
    selectedUnlockedCategorisableCount,
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
    transactionDrilldown,
    transactionView,
    txns,
    yearFilter,
  });
  const activeCommentsTxn = commentsTxn ?? linkedCommentsTxn;
  const resetPage = () =>
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  const clearSelection = () => setRowSelection({});

  function applyProjectRulePrompt(prompt: ProjectRuleSuggestionPrompt | null) {
    if (!prompt) return;
    setProjectRuleError(null);
    setProjectRulePrompt(prompt);
    setProjectRuleMatchText(prompt.suggestedMatchText);
  }

  // Note: keep columns as a plain value (no manual memoization).
  // This avoids conflicts with the React Compiler's memoization preservation rule.
  const txnColumns = createTransactionColumns({
    txns,
    taxonomy,
    currencyCode,
    readOnly,
    commentSummaryByTxnId,
    expandedCommentsTxn,
    expandedComments: expandedCommentsQ.data ?? [],
    expandedCommentsLoading: expandedCommentsQ.isLoading,
    transferOutEnabled,
    transferProjectOptions,
    onApplyProjectRulePrompt: applyProjectRulePrompt,
    onProjectRuleError: setProjectRuleError,
    onOpenComments: setCommentsTxn,
    onToggleExpandedComments: (txn) =>
      setExpandedCommentsTxn((current) =>
        current?.id === txn.id ? null : txn
      ),
    onOpenSplit: setSplitTxn,
    onOpenTransfer: setTransferTxn,
  });

  async function runBulkAction(args: {
    input:
      | {
          action: 'approveAutoMappings';
          txnIds: TxnId[];
        }
      | {
          action: 'clearCoding';
          txnIds: TxnId[];
        }
      | {
          action: 'setReviewed';
          txnIds: TxnId[];
          reviewed: boolean;
        }
      | {
          action: 'setLocked';
          txnIds: TxnId[];
          locked: boolean;
        }
      | {
          action: 'recode';
          txnIds: TxnId[];
          categoryId: ReturnType<typeof asCategoryId>;
          subCategoryId: ReturnType<typeof asSubCategoryId>;
        };
    successLabel: string;
    clearSelection?: boolean;
  }) {
    try {
      const result = await txns.runBulkAction(args.input);
      showBulkActionResultToast({
        result,
        successLabel: args.successLabel,
      });
      if (args.clearSelection ?? true) {
        setRowSelection({});
      }
      return result;
    } catch (error) {
      showAppToast({
        title: 'Bulk action failed',
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not update the selected transactions.',
      });
      return null;
    }
  }

  return (
    <Stack gap="lg" className={classes.pageStack}>
      <TransactionFiltersCard
        isMobile={isMobile}
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

      <TransactionsOverviewCard
        pageSummary={pageSummary}
        currencyCode={currencyCode}
        autoMappedPendingCount={autoMappedPendingTxns.length}
        isHydrated={isHydrated}
        isMobile={isMobile}
        transactionView={transactionView}
        setTransactionView={setTransactionView}
        readOnly={readOnly}
        canEditTaxonomy={canEditTaxonomy}
        onApproveAllAutoMappings={() => {
          void runBulkAction({
            input: {
              action: 'approveAutoMappings',
              txnIds: autoMappedPendingTxns.map((txn) => txn.id),
            },
            successLabel: 'Approved',
            clearSelection: false,
          });
        }}
        onOpenTaxonomyManager={() => setManageOpen(true)}
        selectedTxnCount={selectedTxnIds.length}
        selectedCountLabel={formatTxnCountLabel(selectedTxnIds.length)}
        selectedAutoMappedPendingCount={selectedAutoMappedPendingCount}
        selectedUnlockedCategorisableCount={selectedUnlockedCategorisableCount}
        onClearSelection={clearSelection}
        onMarkReviewed={() => {
          void runBulkAction({
            input: {
              action: 'setReviewed',
              txnIds: selectedTxnIds,
              reviewed: true,
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
        drilldownLabel={drilldownLabel}
        onClearDrilldown={() => {
          clearSelection();
          resetPage();
          onClearTransactionDrilldown?.();
        }}
        invalidDateCount={pageSummary.invalidDateCount}
        projectRuleError={projectRuleError}
        projectRulePromptOpen={Boolean(projectRulePrompt)}
        onResetPage={resetPage}
      />

      <TransactionsDataTable
        isHydrated={isHydrated}
        isLoading={transactionsPageQ.isLoading}
        isTransitioningPageData={isTransitioningPageData}
        transactionDrilldownActive={Boolean(transactionDrilldown)}
        paginationScopeKey={paginationScopeKey}
        txnColumns={txnColumns}
        pagedTxns={pagedTxns}
        readOnly={readOnly}
        pagination={pagination}
        rowSelection={rowSelection}
        sorting={sorting}
        totalCount={pageSummary.totalCount}
        validSubIds={taxonomy.validSubIds}
        showProgressBars={transactionsPageQ.isFetching}
        onPaginationChange={(updater) => {
          clearSelection();
          setPagination(updater);
        }}
        onRowSelectionChange={setRowSelection}
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
          splitTxn ? txns.splitTxn(splitTxn.id, children) : Promise.resolve()
        }
        transferTxn={transferTxn}
        transferProjectOptions={transferProjectOptions}
        onCloseTransfer={() => setTransferTxn(null)}
        onTransfer={(input) =>
          transferTxn
            ? txns.transferTxn(transferTxn.id, input)
            : Promise.resolve()
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
              categoryId: projectRulePrompt.categoryId,
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
      />
    </Stack>
  );
}

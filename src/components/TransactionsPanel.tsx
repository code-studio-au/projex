import { useMemo, useState, useSyncExternalStore } from 'react';
import { Stack } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  type MRT_PaginationState,
  type MRT_SortingState,
} from 'mantine-react-table-open';
import type { TransactionsHook } from '../hooks/useTransactions';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import type {
  ProjectId,
  TransactionDrilldownFilter,
  Txn,
  TxnId,
} from '../types';
import type {
  ProjectRuleSuggestionPrompt,
  TxnBulkActionResult,
} from '../api/contract';
import { isCategorisableTxn } from '../utils/transactions';
import TransactionFiltersCard from './transactions/TransactionFiltersCard';
import TransactionsModalStack from './transactions/TransactionsModalStack';
import TransactionsDataTable from './transactions/TransactionsDataTable';
import TransactionsOverviewCard, {
  type TransactionView,
} from './transactions/TransactionsOverviewCard';
import { createTransactionColumns } from './transactions/transactionTableColumns';
import { asCategoryId, asSubCategoryId, asTxnId } from '../types/ids';
import {
  useTransactionCommentsQuery,
  useTransactionCommentSummariesQuery,
} from '../queries/transactionComments';
import { useTransactionsPageQuery } from '../queries/transactions';
import { useCreateProjectAutoCodingRuleMutation } from '../queries/projectAutoCodingRules';
import { showAppToast } from '../utils/toast';
import classes from '../styles/ui.module.css';

export type QuarterOption = 'Q1' | 'Q2' | 'Q3' | 'Q4';
const EMPTY_TXNS: Txn[] = [];

const hydrateSubscription = () => () => {};
const getClientHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

function toQuarterOption(value: string | null): QuarterOption | null {
  if (!value) return null;
  if (value === 'Q1' || value === 'Q2' || value === 'Q3' || value === 'Q4') {
    return value;
  }
  return null;
}

function formatTxnCountLabel(count: number) {
  return `${count} transaction${count === 1 ? '' : 's'}`;
}

function showBulkActionResultToast(args: {
  result: TxnBulkActionResult;
  successLabel: string;
}) {
  const { result, successLabel } = args;
  const missingCount = result.requestedCount - result.foundCount;
  const details = [
    result.unchangedCount > 0
      ? `${formatTxnCountLabel(result.unchangedCount)} already matched`
      : null,
    result.lockedCount > 0
      ? `${formatTxnCountLabel(result.lockedCount)} locked`
      : null,
    result.ineligibleCount > 0
      ? `${formatTxnCountLabel(result.ineligibleCount)} not eligible`
      : null,
    missingCount > 0
      ? `${formatTxnCountLabel(missingCount)} no longer found`
      : null,
  ].filter(Boolean);

  showAppToast({
    title:
      result.updatedCount > 0
        ? `Bulk ${successLabel} complete`
        : 'No changes applied',
    tone:
      result.updatedCount > 0 &&
      result.lockedCount === 0 &&
      result.ineligibleCount === 0 &&
      missingCount === 0
        ? 'success'
        : 'warning',
    message:
      result.updatedCount > 0
        ? `${successLabel} ${formatTxnCountLabel(result.updatedCount)}.${details.length > 0 ? ` ${details.join('. ')}.` : ''}`
        : details.length > 0
          ? details.join('. ')
          : 'The selected transactions already matched the requested state.',
    autoClose: 9000,
  });
}

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

  const [manageOpen, setManageOpen] = useState(false);
  const [splitTxn, setSplitTxn] = useState<Txn | null>(null);
  const [transferTxn, setTransferTxn] = useState<Txn | null>(null);
  const [commentsTxn, setCommentsTxn] = useState<Txn | null>(null);
  const [dismissedLinkedCommentTxnId, setDismissedLinkedCommentTxnId] =
    useState<TxnId | null>(null);
  const [expandedCommentsTxn, setExpandedCommentsTxn] = useState<Txn | null>(
    null
  );
  const [projectRulePrompt, setProjectRulePrompt] =
    useState<ProjectRuleSuggestionPrompt | null>(null);
  const [projectRuleMatchText, setProjectRuleMatchText] = useState('');
  const [projectRuleError, setProjectRuleError] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [bulkRecodeOpen, setBulkRecodeOpen] = useState(false);
  const [bulkRecodeCategoryId, setBulkRecodeCategoryId] = useState<
    string | null
  >(null);
  const [bulkRecodeSubCategoryId, setBulkRecodeSubCategoryId] = useState<
    string | null
  >(null);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const isHydrated = useSyncExternalStore(
    hydrateSubscription,
    getClientHydratedSnapshot,
    getServerHydratedSnapshot
  );
  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: isMobile ? 10 : 20,
  });
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'date', desc: true },
  ]);
  const paginationScopeKey = `${yearFilter ?? 'all'}-${quarterFilter ?? 'all'}-${monthFilterKey ?? 'all'}-${transactionView}-${transactionDrilldown?.kind ?? 'none'}-${transactionDrilldown?.kind === 'subcategory' ? transactionDrilldown.subCategoryId : (transactionDrilldown?.categoryId ?? 'all')}`;
  const transactionsPageInput = useMemo(() => {
    const sortField =
      sorting[0]?.id === 'transaction' ||
      sorting[0]?.id === 'amountCents' ||
      sorting[0]?.id === 'date'
        ? sorting[0].id
        : 'date';
    return {
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
      sort: {
        field: sortField,
        direction: sorting[0]?.desc ? 'desc' : 'asc',
      } as const,
      yearFilter,
      quarterFilter,
      monthFilterKey,
      transactionView,
      drilldown: transactionDrilldown
        ? transactionDrilldown.kind === 'subcategory'
          ? {
              kind: 'subcategory' as const,
              categoryId: transactionDrilldown.categoryId,
              subCategoryId: transactionDrilldown.subCategoryId,
            }
          : {
              kind: 'category' as const,
              categoryId: transactionDrilldown.categoryId,
            }
        : undefined,
    };
  }, [
    monthFilterKey,
    pagination.pageIndex,
    pagination.pageSize,
    quarterFilter,
    sorting,
    transactionDrilldown,
    transactionView,
    yearFilter,
  ]);
  const transactionsPageQ = useTransactionsPageQuery(
    projectId,
    transactionsPageInput,
    { enabled: isHydrated }
  );
  const commentSummariesQ = useTransactionCommentSummariesQuery(projectId);
  const createProjectRule = useCreateProjectAutoCodingRuleMutation(projectId);
  const expandedCommentsTxnId =
    expandedCommentsTxn?.id ?? asTxnId('__no_expanded_txn__');
  const expandedCommentsQ = useTransactionCommentsQuery(
    projectId,
    expandedCommentsTxnId,
    { enabled: Boolean(expandedCommentsTxn) }
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
    initialCommentTxnId && dismissedLinkedCommentTxnId !== initialCommentTxnId
      ? (txns.transactions.find((txn) => txn.id === initialCommentTxnId) ??
        null)
      : null;
  const activeCommentsTxn = commentsTxn ?? linkedCommentsTxn;
  const isTransitioningPageData =
    transactionsPageQ.isFetching && transactionsPageQ.isPlaceholderData;
  const pagedTxns = transactionsPageQ.data?.rows ?? EMPTY_TXNS;
  const selectedTxns = useMemo(
    () => pagedTxns.filter((txn) => rowSelection[txn.id]),
    [pagedTxns, rowSelection]
  );
  const selectedTxnIds = useMemo(
    () => selectedTxns.map((txn) => txn.id),
    [selectedTxns]
  );
  const pageSummary = transactionsPageQ.data?.summary ?? {
    totalCount: 0,
    budgetImpactCents: 0,
    uncodedCount: 0,
    uncodedCents: 0,
    sourceOnlyCount: 0,
    assignedToMeCount: 0,
    reviewedCount: 0,
    lockedCount: 0,
    invalidDateCount: 0,
  };
  const selectedAutoMappedPendingCount = useMemo(
    () =>
      selectedTxns.filter(
        (txn) =>
          !txn.lockedAt &&
          isCategorisableTxn(txn) &&
          !!txn.codingPendingApproval &&
          !!txn.subCategoryId &&
          taxonomy.validSubIds.has(txn.subCategoryId)
      ).length,
    [selectedTxns, taxonomy.validSubIds]
  );
  const selectedUnlockedCategorisableCount = useMemo(
    () =>
      selectedTxns.filter((txn) => !txn.lockedAt && isCategorisableTxn(txn))
        .length,
    [selectedTxns]
  );
  const bulkRecodeSubCategoryOptions = useMemo(
    () =>
      bulkRecodeCategoryId
        ? taxonomy.subCategoryOptionsForCategory(
            asCategoryId(bulkRecodeCategoryId)
          )
        : [],
    [bulkRecodeCategoryId, taxonomy]
  );

  const drilldownLabel = transactionDrilldown
    ? transactionDrilldown.kind === 'subcategory'
      ? `${transactionDrilldown.categoryName} > ${transactionDrilldown.subCategoryName}`
      : transactionDrilldown.categoryName
    : null;

  const autoMappedPendingTxns = useMemo(
    () =>
      txns.transactions.filter(
        (t) =>
          !t.lockedAt &&
          isCategorisableTxn(t) &&
          !!t.codingPendingApproval &&
          !!t.subCategoryId &&
          taxonomy.validSubIds.has(t.subCategoryId)
      ),
    [txns.transactions, taxonomy.validSubIds]
  );

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
        onResetPage={() =>
          setPagination((current) => ({ ...current, pageIndex: 0 }))
        }
        onClearSelection={() => setRowSelection({})}
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
        onClearSelection={() => setRowSelection({})}
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
          setRowSelection({});
          setPagination((current) => ({ ...current, pageIndex: 0 }));
          onClearTransactionDrilldown?.();
        }}
        invalidDateCount={pageSummary.invalidDateCount}
        projectRuleError={projectRuleError}
        projectRulePromptOpen={Boolean(projectRulePrompt)}
        onResetPage={() =>
          setPagination((current) => ({ ...current, pageIndex: 0 }))
        }
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
          setRowSelection({});
          setPagination(updater);
        }}
        onRowSelectionChange={setRowSelection}
        onSortingChange={(updater) => {
          const nextSorting =
            typeof updater === 'function' ? updater(sorting) : updater;
          setRowSelection({});
          setSorting(nextSorting);
          setPagination((current) => ({ ...current, pageIndex: 0 }));
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

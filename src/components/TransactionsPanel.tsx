import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  MantineReactTable,
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
import { formatCurrencyFromCents } from '../utils/money';
import { isCategorisableTxn } from '../utils/transactions';
import TransactionSplitModal from './TransactionSplitModal';
import TransactionTransferModal from './TransactionTransferModal';
import TransactionCommentsModal from './TransactionCommentsModal';
import TransactionBulkRecodeModal from './transactions/TransactionBulkRecodeModal';
import TransactionBulkActionsBar from './transactions/TransactionBulkActionsBar';
import { createTransactionColumns } from './transactions/transactionTableColumns';
import TaxonomyManagerModal from './TaxonomyManagerModal';
import { asCategoryId, asSubCategoryId, asTxnId } from '../types/ids';
import {
  useTransactionCommentsQuery,
  useTransactionCommentSummariesQuery,
} from '../queries/transactionComments';
import { useTransactionsPageQuery } from '../queries/transactions';
import { useCreateProjectAutoCodingRuleMutation } from '../queries/projectAutoCodingRules';
import { showAppToast } from '../utils/toast';
import classes from '../styles/ui.module.css';

type QuarterOption = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type TransactionView =
  | 'all'
  | 'uncoded'
  | 'auto-mapped-pending'
  | 'assigned-to-me';
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
      <Paper className={classes.filterCard} radius="xl">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <Select
            label="Year"
            placeholder="All years"
            data={yearFilterOptions}
            value={yearFilter}
            clearable
            onChange={(value) => {
              setRowSelection({});
              setPagination((current) => ({ ...current, pageIndex: 0 }));
              setYearFilter(value);
              setQuarterFilter(null);
              setMonthFilterKey(null);
            }}
            style={{ width: isMobile ? '100%' : 140 }}
          />
          <Select
            label="Quarter"
            placeholder="All quarters"
            data={quarterFilterOptions}
            value={quarterFilter}
            clearable
            disabled={!yearFilter}
            onChange={(value) => {
              setRowSelection({});
              setPagination((current) => ({ ...current, pageIndex: 0 }));
              setQuarterFilter(toQuarterOption(value));
              setMonthFilterKey(null);
            }}
            style={{ width: isMobile ? '100%' : 150 }}
          />
          <Select
            label="Month"
            placeholder="All months"
            data={monthFilterOptions}
            value={monthFilterKey}
            clearable
            onChange={(value) => {
              setRowSelection({});
              setPagination((current) => ({ ...current, pageIndex: 0 }));
              setMonthFilterKey(value);
            }}
            style={{ width: isMobile ? '100%' : 180 }}
          />
          <Button
            size="sm"
            variant="subtle"
            disabled={!yearFilter && !quarterFilter && !monthFilterKey}
            onClick={() => {
              setRowSelection({});
              setPagination((current) => ({ ...current, pageIndex: 0 }));
              onClearFilters();
            }}
          >
            Remove filter(s)
          </Button>
        </Group>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="md">
        <Stack gap="md">
          <Group gap="sm" align="center" wrap="wrap">
            <Badge variant="light">{pageSummary.totalCount} shown</Badge>
            <Badge
              variant="light"
              color={pageSummary.uncodedCount > 0 ? 'red' : 'gray'}
            >
              {pageSummary.uncodedCount} uncoded
              {pageSummary.uncodedCount > 0
                ? ` · ${formatCurrencyFromCents(
                    pageSummary.uncodedCents,
                    currencyCode
                  )}`
                : ''}
            </Badge>
            {pageSummary.assignedToMeCount > 0 ? (
              <Badge variant="light" color="orange">
                {pageSummary.assignedToMeCount} assigned to me
              </Badge>
            ) : null}
            {pageSummary.reviewedCount > 0 ? (
              <Badge variant="light" color="green">
                {pageSummary.reviewedCount} reviewed
              </Badge>
            ) : null}
            {pageSummary.lockedCount > 0 ? (
              <Badge variant="light" color="gray">
                {pageSummary.lockedCount} locked
              </Badge>
            ) : null}
            <Badge
              variant="light"
              color={autoMappedPendingTxns.length > 0 ? 'yellow' : 'gray'}
            >
              {autoMappedPendingTxns.length} pending review
            </Badge>
          </Group>

          {isHydrated ? (
            <Group gap="sm" align="flex-end" wrap="wrap">
              <Select
                label="View"
                data={[
                  { value: 'all', label: 'All' },
                  { value: 'uncoded', label: 'Uncoded only' },
                  {
                    value: 'auto-mapped-pending',
                    label: 'Auto-mapped pending approval',
                  },
                  { value: 'assigned-to-me', label: 'Assigned to me' },
                ]}
                value={transactionView}
                onChange={(v) => {
                  setRowSelection({});
                  setPagination((current) => ({ ...current, pageIndex: 0 }));
                  setTransactionView(
                    v === 'uncoded' ||
                      v === 'auto-mapped-pending' ||
                      v === 'assigned-to-me'
                      ? v
                      : 'all'
                  );
                }}
                style={{ width: isMobile ? '100%' : 250 }}
              />
              <Button
                variant="light"
                color="teal"
                size="sm"
                fullWidth={isMobile}
                disabled={readOnly || autoMappedPendingTxns.length === 0}
                onClick={() => {
                  void runBulkAction({
                    input: {
                      action: 'approveAutoMappings',
                      txnIds: autoMappedPendingTxns.map((txn) => txn.id),
                    },
                    successLabel: 'Approved',
                    clearSelection: false,
                  });
                }}
              >
                Accept all auto-mappings ({autoMappedPendingTxns.length})
              </Button>
              <Button
                variant="light"
                size="sm"
                fullWidth={isMobile}
                disabled={readOnly || !canEditTaxonomy}
                onClick={() => setManageOpen(true)}
              >
                Manage categories
              </Button>
            </Group>
          ) : (
            <Paper className={classes.surfaceMuted} radius="xl" p="md">
              <Text size="sm" c="dimmed">
                Loading transaction controls...
              </Text>
            </Paper>
          )}

          {isHydrated && !readOnly && selectedTxnIds.length > 0 ? (
            <TransactionBulkActionsBar
              selectedCountLabel={formatTxnCountLabel(selectedTxnIds.length)}
              selectedAutoMappedPendingCount={selectedAutoMappedPendingCount}
              selectedUnlockedCategorisableCount={
                selectedUnlockedCategorisableCount
              }
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
            />
          ) : null}

          {drilldownLabel ? (
            <Group gap="sm" align="center" wrap="wrap">
              <Badge variant="light" color="blue">
                Budget drilldown
              </Badge>
              <Text size="sm" c="dimmed">
                Showing budget-impact transactions for {drilldownLabel}.
              </Text>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  setRowSelection({});
                  setPagination((current) => ({ ...current, pageIndex: 0 }));
                  onClearTransactionDrilldown?.();
                }}
              >
                Clear drilldown
              </Button>
            </Group>
          ) : null}

          {pageSummary.invalidDateCount > 0 && (
            <Text size="sm" c="dimmed">
              {pageSummary.invalidDateCount} transaction(s) have invalid dates
              and may be excluded from month filters or rollups.
            </Text>
          )}

          {projectRuleError && !projectRulePrompt ? (
            <Alert color="red">{projectRuleError}</Alert>
          ) : null}
        </Stack>
      </Paper>

      <div className={classes.tableBreakout}>
        {!isHydrated ||
        transactionsPageQ.isLoading ||
        isTransitioningPageData ? (
          <Paper className={classes.surfaceCard} radius="xl" p="lg">
            <Text c="dimmed">
              {!isHydrated
                ? 'Loading transactions...'
                : transactionDrilldown
                  ? 'Loading budget drilldown transactions...'
                  : 'Loading transactions...'}
            </Text>
          </Paper>
        ) : (
          <div className={classes.tableWrap}>
            <MantineReactTable
              key={paginationScopeKey}
              columns={txnColumns}
              data={pagedTxns}
              getRowId={(row) => row.id}
              enableRowSelection={!readOnly}
              enableEditing={!readOnly}
              editDisplayMode="cell"
              state={{
                pagination,
                rowSelection,
                sorting,
                showProgressBars: transactionsPageQ.isFetching,
              }}
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
              enableColumnResizing
              enableColumnActions={false}
              enableSorting
              enableSortingRemoval={false}
              manualPagination
              manualSorting
              rowCount={pageSummary.totalCount}
              enablePagination
              autoResetPageIndex={false}
              initialState={{
                density: 'xs',
              }}
              mantineTableContainerProps={{
                className: 'financeTable txnTable',
              }}
              mantineTableBodyCellProps={{ style: { verticalAlign: 'middle' } }}
              mantineTableProps={{
                highlightOnHover: true,
                striped: 'odd',
                withTableBorder: true,
                style: { tableLayout: 'auto' },
              }}
              enableTopToolbar={false}
              enableDensityToggle={false}
              enableFullScreenToggle={false}
              mantineTableBodyRowProps={({ row }) => {
                const ok =
                  !!row.original.subCategoryId &&
                  taxonomy.validSubIds.has(row.original.subCategoryId);
                return isCategorisableTxn(row.original) && !ok
                  ? { style: { outline: '1px solid rgba(255,0,0,0.20)' } }
                  : {};
              }}
            />
          </div>
        )}
      </div>

      <TaxonomyManagerModal
        opened={manageOpen}
        onClose={() => setManageOpen(false)}
        taxonomy={taxonomy}
        readOnly={!canEditTaxonomy}
      />

      <TransactionSplitModal
        opened={Boolean(splitTxn)}
        txn={splitTxn}
        taxonomy={taxonomy}
        currencyCode={currencyCode}
        onClose={() => setSplitTxn(null)}
        onSplit={(children) =>
          splitTxn ? txns.splitTxn(splitTxn.id, children) : Promise.resolve()
        }
      />

      <TransactionTransferModal
        opened={Boolean(transferTxn)}
        txn={transferTxn}
        currencyCode={currencyCode}
        projectOptions={transferProjectOptions}
        onClose={() => setTransferTxn(null)}
        onTransfer={(input) =>
          transferTxn
            ? txns.transferTxn(transferTxn.id, input)
            : Promise.resolve()
        }
      />

      <TransactionCommentsModal
        opened={Boolean(activeCommentsTxn)}
        txn={activeCommentsTxn}
        onClose={() => {
          setCommentsTxn(null);
          if (initialCommentTxnId) {
            setDismissedLinkedCommentTxnId(initialCommentTxnId);
          }
        }}
      />

      <TransactionBulkRecodeModal
        opened={bulkRecodeOpen}
        categoryId={bulkRecodeCategoryId}
        subCategoryId={bulkRecodeSubCategoryId}
        categoryOptions={taxonomy.categoryOptions}
        subCategoryOptions={bulkRecodeSubCategoryOptions}
        onClose={() => setBulkRecodeOpen(false)}
        onCategoryChange={setBulkRecodeCategoryId}
        onSubCategoryChange={setBulkRecodeSubCategoryId}
        onSubmit={async () => {
          if (!bulkRecodeCategoryId || !bulkRecodeSubCategoryId) return;
          const result = await runBulkAction({
            input: {
              action: 'recode',
              txnIds: selectedTxnIds,
              categoryId: asCategoryId(bulkRecodeCategoryId),
              subCategoryId: asSubCategoryId(bulkRecodeSubCategoryId),
            },
            successLabel: 'Recoded',
          });
          if (result) {
            setBulkRecodeOpen(false);
          }
        }}
      />

      <Modal
        opened={Boolean(projectRulePrompt)}
        onClose={() => {
          setProjectRulePrompt(null);
          setProjectRuleError(null);
        }}
        title="Create project auto-coding rule?"
        centered
      >
        <Stack gap="md">
          {projectRuleError ? (
            <Alert color="red">{projectRuleError}</Alert>
          ) : null}
          <Text size="sm" c="dimmed">
            This pattern has now been manually coded{' '}
            {projectRulePrompt?.supportingCount ?? 0} times. Create a project
            rule now to auto-code future imports and mark matching uncoded
            transactions for approval.
          </Text>
          <TextInput
            label="Match text"
            value={projectRuleMatchText}
            onChange={(event) => {
              setProjectRuleError(null);
              setProjectRuleMatchText(event.currentTarget.value);
            }}
          />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => {
                setProjectRulePrompt(null);
                setProjectRuleError(null);
              }}
            >
              Not now
            </Button>
            <Button
              disabled={
                createProjectRule.isPending ||
                !projectRulePrompt ||
                !projectRuleMatchText.trim()
              }
              onClick={async () => {
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
            >
              Create rule
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  ActionIcon,
  Badge,
  Button,
  Collapse,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  MantineReactTable,
  type MRT_ColumnDef,
  type MRT_PaginationState,
  type MRT_SortingState,
} from 'mantine-react-table-open';
import {
  IconDotsVertical,
  IconLock,
  IconMessageCircle,
  IconSettings,
} from '@tabler/icons-react';
import type { TransactionsHook } from '../hooks/useTransactions';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import type {
  ProjectId,
  TransactionDrilldownFilter,
  Txn,
  TxnComment,
  TxnId,
} from '../types';
import type {
  ProjectRuleSuggestionPrompt,
  TxnBulkActionResult,
} from '../api/contract';
import { formatCurrencyFromCents, fromCents, toCents } from '../utils/money';
import {
  buildTxnCommentRepliesByParent,
  formatTxnCommentDateTime,
} from '../utils/transactionComments';
import {
  isBudgetImpactTxn,
  isCategorisableTxn,
  txnTypeLabel,
} from '../utils/transactions';
import TransactionSplitModal from './TransactionSplitModal';
import TransactionTransferModal from './TransactionTransferModal';
import TransactionCommentsModal from './TransactionCommentsModal';
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

function commentExcerpt(value: string | undefined): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'No comment text';
  return normalized.length > 96
    ? `${normalized.slice(0, 96).trim()}...`
    : normalized;
}

function commentInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
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

  function canSplitTransaction(txn: Txn): boolean {
    return (
      !readOnly &&
      !txn.lockedAt &&
      isBudgetImpactTxn(txn) &&
      isCategorisableTxn(txn) &&
      (txn.txnType === 'standard' || txn.txnType === 'transfer_child')
    );
  }

  function canTransferTransaction(txn: Txn): boolean {
    return (
      !readOnly &&
      transferOutEnabled &&
      !txn.lockedAt &&
      transferProjectOptions.length > 0 &&
      isBudgetImpactTxn(txn) &&
      isCategorisableTxn(txn) &&
      (txn.txnType === 'standard' || txn.txnType === 'split_child')
    );
  }

  function canEditTxnAmount(txn: Txn): boolean {
    return (
      !readOnly &&
      txn.txnType !== 'split_parent' &&
      txn.txnType !== 'transfer_source' &&
      txn.txnType !== 'transfer_child'
    );
  }

  function applyProjectRulePrompt(prompt: ProjectRuleSuggestionPrompt | null) {
    if (!prompt) return;
    setProjectRuleError(null);
    setProjectRulePrompt(prompt);
    setProjectRuleMatchText(prompt.suggestedMatchText);
  }

  function moveToSubcategoryCell(args: {
    row: Parameters<
      NonNullable<MRT_ColumnDef<(typeof txns.transactions)[number]>['Edit']>
    >[0]['row'];
    table: Parameters<
      NonNullable<MRT_ColumnDef<(typeof txns.transactions)[number]>['Edit']>
    >[0]['table'];
  }) {
    const nextCell = args.row
      .getAllCells()
      .find((cell) => cell.column.id === 'subCategory');
    args.table.setEditingCell(nextCell ?? null);
  }

  function renderCompactComment(
    comment: TxnComment,
    nested = false,
    onActivate?: () => void
  ) {
    return (
      <Paper
        key={comment.id}
        className={`${classes.commentCard}${comment.resolvedAt ? ` ${classes.commentCardResolved}` : ''}${nested ? ` ${classes.commentCardReply}` : ''}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onActivate?.();
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onActivate?.();
        }}
      >
        <Stack gap={4}>
          <div className={classes.commentHeader}>
            <div className={classes.commentAuthorBlock}>
              <span className={classes.commentAvatar}>
                {commentInitials(comment.createdByName)}
              </span>
              <div className={classes.commentMeta}>
                <Group gap={6} wrap="wrap">
                  <Text fw={650} size="xs">
                    {comment.createdByName}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {formatTxnCommentDateTime(comment.createdAt)}
                  </Text>
                  {comment.resolvedAt ? (
                    <Badge size="xs" color="green" variant="light">
                      Resolved
                    </Badge>
                  ) : null}
                </Group>
              </div>
            </div>
          </div>
          <Text size="xs" lineClamp={3} style={{ whiteSpace: 'pre-wrap' }}>
            {comment.body}
          </Text>
        </Stack>
      </Paper>
    );
  }

  function renderExpandedCommentThread(txn: Txn) {
    const isExpanded = expandedCommentsTxn?.id === txn.id;
    if (!isExpanded) return null;

    const comments = expandedCommentsQ.data ?? [];
    const repliesByParent = buildTxnCommentRepliesByParent(comments);
    const topLevelComments = comments.filter(
      (comment) => !comment.parentCommentId
    );

    return (
      <Collapse expanded={isExpanded}>
        <Stack gap="xs" mt={4} className={classes.commentInlineThread}>
          {expandedCommentsQ.isLoading ? (
            <Text size="xs" c="dimmed">
              Loading thread...
            </Text>
          ) : topLevelComments.length > 0 ? (
            topLevelComments.map((comment) => (
              <Stack key={comment.id} gap={4}>
                {renderCompactComment(comment, false, () =>
                  setCommentsTxn(txn)
                )}
                {(repliesByParent.get(comment.id) ?? []).map((reply) =>
                  renderCompactComment(reply, true, () => setCommentsTxn(txn))
                )}
              </Stack>
            ))
          ) : (
            <Text size="xs" c="dimmed">
              No thread comments found.
            </Text>
          )}
        </Stack>
      </Collapse>
    );
  }

  // Note: keep columns as a plain value (no manual memoization).
  // This avoids conflicts with the React Compiler's memoization preservation rule.
  const txnColumns: MRT_ColumnDef<(typeof txns.transactions)[number]>[] = [
    {
      accessorKey: 'date',
      header: 'Date',
      size: 92,
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
      Cell: ({ cell }) => (
        <Text className="table-body-left">{cell.getValue<string>()}</Text>
      ),
    },
    {
      id: 'transaction',
      header: 'Transaction',
      accessorFn: (row) => `${row.item} ${row.description}`.trim(),
      size: 330,
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
      Cell: ({ row }) => {
        const provenanceLabel =
          row.original.txnType === 'standard'
            ? null
            : txnTypeLabel(row.original);
        const description = row.original.description.trim();
        const hasValidSubCategory =
          !!row.original.subCategoryId &&
          taxonomy.validSubIds.has(row.original.subCategoryId);
        const showStateBadges =
          !!provenanceLabel ||
          !!row.original.lockedAt ||
          !!row.original.reviewedAt ||
          (!!row.original.codingPendingApproval && hasValidSubCategory);
        return (
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text className="table-body-left-bold" lineClamp={1}>
              {row.original.item}
            </Text>
            <Text c="dimmed" className="table-body-left" lineClamp={2}>
              {description || 'No description provided'}
            </Text>
            {showStateBadges ? (
              <Group gap={6} wrap="wrap">
                {row.original.lockedAt ? (
                  <Badge
                    size="xs"
                    color="gray"
                    variant="light"
                    leftSection={<IconLock size={11} />}
                  >
                    Locked
                  </Badge>
                ) : row.original.reviewedAt ? (
                  <Badge size="xs" color="green" variant="light">
                    Reviewed
                  </Badge>
                ) : null}
                {provenanceLabel ? (
                  <Badge size="xs" color="blue" variant="light">
                    {provenanceLabel}
                  </Badge>
                ) : null}
                {row.original.codingPendingApproval && hasValidSubCategory ? (
                  <Badge size="xs" color="yellow" variant="light">
                    Auto-mapped
                  </Badge>
                ) : null}
              </Group>
            ) : null}
          </Stack>
        );
      },
    },
    {
      id: 'comments',
      header: 'Comments',
      size: 292,
      enableEditing: false,
      enableSorting: false,
      Cell: ({ row }) => {
        const summary = commentSummaryByTxnId.get(row.original.id);
        const isExpanded = expandedCommentsTxn?.id === row.original.id;

        if (!summary) {
          return (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconMessageCircle size={14} />}
              onClick={() => setCommentsTxn(row.original)}
            >
              Add comment
            </Button>
          );
        }

        const threadResolved = summary.resolvedCount > 0;

        return (
          <Stack gap={6} style={{ minWidth: 0 }}>
            {isExpanded ? (
              renderExpandedCommentThread(row.original)
            ) : (
              <Paper
                className={classes.commentSummaryCard}
                onClick={() => setCommentsTxn(row.original)}
              >
                <Stack gap={4} style={{ minWidth: 0 }}>
                  <Group gap={5} wrap="wrap">
                    {threadResolved ? (
                      <Badge size="xs" variant="light" color="green">
                        Resolved
                      </Badge>
                    ) : summary.unresolvedCount > 0 ? (
                      <Badge size="xs" variant="light" color="yellow">
                        Unresolved
                      </Badge>
                    ) : null}
                    {!threadResolved &&
                    summary.assignedToMeUnresolvedCount > 0 ? (
                      <Badge size="xs" variant="light" color="orange">
                        Assigned to me
                      </Badge>
                    ) : null}
                  </Group>
                  <Group gap={8} align="flex-start" wrap="nowrap">
                    <span className={classes.commentAvatar}>
                      {commentInitials(
                        summary.latestCommentAuthorName ?? 'Someone'
                      )}
                    </span>
                    <Stack gap={3} style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={650} size="xs">
                        {summary.latestCommentAuthorName ?? 'Someone'}
                      </Text>
                      {summary.latestCommentCreatedAt ? (
                        <Text size="xs" c="dimmed">
                          {formatTxnCommentDateTime(
                            summary.latestCommentCreatedAt
                          )}
                        </Text>
                      ) : null}
                      <Text
                        size="xs"
                        lineClamp={2}
                        style={{ whiteSpace: 'pre-wrap' }}
                      >
                        {commentExcerpt(summary.latestCommentBody)}
                      </Text>
                    </Stack>
                  </Group>
                </Stack>
              </Paper>
            )}
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() =>
                setExpandedCommentsTxn(isExpanded ? null : row.original)
              }
            >
              {isExpanded
                ? 'Hide thread'
                : `View thread (${summary.totalCount} comment${summary.totalCount === 1 ? '' : 's'})`}
            </Button>
          </Stack>
        );
      },
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
    },
    {
      accessorKey: 'amountCents',
      header: 'Amount',
      size: 118,
      enableEditing: (row) => canEditTxnAmount(row.original),
      Edit: ({ row, table }) => (
        <NumberInput
          value={fromCents(row.original.amountCents)}
          size="xs"
          thousandSeparator=","
          prefix="$"
          decimalScale={2}
          fixedDecimalScale
          hideControls
          styles={{ input: { textAlign: 'right' } }}
          onChange={(value) => {
            void txns
              .updateTxn(row.original.id, {
                amountCents: toCents(Number(value ?? 0)),
              })
              .then(() => table.setEditingCell(null));
          }}
        />
      ),
      Cell: ({ cell, row }) => {
        const excluded = !isBudgetImpactTxn(row.original);
        return (
          <Stack gap={2} align="flex-end">
            <Text className="table-body-emphasis">
              {formatCurrencyFromCents(cell.getValue<number>(), currencyCode)}
            </Text>
            {excluded ? (
              <Text size="xs" c="dimmed">
                Excluded
              </Text>
            ) : null}
          </Stack>
        );
      },
      mantineTableBodyCellProps: {
        className: 'table-body-right txnTable-cell',
      },
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-right txnTable-head',
      },
    },
    {
      id: 'category',
      header: 'Category',
      size: 156,
      enableEditing: !readOnly,
      enableSorting: false,
      Edit: ({ row, table }) => {
        const canCode =
          !readOnly &&
          !row.original.lockedAt &&
          isCategorisableTxn(row.original);
        const current = row.original.categoryId ?? null;
        const shouldAutoAdvance =
          !row.original.subCategoryId ||
          !taxonomy.validSubIds.has(row.original.subCategoryId);
        return (
          <Select
            data={taxonomy.categoryOptions}
            value={current}
            placeholder="Select category"
            searchable
            clearable
            disabled={!canCode}
            onChange={(v) => {
              void txns
                .updateTxn(row.original.id, {
                  categoryId: v ? asCategoryId(v) : null,
                  subCategoryId: null,
                  companyDefaultMappingRuleId: null,
                  codingSource: 'manual',
                  codingPendingApproval: false,
                })
                .then(() => {
                  if (!v || !shouldAutoAdvance) {
                    table.setEditingCell(null);
                    return;
                  }
                  moveToSubcategoryCell({ row, table });
                });
            }}
          />
        );
      },
      Cell: ({ row }) => {
        if (!isCategorisableTxn(row.original)) {
          return (
            <Badge color="gray" variant="light">
              Source only
            </Badge>
          );
        }
        const cat = taxonomy.getCategoryName(row.original.categoryId);
        const isCategoryCoded = !!row.original.categoryId;
        return (
          <Group gap="xs" wrap="wrap">
            <Text
              className="table-body-left"
              c={row.original.categoryId ? undefined : 'dimmed'}
            >
              {cat}
            </Text>
            {!isCategoryCoded && (
              <Badge color="red" variant="light">
                Uncoded
              </Badge>
            )}
          </Group>
        );
      },
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
    },
    {
      id: 'subCategory',
      header: 'Subcategory',
      size: 188,
      enableEditing: !readOnly,
      enableSorting: false,
      Edit: ({ row, table }) => {
        const canCode =
          !readOnly &&
          !row.original.lockedAt &&
          isCategorisableTxn(row.original);
        const catId = row.original.categoryId;
        const options = catId
          ? taxonomy.subCategoryOptionsForCategory(catId)
          : [];
        const current = row.original.subCategoryId ?? null;
        return (
          <Select
            data={options}
            value={current}
            placeholder={catId ? 'Select subcategory' : 'Pick category first'}
            searchable
            clearable
            disabled={!catId || !canCode}
            onChange={(v) => {
              setProjectRuleError(null);
              void txns
                .updateTxn(row.original.id, {
                  categoryId: catId ?? null,
                  subCategoryId: v ? asSubCategoryId(v) : null,
                  companyDefaultMappingRuleId: null,
                  codingSource: 'manual',
                  codingPendingApproval: false,
                })
                .then((result) => {
                  table.setEditingCell(null);
                  applyProjectRulePrompt(result.projectRulePrompt);
                })
                .catch((error) => {
                  setProjectRuleError(
                    error instanceof Error
                      ? error.message
                      : 'Could not update transaction coding.'
                  );
                });
            }}
          />
        );
      },
      Cell: ({ row }) => {
        if (!isCategorisableTxn(row.original)) {
          return (
            <Badge color="gray" variant="light">
              Source only
            </Badge>
          );
        }
        const sub = taxonomy.getSubCategoryName(row.original.subCategoryId);
        const isFullyCoded =
          !!row.original.subCategoryId &&
          taxonomy.validSubIds.has(row.original.subCategoryId);
        return (
          <Group gap="xs" wrap="wrap">
            <Text className="table-body-left">{sub}</Text>
            {!isFullyCoded && (
              <Badge color="red" variant="light">
                Uncoded
              </Badge>
            )}
          </Group>
        );
      },
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
    },
    {
      id: 'actions',
      header: '',
      Header: () => <IconSettings size={16} aria-label="Actions" />,
      size: 58,
      enableEditing: false,
      enableSorting: false,
      Cell: ({ row }) => {
        const canSplit = canSplitTransaction(row.original);
        const canTransfer = canTransferTransaction(row.original);
        const hasValidSubCategory =
          !!row.original.subCategoryId &&
          taxonomy.validSubIds.has(row.original.subCategoryId);
        const canApproveAutoMapping =
          !readOnly &&
          !row.original.lockedAt &&
          row.original.codingPendingApproval &&
          hasValidSubCategory;
        return (
          <Menu withinPortal position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={`Actions for ${row.original.item}`}
              >
                <IconDotsVertical size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconMessageCircle size={14} />}
                onClick={() => setCommentsTxn(row.original)}
              >
                Comments
              </Menu.Item>
              {!readOnly ? (
                <>
                  <Menu.Divider />
                  <Menu.Item
                    onClick={() =>
                      void txns.updateWorkflowState(row.original.id, {
                        reviewed: !row.original.reviewedAt,
                      })
                    }
                  >
                    {row.original.reviewedAt
                      ? 'Mark unreviewed'
                      : 'Mark reviewed'}
                  </Menu.Item>
                  {canApproveAutoMapping ? (
                    <Menu.Item
                      onClick={() => {
                        void txns.updateTxn(row.original.id, {
                          codingPendingApproval: false,
                        });
                      }}
                    >
                      Approve auto-mapping
                    </Menu.Item>
                  ) : null}
                  <Menu.Item
                    onClick={() =>
                      void txns.updateWorkflowState(row.original.id, {
                        locked: !row.original.lockedAt,
                      })
                    }
                  >
                    {row.original.lockedAt
                      ? 'Unlock transaction'
                      : 'Lock transaction'}
                  </Menu.Item>
                  <Menu.Divider />
                </>
              ) : null}
              <Menu.Item
                disabled={!canSplit}
                onClick={() => setSplitTxn(row.original)}
              >
                Split transaction
              </Menu.Item>
              <Menu.Item
                disabled={!canTransfer}
                onClick={() => setTransferTxn(row.original)}
              >
                Move to project
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        );
      },
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
    },
  ];

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
            <Paper className={classes.surfaceMuted} radius="xl" p="md">
              <Stack gap="sm">
                <Group gap="sm" align="center" wrap="wrap">
                  <Text size="sm" fw={600}>
                    {formatTxnCountLabel(selectedTxnIds.length)} selected on
                    this page
                  </Text>
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    onClick={() => setRowSelection({})}
                  >
                    Clear selection
                  </Button>
                </Group>
                <Group gap="sm" wrap="wrap">
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => {
                      void runBulkAction({
                        input: {
                          action: 'setReviewed',
                          txnIds: selectedTxnIds,
                          reviewed: true,
                        },
                        successLabel: 'Reviewed',
                      });
                    }}
                  >
                    Mark reviewed
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="gray"
                    onClick={() => {
                      void runBulkAction({
                        input: {
                          action: 'setReviewed',
                          txnIds: selectedTxnIds,
                          reviewed: false,
                        },
                        successLabel: 'Marked unreviewed for',
                      });
                    }}
                  >
                    Mark unreviewed
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="dark"
                    onClick={() => {
                      void runBulkAction({
                        input: {
                          action: 'setLocked',
                          txnIds: selectedTxnIds,
                          locked: true,
                        },
                        successLabel: 'Locked',
                      });
                    }}
                  >
                    Lock
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="gray"
                    onClick={() => {
                      void runBulkAction({
                        input: {
                          action: 'setLocked',
                          txnIds: selectedTxnIds,
                          locked: false,
                        },
                        successLabel: 'Unlocked',
                      });
                    }}
                  >
                    Unlock
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="teal"
                    disabled={selectedAutoMappedPendingCount === 0}
                    onClick={() => {
                      void runBulkAction({
                        input: {
                          action: 'approveAutoMappings',
                          txnIds: selectedTxnIds,
                        },
                        successLabel: 'Approved',
                      });
                    }}
                  >
                    Approve auto-mappings ({selectedAutoMappedPendingCount})
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    disabled={selectedUnlockedCategorisableCount === 0}
                    onClick={() => {
                      setBulkRecodeCategoryId(null);
                      setBulkRecodeSubCategoryId(null);
                      setBulkRecodeOpen(true);
                    }}
                  >
                    Recode selected
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    disabled={selectedUnlockedCategorisableCount === 0}
                    onClick={() => {
                      void runBulkAction({
                        input: {
                          action: 'clearCoding',
                          txnIds: selectedTxnIds,
                        },
                        successLabel: 'Cleared coding for',
                      });
                    }}
                  >
                    Clear coding
                  </Button>
                </Group>
              </Stack>
            </Paper>
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

      <Modal
        opened={bulkRecodeOpen}
        onClose={() => setBulkRecodeOpen(false)}
        title="Bulk recode selected transactions"
        centered
        lockScroll={false}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Recode the selected unlocked, categorisable transactions to a single
            category and subcategory. Locked or ineligible rows will be skipped
            and reported in the result.
          </Text>
          <Select
            label="Category"
            data={taxonomy.categoryOptions}
            value={bulkRecodeCategoryId}
            placeholder="Select category"
            searchable
            clearable
            onChange={(value) => {
              setBulkRecodeCategoryId(value);
              setBulkRecodeSubCategoryId(null);
            }}
          />
          <Select
            label="Subcategory"
            data={bulkRecodeSubCategoryOptions}
            value={bulkRecodeSubCategoryId}
            placeholder={
              bulkRecodeCategoryId
                ? 'Select subcategory'
                : 'Select a category first'
            }
            searchable
            clearable
            disabled={!bulkRecodeCategoryId}
            onChange={setBulkRecodeSubCategoryId}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setBulkRecodeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!bulkRecodeCategoryId || !bulkRecodeSubCategoryId}
              onClick={async () => {
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
            >
              Recode selected
            </Button>
          </Group>
        </Stack>
      </Modal>

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

import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  MantineReactTable,
  type MRT_ColumnDef,
  type MRT_PaginationState,
  type MRT_SortingState,
} from 'mantine-react-table';
import {
  IconDotsVertical,
  IconLock,
  IconMessageCircle,
  IconSettings,
} from '@tabler/icons-react';
import type { TransactionsHook } from '../hooks/useTransactions';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import type { ProjectId, Txn } from '../types';
import { monthKeyFromStart, monthStart, parseISODate } from '../utils/finance';
import { formatCurrencyFromCents } from '../utils/money';
import {
  isBudgetImpactTxn,
  isCategorisableTxn,
  txnTypeLabel,
} from '../utils/transactions';
import TransactionSplitModal from './TransactionSplitModal';
import TransactionTransferModal from './TransactionTransferModal';
import TransactionCommentsModal from './TransactionCommentsModal';
import TaxonomyManagerModal from './TaxonomyManagerModal';
import { asCategoryId, asSubCategoryId } from '../types/ids';
import { useTransactionCommentSummariesQuery } from '../queries/transactionComments';

type QuarterOption = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type TransactionView =
  | 'all'
  | 'uncoded'
  | 'auto-mapped-pending'
  | 'assigned-to-me';

function toQuarterOption(value: string | null): QuarterOption | null {
  if (!value) return null;
  if (value === 'Q1' || value === 'Q2' || value === 'Q3' || value === 'Q4') {
    return value;
  }
  return null;
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
    transferProjectOptions,
    onClearFilters,
    canEditTaxonomy,
    readOnly = false,
  } = props;

  const [manageOpen, setManageOpen] = useState(false);
  const [splitTxn, setSplitTxn] = useState<Txn | null>(null);
  const [transferTxn, setTransferTxn] = useState<Txn | null>(null);
  const [commentsTxn, setCommentsTxn] = useState<Txn | null>(null);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: isMobile ? 10 : 20,
  });
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'date', desc: true },
  ]);
  const commentSummariesQ = useTransactionCommentSummariesQuery(projectId);
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

  /**
   * Count invalid transaction dates so the UI can surface problems early.
   * We keep this local (UI concern) rather than making the store reject rows,
   * because CSV imports and manual edits can be messy during prototyping.
   */
  const invalidDateCount = useMemo(() => {
    let bad = 0;
    for (const t of txns.transactions) {
      try {
        parseISODate(t.date);
      } catch {
        bad += 1;
      }
    }
    return bad;
  }, [txns.transactions]);

  const filteredTxns = useMemo(() => {
    let out = txns.transactions;
    if (monthFilterKey) {
      out = out.filter((t) => {
        try {
          const mk = monthKeyFromStart(monthStart(parseISODate(t.date)));
          return mk === monthFilterKey;
        } catch {
          // Invalid dates never match a specific month filter.
          return false;
        }
      });
    } else if (yearFilter || quarterFilter) {
      out = out.filter((t) => {
        try {
          const mk = monthKeyFromStart(monthStart(parseISODate(t.date)));
          const year = mk.slice(0, 4);
          const month = Number(mk.slice(5, 7));
          const quarter =
            month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
          if (yearFilter && year !== yearFilter) return false;
          if (quarterFilter && quarter !== quarterFilter) return false;
          return true;
        } catch {
          return false;
        }
      });
    }
    if (transactionView === 'uncoded')
      out = out.filter(
        (t) =>
          isCategorisableTxn(t) &&
          (!t.subCategoryId || !taxonomy.validSubIds.has(t.subCategoryId))
      );
    if (transactionView === 'auto-mapped-pending')
      out = out.filter(
        (t) =>
          isCategorisableTxn(t) &&
          !!t.codingPendingApproval &&
          !!t.subCategoryId &&
          taxonomy.validSubIds.has(t.subCategoryId)
      );
    if (transactionView === 'assigned-to-me')
      out = out.filter(
        (t) =>
          (commentSummaryByTxnId.get(t.id)?.assignedToMeUnresolvedCount ?? 0) >
          0
      );
    return out;
  }, [
    commentSummaryByTxnId,
    txns.transactions,
    yearFilter,
    quarterFilter,
    monthFilterKey,
    transactionView,
    taxonomy.validSubIds,
  ]);

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

  const visibleMetrics = useMemo(() => {
    let budgetImpactCents = 0;
    let uncodedCount = 0;
    let uncodedCents = 0;
    let sourceOnlyCount = 0;
    let assignedToMeCount = 0;
    let reviewedCount = 0;
    let lockedCount = 0;

    for (const txn of filteredTxns) {
      const summary = commentSummaryByTxnId.get(txn.id);
      if (isBudgetImpactTxn(txn)) {
        budgetImpactCents += txn.amountCents;
      }
      if (!isBudgetImpactTxn(txn) || !isCategorisableTxn(txn)) {
        sourceOnlyCount += 1;
      }
      const isUncoded =
        isCategorisableTxn(txn) &&
        (!txn.subCategoryId || !taxonomy.validSubIds.has(txn.subCategoryId));
      if (isUncoded) {
        uncodedCount += 1;
        if (isBudgetImpactTxn(txn)) {
          uncodedCents += txn.amountCents;
        }
      }
      if ((summary?.assignedToMeUnresolvedCount ?? 0) > 0) {
        assignedToMeCount += 1;
      }
      if (txn.reviewedAt) reviewedCount += 1;
      if (txn.lockedAt) lockedCount += 1;
    }

    return {
      assignedToMeCount,
      budgetImpactCents,
      lockedCount,
      reviewedCount,
      sourceOnlyCount,
      uncodedCents,
      uncodedCount,
    };
  }, [commentSummaryByTxnId, filteredTxns, taxonomy.validSubIds]);

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
      !txn.lockedAt &&
      transferProjectOptions.length > 0 &&
      isBudgetImpactTxn(txn) &&
      isCategorisableTxn(txn) &&
      (txn.txnType === 'standard' || txn.txnType === 'split_child')
    );
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
        const description = row.original.description.trim();
        const commentSummary = commentSummaryByTxnId.get(row.original.id);
        return (
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text className="table-body-left-bold" lineClamp={1}>
              {row.original.item}
            </Text>
            <Text c="dimmed" className="table-body-left" lineClamp={2}>
              {description || 'No description provided'}
            </Text>
            {commentSummary ? (
              <Group gap={4} wrap="wrap">
                <Badge size="xs" variant="light" color="gray">
                  {commentSummary.totalCount} comment
                  {commentSummary.totalCount === 1 ? '' : 's'}
                </Badge>
                {commentSummary.assignedToMeUnresolvedCount > 0 ? (
                  <Badge size="xs" variant="light" color="orange">
                    Assigned to me
                  </Badge>
                ) : null}
              </Group>
            ) : null}
          </Stack>
        );
      },
    },
    {
      accessorKey: 'amountCents',
      header: 'Amount',
      size: 118,
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
        const cat = taxonomy.getCategoryName(row.original.categoryId);
        return (
          <Text
            className="table-body-left"
            c={row.original.categoryId ? undefined : 'dimmed'}
          >
            {cat}
          </Text>
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
              void txns
                .updateTxn(row.original.id, {
                  categoryId: catId ?? null,
                  subCategoryId: v ? asSubCategoryId(v) : null,
                  companyDefaultMappingRuleId: null,
                  codingSource: 'manual',
                  codingPendingApproval: false,
                })
                .then(() => table.setEditingCell(null));
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
        const ok =
          !!row.original.subCategoryId &&
          taxonomy.validSubIds.has(row.original.subCategoryId);
        return (
          <Group gap="xs" wrap="wrap">
            <Text className="table-body-left">{sub}</Text>
            {!ok && (
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
      id: 'codingStatus',
      header: 'Coding',
      size: 164,
      enableSorting: false,
      Cell: ({ row }) => {
        const provenanceLabel =
          row.original.txnType === 'standard'
            ? null
            : txnTypeLabel(row.original);
        if (
          !isBudgetImpactTxn(row.original) ||
          !isCategorisableTxn(row.original)
        ) {
          return (
            <Badge color="blue" variant="light">
              {provenanceLabel ?? txnTypeLabel(row.original)}
            </Badge>
          );
        }
        const hasValidSubCategory =
          !!row.original.subCategoryId &&
          taxonomy.validSubIds.has(row.original.subCategoryId);
        if (
          !provenanceLabel &&
          (!row.original.codingPendingApproval || !hasValidSubCategory)
        ) {
          return null;
        }
        return (
          <Group gap="xs" wrap="wrap">
            {row.original.lockedAt ? (
              <Badge
                color="gray"
                variant="light"
                leftSection={<IconLock size={11} />}
              >
                Locked
              </Badge>
            ) : row.original.reviewedAt ? (
              <Badge color="green" variant="light">
                Reviewed
              </Badge>
            ) : null}
            {provenanceLabel ? (
              <Badge color="blue" variant="light">
                {provenanceLabel}
              </Badge>
            ) : null}
            {row.original.codingPendingApproval && hasValidSubCategory ? (
              <Badge color="yellow" variant="light">
                Auto-mapped
              </Badge>
            ) : null}
            {!readOnly &&
            !row.original.lockedAt &&
            row.original.codingPendingApproval &&
            hasValidSubCategory ? (
              <Button
                size="xs"
                variant="subtle"
                className="tableActionButton"
                onClick={() => {
                  void txns.updateTxn(row.original.id, {
                    codingPendingApproval: false,
                  });
                }}
              >
                Approve
              </Button>
            ) : null}
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
        const commentSummary = commentSummaryByTxnId.get(row.original.id);
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
                {commentSummary ? ` (${commentSummary.totalCount})` : ''}
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

  return (
    <Stack gap="md">
      <Paper withBorder radius="lg" p="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Stack gap={6}>
              <Group gap="sm" align="center" wrap="wrap">
                <Title order={5}>Transaction coding</Title>
                <Badge variant="light">{filteredTxns.length} shown</Badge>
                <Badge variant="light" color="blue">
                  {formatCurrencyFromCents(
                    visibleMetrics.budgetImpactCents,
                    currencyCode
                  )}{' '}
                  budget impact
                </Badge>
                <Badge
                  variant="light"
                  color={visibleMetrics.uncodedCount > 0 ? 'red' : 'gray'}
                >
                  {visibleMetrics.uncodedCount} uncoded
                  {visibleMetrics.uncodedCount > 0
                    ? ` · ${formatCurrencyFromCents(
                        visibleMetrics.uncodedCents,
                        currencyCode
                      )}`
                    : ''}
                </Badge>
                {visibleMetrics.sourceOnlyCount > 0 ? (
                  <Badge variant="light" color="gray">
                    {visibleMetrics.sourceOnlyCount} source only
                  </Badge>
                ) : null}
                {visibleMetrics.assignedToMeCount > 0 ? (
                  <Badge variant="light" color="orange">
                    {visibleMetrics.assignedToMeCount} assigned to me
                  </Badge>
                ) : null}
                {visibleMetrics.reviewedCount > 0 ? (
                  <Badge variant="light" color="green">
                    {visibleMetrics.reviewedCount} reviewed
                  </Badge>
                ) : null}
                {visibleMetrics.lockedCount > 0 ? (
                  <Badge variant="light" color="gray">
                    {visibleMetrics.lockedCount} locked
                  </Badge>
                ) : null}
                <Badge
                  variant="light"
                  color={autoMappedPendingTxns.length > 0 ? 'yellow' : 'gray'}
                >
                  {autoMappedPendingTxns.length} pending
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                Code budget-impact transactions, review auto-matches, and keep
                split or transferred source rows audit-only.
              </Text>
            </Stack>

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
                onChange={(v) =>
                  setTransactionView(
                    v === 'uncoded' ||
                      v === 'auto-mapped-pending' ||
                      v === 'assigned-to-me'
                      ? v
                      : 'all'
                  )
                }
                style={{ width: isMobile ? '100%' : 250 }}
              />
              <Button
                variant="light"
                color="teal"
                size="sm"
                fullWidth={isMobile}
                disabled={readOnly || autoMappedPendingTxns.length === 0}
                onClick={() => {
                  void Promise.all(
                    autoMappedPendingTxns.map((txn) =>
                      txns.updateTxn(txn.id, { codingPendingApproval: false })
                    )
                  );
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
          </Group>

          <Group align="flex-end" gap="sm" wrap="wrap">
            <Select
              label="Year"
              placeholder="All years"
              data={yearFilterOptions}
              value={yearFilter}
              clearable
              onChange={(value) => {
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
              onChange={setMonthFilterKey}
              style={{ width: isMobile ? '100%' : 180 }}
            />
            <Button
              size="sm"
              variant="subtle"
              disabled={!yearFilter && !quarterFilter && !monthFilterKey}
              onClick={onClearFilters}
            >
              Remove filter(s)
            </Button>
          </Group>

          {invalidDateCount > 0 && (
            <Text size="sm" c="dimmed">
              {invalidDateCount} transaction(s) have invalid dates and may be
              excluded from month filters or rollups.
            </Text>
          )}
        </Stack>
      </Paper>

      <MantineReactTable
        key={`${yearFilter ?? 'all'}-${quarterFilter ?? 'all'}-${monthFilterKey ?? 'all'}-${transactionView}`}
        columns={txnColumns}
        data={filteredTxns}
        getRowId={(row) => row.id}
        enableEditing={!readOnly}
        editDisplayMode="cell"
        state={{ pagination, sorting }}
        onPaginationChange={setPagination}
        onSortingChange={setSorting}
        enableColumnResizing
        enableColumnActions={false}
        enableSorting
        enableSortingRemoval={false}
        enableGlobalFilter
        enablePagination
        autoResetPageIndex={false}
        initialState={{
          density: 'xs',
        }}
        mantineTableContainerProps={{ className: 'financeTable txnTable' }}
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
        opened={Boolean(commentsTxn)}
        txn={commentsTxn}
        onClose={() => setCommentsTxn(null)}
      />
    </Stack>
  );
}

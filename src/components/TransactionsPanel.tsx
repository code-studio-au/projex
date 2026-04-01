import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
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
import type { TransactionsHook } from '../hooks/useTransactions';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import {
  monthKeyFromStart,
  monthStart,
  parseISODate,
} from '../utils/finance';
import { formatCurrencyFromCents } from '../utils/money';
import TaxonomyManagerModal from './TaxonomyManagerModal';
import { asCategoryId, asSubCategoryId } from '../types/ids';

export default function TransactionsPanel(props: {
  txns: TransactionsHook;
  taxonomy: TaxonomyHook;
  currencyCode: string;
  monthFilterKey: string | null;
  setMonthFilterKey: (v: string | null) => void;
  monthFilterOptions: { value: string; label: string }[];
  showUncodedOnly: boolean;
  setShowUncodedOnly: (v: boolean) => void;
  canEditTaxonomy: boolean;
  readOnly?: boolean;
}) {
  const {
    txns,
    taxonomy,
    currencyCode,
    monthFilterKey,
    setMonthFilterKey,
    monthFilterOptions,
    showUncodedOnly,
    setShowUncodedOnly,
    canEditTaxonomy,
    readOnly = false,
  } = props;

  const [manageOpen, setManageOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: isMobile ? 10 : 20,
  });
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'date', desc: true },
  ]);

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
    }
    if (showUncodedOnly)
      out = out.filter(
        (t) => !t.subCategoryId || !taxonomy.validSubIds.has(t.subCategoryId)
      );
    return out;
  }, [
    txns.transactions,
    monthFilterKey,
    showUncodedOnly,
    taxonomy.validSubIds,
  ]);

  function moveToSubcategoryCell(args: {
    row: Parameters<NonNullable<MRT_ColumnDef<(typeof txns.transactions)[number]>['Edit']>>[0]['row'];
    table: Parameters<NonNullable<MRT_ColumnDef<(typeof txns.transactions)[number]>['Edit']>>[0]['table'];
  }) {
    const nextCell = args.row.getAllCells().find((cell) => cell.column.id === 'subCategory');
    args.table.setEditingCell(nextCell ?? null);
  }

  // Note: keep columns as a plain value (no manual memoization).
  // This avoids conflicts with the React Compiler's memoization preservation rule.
  const txnColumns: MRT_ColumnDef<(typeof txns.transactions)[number]>[] = [
    {
      accessorKey: 'date',
      header: 'Date',
      size: 96,
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
      Cell: ({ cell }) => <Text className="table-body-left">{cell.getValue<string>()}</Text>,
    },
    {
      accessorKey: 'item',
      header: 'Item',
      size: 136,
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
      Cell: ({ cell }) => <Text className="table-body-left">{cell.getValue<string>()}</Text>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      size: 240,
      Cell: ({ cell }) => <Text className="table-body-left">{cell.getValue<string>()}</Text>,
      mantineTableHeadCellProps: {
        className: 'table-head-cell table-head-left txnTable-head',
      },
      mantineTableBodyCellProps: { className: 'txnTable-cell' },
    },
    {
      accessorKey: 'amountCents',
      header: 'Amount',
      size: 124,
      Cell: ({ cell }) => (
        <Text className="table-body-emphasis">
          {formatCurrencyFromCents(cell.getValue<number>(), currencyCode)}
        </Text>
      ),
      mantineTableBodyCellProps: { className: 'table-body-right txnTable-cell' },
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
        const current = row.original.categoryId ?? null;
        const shouldAutoAdvance =
          !row.original.subCategoryId || !taxonomy.validSubIds.has(row.original.subCategoryId);
        return (
          <Select
            data={taxonomy.categoryOptions}
            value={current}
            placeholder="Select category"
            searchable
            clearable
            disabled={readOnly}
            onChange={(v) => {
              void txns
                .updateTxn(row.original.id, {
                  categoryId: v ? asCategoryId(v) : null,
                  subCategoryId: null,
                  companyDefaultMappingRuleId: undefined,
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
        return <Text className="table-body-left">{cat}</Text>;
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
            disabled={!catId || readOnly}
            onChange={(v) => {
              void txns
                .updateTxn(row.original.id, {
                  categoryId: catId ?? null,
                  subCategoryId: v ? asSubCategoryId(v) : null,
                  companyDefaultMappingRuleId: undefined,
                  codingSource: 'manual',
                  codingPendingApproval: false,
                })
                .then(() => table.setEditingCell(null));
            }}
          />
        );
      },
      Cell: ({ row }) => {
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
      size: 180,
      enableSorting: false,
      Cell: ({ row }) => {
        if (!row.original.codingPendingApproval) return null;
        return (
          <Group gap="xs" wrap="wrap">
            <Badge color="yellow" variant="light">
              Auto-mapped
            </Badge>
            {!readOnly ? (
              <Button
                size="compact-xs"
                variant="subtle"
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
  ];

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Stack gap={4}>
            <Title order={5}>Transaction coding</Title>
            <Text size="sm" c="dimmed">
              Filter a month, then assign category + subcategory
            </Text>
            {invalidDateCount > 0 && (
              <Text size="sm" c="dimmed">
                ⚠️ {invalidDateCount} transaction(s) have invalid dates. They
                may be excluded from month filters/rollups.
              </Text>
            )}
          </Stack>

          <Group gap="sm" align="flex-end" wrap="wrap">
            <Select
              label="Month"
              placeholder="All months"
              data={monthFilterOptions}
              value={monthFilterKey}
              clearable
              onChange={setMonthFilterKey}
              style={{ width: isMobile ? '100%' : 180 }}
            />
            <Select
              label="View"
              data={[
                { value: 'all', label: 'All' },
                { value: 'uncoded', label: 'Uncoded only' },
              ]}
              value={showUncodedOnly ? 'uncoded' : 'all'}
              onChange={(v) => setShowUncodedOnly(v === 'uncoded')}
              style={{ width: isMobile ? '100%' : 170 }}
            />
            <Button
              variant="light"
              fullWidth={isMobile}
              disabled={readOnly || !canEditTaxonomy}
              onClick={() => setManageOpen(true)}
            >
              Manage categories
            </Button>
          </Group>
        </Group>
      </Paper>

      <MantineReactTable
        columns={txnColumns}
        data={filteredTxns}
        getRowId={(row) => row.id}
        enableEditing={!readOnly}
        editDisplayMode="cell"
        state={{ pagination, sorting }}
        onPaginationChange={setPagination}
        onSortingChange={setSorting}
        enableColumnResizing
        enableSorting
        enableSortingRemoval={false}
        enableGlobalFilter
        enablePagination
        autoResetPageIndex={false}
        initialState={{
          density: 'xs',
        }}
        mantineTableContainerProps={{ className: 'financeTable txnTable' }}
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
          return !ok
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
    </Stack>
  );
}

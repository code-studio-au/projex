import { Paper, Stack, Text } from '@mantine/core';
import {
  MantineReactTable,
  type MRT_PaginationState,
  type MRT_SortingState,
} from 'mantine-react-table-open';

import type { Txn } from '../../types';
import classes from '../../styles/ui.module.css';

type GlobalFilterUpdater =
  | string
  | undefined
  | ((current: string | undefined) => string | undefined);

export default function TransactionsDataTable(props: {
  isHydrated: boolean;
  isLoading: boolean;
  transactionDrilldownActive: boolean;
  paginationScopeKey: string;
  txnColumns: NonNullable<
    Parameters<typeof MantineReactTable<Txn>>[0]['columns']
  >;
  pagedTxns: Txn[];
  readOnly: boolean;
  pagination: MRT_PaginationState;
  rowSelection: Record<string, boolean>;
  sorting: MRT_SortingState;
  globalFilter: string;
  totalCount: number;
  showProgressBars: boolean;
  emptyStateMessage: string;
  onPaginationChange: (
    updater:
      | MRT_PaginationState
      | ((prev: MRT_PaginationState) => MRT_PaginationState)
  ) => void;
  onRowSelectionChange: NonNullable<
    Parameters<typeof MantineReactTable<Txn>>[0]['onRowSelectionChange']
  >;
  onGlobalFilterChange: (value: string) => void;
  onSortingChange: (
    updater: MRT_SortingState | ((prev: MRT_SortingState) => MRT_SortingState)
  ) => void;
}) {
  const {
    isHydrated,
    isLoading,
    transactionDrilldownActive,
    paginationScopeKey,
    txnColumns,
    pagedTxns,
    readOnly,
    pagination,
    rowSelection,
    sorting,
    globalFilter,
    totalCount,
    showProgressBars,
    emptyStateMessage,
    onPaginationChange,
    onRowSelectionChange,
    onGlobalFilterChange,
    onSortingChange,
  } = props;

  return (
    <div className={classes.tableBreakout}>
      {!isHydrated || isLoading ? (
        <Paper className={classes.surfaceCard} radius="xl" p="lg">
          <Text c="dimmed">
            {!isHydrated
              ? 'Loading transactions...'
              : transactionDrilldownActive
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
            displayColumnDefOptions={{
              'mrt-row-select': {
                size: 44,
                grow: false,
                mantineTableHeadCellProps: {
                  style: { width: '44px', minWidth: '44px', paddingInline: 6 },
                },
                mantineTableBodyCellProps: {
                  style: { width: '44px', minWidth: '44px', paddingInline: 6 },
                },
              },
            }}
            enableEditing={!readOnly}
            editDisplayMode="cell"
            state={{
              pagination,
              rowSelection,
              sorting,
              globalFilter,
              showProgressBars,
            }}
            onPaginationChange={onPaginationChange}
            onRowSelectionChange={onRowSelectionChange}
            onGlobalFilterChange={(updater: GlobalFilterUpdater) => {
              const nextValue =
                typeof updater === 'function' ? updater(globalFilter) : updater;
              onGlobalFilterChange(nextValue ?? '');
            }}
            onSortingChange={onSortingChange}
            enableGlobalFilter
            enableColumnFilters={false}
            manualFiltering
            positionGlobalFilter="left"
            mantineSearchTextInputProps={{
              'aria-label': 'Search transactions',
              placeholder: 'Search transactions',
              maxLength: 200,
              style: {
                width: 'min(22rem, calc(100vw - 5rem))',
              },
            }}
            enableColumnResizing
            enableColumnActions={false}
            enableSorting
            enableSortingRemoval={false}
            manualPagination
            manualSorting
            rowCount={totalCount}
            enablePagination
            autoResetPageIndex={false}
            initialState={{
              density: 'xs',
              showGlobalFilter: true,
            }}
            mantineTableContainerProps={{
              className: 'financeTable txnTable',
            }}
            mantineTableBodyCellProps={{ style: { verticalAlign: 'middle' } }}
            mantineTableProps={{
              highlightOnHover: true,
              withTableBorder: true,
              style: { tableLayout: 'auto' },
            }}
            enableTopToolbar
            enableToolbarInternalActions={false}
            enableDensityToggle={false}
            enableFullScreenToggle={false}
            renderEmptyRowsFallback={() => (
              <Stack align="center" gap={4} py="xl">
                <Text fw={600}>No transactions to display</Text>
                <Text size="sm" c="dimmed" ta="center">
                  {emptyStateMessage}
                </Text>
              </Stack>
            )}
          />
        </div>
      )}
    </div>
  );
}

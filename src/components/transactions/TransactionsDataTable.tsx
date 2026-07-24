import { ActionIcon, Paper, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import {
  MantineReactTable,
  type MRT_PaginationState,
  type MRT_SortingState,
} from 'mantine-react-table-open';

import type { Txn } from '../../types';
import classes from '../../styles/ui.module.css';

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
              showProgressBars,
            }}
            onPaginationChange={onPaginationChange}
            onRowSelectionChange={onRowSelectionChange}
            onSortingChange={onSortingChange}
            enableGlobalFilter={false}
            enableColumnFilters={false}
            manualFiltering
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
            renderTopToolbarCustomActions={() => (
              <TextInput
                aria-label="Search transactions"
                placeholder="Search transactions (2+ characters)"
                value={globalFilter}
                maxLength={200}
                leftSection={<IconSearch size={16} />}
                rightSection={
                  globalFilter ? (
                    <ActionIcon
                      aria-label="Clear transaction search"
                      size="sm"
                      variant="subtle"
                      onClick={() => onGlobalFilterChange('')}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  ) : null
                }
                onChange={(event) =>
                  onGlobalFilterChange(event.currentTarget.value)
                }
                style={{
                  width: 'min(22rem, calc(100vw - 5rem))',
                }}
              />
            )}
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

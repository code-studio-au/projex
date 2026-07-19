import { Paper, Text } from '@mantine/core';
import {
  MantineReactTable,
  type MRT_PaginationState,
  type MRT_SortingState,
} from 'mantine-react-table-open';

import type { Txn } from '../../types';
import { isCategorisableTxn } from '../../utils/transactions';
import classes from '../../styles/ui.module.css';

export default function TransactionsDataTable(props: {
  isHydrated: boolean;
  isLoading: boolean;
  isTransitioningPageData: boolean;
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
  totalCount: number;
  validSubIds: Set<string>;
  showProgressBars: boolean;
  onPaginationChange: (
    updater:
      | MRT_PaginationState
      | ((prev: MRT_PaginationState) => MRT_PaginationState)
  ) => void;
  onRowSelectionChange: NonNullable<
    Parameters<typeof MantineReactTable<Txn>>[0]['onRowSelectionChange']
  >;
  onSortingChange: (
    updater: MRT_SortingState | ((prev: MRT_SortingState) => MRT_SortingState)
  ) => void;
}) {
  const {
    isHydrated,
    isLoading,
    isTransitioningPageData,
    transactionDrilldownActive,
    paginationScopeKey,
    txnColumns,
    pagedTxns,
    readOnly,
    pagination,
    rowSelection,
    sorting,
    totalCount,
    validSubIds,
    showProgressBars,
    onPaginationChange,
    onRowSelectionChange,
    onSortingChange,
  } = props;

  return (
    <div className={classes.tableBreakout}>
      {!isHydrated || isLoading || isTransitioningPageData ? (
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
                validSubIds.has(row.original.subCategoryId);
              return isCategorisableTxn(row.original) && !ok
                ? { style: { outline: '1px solid rgba(255,0,0,0.20)' } }
                : {};
            }}
          />
        </div>
      )}
    </div>
  );
}

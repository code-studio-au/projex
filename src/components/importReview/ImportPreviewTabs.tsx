import type { Dispatch, SetStateAction } from 'react';
import { Tabs } from '@mantine/core';
import {
  MantineReactTable,
  type MRT_ColumnDef,
  type MRT_PaginationState,
  type MRT_RowSelectionState,
  type MRT_SortingState,
} from 'mantine-react-table-open';

import type { ImportReviewDecision } from '../../api/types';
import type { ImportPreviewRow } from '../../types';
import type { ImportPreviewTab } from '../../hooks/usePowerBiImportWorkflow';
import ImportReviewDecisionActions from '../ImportReviewDecisionActions';
import classes from '../../styles/ui.module.css';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

const sharedTableProps = {
  enableColumnResizing: true,
  enableSorting: true,
  enableSortingRemoval: false,
  enableGlobalFilter: true,
  enablePagination: true,
  autoResetPageIndex: false,
  initialState: { density: 'xs' as const },
  mantineTableContainerProps: {
    className: 'financeTable txnTable',
  },
  mantineTableProps: {
    highlightOnHover: true,
    striped: 'odd' as const,
    withTableBorder: true,
    style: { tableLayout: 'auto' as const },
  },
  enableDensityToggle: false,
  enableFullScreenToggle: false,
};

type PreviewTableProps = {
  columns: MRT_ColumnDef<ImportPreviewRow>[];
  rows: ImportPreviewRow[];
  pagination: MRT_PaginationState;
  sorting: MRT_SortingState;
  setPagination: StateSetter<MRT_PaginationState>;
  setSorting: StateSetter<MRT_SortingState>;
  outlineInvalidRows?: boolean;
};

function PreviewTable(props: PreviewTableProps) {
  const {
    columns,
    rows,
    pagination,
    sorting,
    setPagination,
    setSorting,
    outlineInvalidRows = false,
  } = props;
  return (
    <div className={classes.tableWrap}>
      <MantineReactTable
        {...sharedTableProps}
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.sourceRowIndex)}
        state={{ pagination, sorting }}
        onPaginationChange={setPagination}
        onSortingChange={setSorting}
        mantineTableBodyRowProps={
          outlineInvalidRows
            ? ({ row }) =>
                row.original.mappingStatus === 'invalid'
                  ? { style: { outline: '1px solid rgba(255,0,0,0.20)' } }
                  : {}
            : undefined
        }
      />
    </div>
  );
}

type ImportPreviewTabsProps = {
  previewTab: ImportPreviewTab;
  includedCount: number;
  unresolvedReviewCount: number;
  duplicateCount: number;
  invalidCount: number;
  excludedCount: number;
  visiblePreviewRows: ImportPreviewRow[];
  needsReviewPreviewRows: ImportPreviewRow[];
  selectedNeedsReviewRows: ImportPreviewRow[];
  previewColumns: MRT_ColumnDef<ImportPreviewRow>[];
  excludedPreviewColumns: MRT_ColumnDef<ImportPreviewRow>[];
  pagination: MRT_PaginationState;
  sorting: MRT_SortingState;
  rowSelection: MRT_RowSelectionState;
  setPreviewTab: (tab: ImportPreviewTab) => void;
  setPagination: StateSetter<MRT_PaginationState>;
  setSorting: StateSetter<MRT_SortingState>;
  setRowSelection: StateSetter<MRT_RowSelectionState>;
  onReviewDecision: (
    rows: ImportPreviewRow[],
    decision: ImportReviewDecision['decision'],
    mode: 'selected' | 'all' | 'row'
  ) => void;
};

export default function ImportPreviewTabs(props: ImportPreviewTabsProps) {
  const {
    previewTab,
    includedCount,
    unresolvedReviewCount,
    duplicateCount,
    invalidCount,
    excludedCount,
    visiblePreviewRows,
    needsReviewPreviewRows,
    selectedNeedsReviewRows,
    previewColumns,
    excludedPreviewColumns,
    pagination,
    sorting,
    rowSelection,
    setPreviewTab,
    setPagination,
    setSorting,
    setRowSelection,
    onReviewDecision,
  } = props;

  const tableProps = {
    rows: visiblePreviewRows,
    pagination,
    sorting,
    setPagination,
    setSorting,
  };

  return (
    <Tabs
      value={previewTab}
      className={classes.softTabs}
      onChange={(value) => {
        if (
          value === 'included' ||
          value === 'needsReview' ||
          value === 'duplicate' ||
          value === 'invalid' ||
          value === 'excluded'
        ) {
          setRowSelection({});
          setPreviewTab(value);
        }
      }}
    >
      <Tabs.List>
        <Tabs.Tab value="included">Included ({includedCount})</Tabs.Tab>
        <Tabs.Tab value="needsReview">
          Review ({unresolvedReviewCount} remaining)
        </Tabs.Tab>
        <Tabs.Tab value="duplicate">Duplicate ({duplicateCount})</Tabs.Tab>
        <Tabs.Tab value="invalid">Invalid ({invalidCount})</Tabs.Tab>
        <Tabs.Tab value="excluded">Excluded ({excludedCount})</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="included" pt="md">
        <PreviewTable
          {...tableProps}
          columns={previewColumns}
          outlineInvalidRows
        />
      </Tabs.Panel>

      <Tabs.Panel value="needsReview" pt="md">
        <ImportReviewDecisionActions
          remainingCount={needsReviewPreviewRows.length}
          selectedCount={selectedNeedsReviewRows.length}
          onDecision={(decision, scope) =>
            onReviewDecision(
              scope === 'all'
                ? needsReviewPreviewRows
                : selectedNeedsReviewRows,
              decision,
              scope
            )
          }
        />
        <div className={classes.tableWrap}>
          <MantineReactTable
            {...sharedTableProps}
            columns={previewColumns}
            data={visiblePreviewRows}
            getRowId={(row) => String(row.sourceRowIndex)}
            enableRowSelection
            state={{ pagination, rowSelection, sorting }}
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
              setPagination((current) => ({
                ...current,
                pageIndex: 0,
              }));
            }}
          />
        </div>
      </Tabs.Panel>

      <Tabs.Panel value="duplicate" pt="md">
        <PreviewTable {...tableProps} columns={previewColumns} />
      </Tabs.Panel>

      <Tabs.Panel value="invalid" pt="md">
        <PreviewTable
          {...tableProps}
          columns={previewColumns}
          outlineInvalidRows
        />
      </Tabs.Panel>

      <Tabs.Panel value="excluded" pt="md">
        <PreviewTable
          {...tableProps}
          columns={excludedPreviewColumns}
          outlineInvalidRows
        />
      </Tabs.Panel>
    </Tabs>
  );
}

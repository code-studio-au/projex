import { useMemo } from 'react';
import type { MRT_ColumnDef } from 'mantine-react-table-open';

import type { ImportReviewDecision } from '../../api/types';
import type { ImportPreviewRow } from '../../types';
import { formatCurrencyFromCents } from '../../utils/money';
import { createImportPreviewActionCell } from './ImportPreviewActionCell';
import { createImportPreviewMappingCell } from './ImportPreviewMappingCell';
import ImportPreviewTextCell from './ImportPreviewTextCell';

type CurrencyCode = 'AUD' | 'USD' | 'EUR' | 'GBP';
type ReviewDecision = ImportReviewDecision['decision'];
type ReviewDecisionMode = 'selected' | 'all' | 'row';

export function useImportPreviewColumns(args: {
  currencyCode: CurrencyCode;
  excludedSourceRowIndexes: Set<number>;
  reviewDecisions: Map<number, ReviewDecision>;
  onReviewDecision: (
    rows: ImportPreviewRow[],
    decision: ReviewDecision,
    mode: ReviewDecisionMode
  ) => void;
  onTogglePreviewRow: (row: ImportPreviewRow) => void;
}) {
  const {
    currencyCode,
    excludedSourceRowIndexes,
    reviewDecisions,
    onReviewDecision,
    onTogglePreviewRow,
  } = args;

  const previewColumns = useMemo<MRT_ColumnDef<ImportPreviewRow>[]>(
    () => [
      {
        accessorKey: 'sourceRowIndex',
        header: 'Row',
        size: 72,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        id: 'importedId',
        header: 'Imported ID',
        size: 140,
        accessorFn: (row) => row.externalId ?? '—',
        Cell: ImportPreviewTextCell,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'parsedDate',
        header: 'Date',
        size: 92,
        accessorFn: (row) => row.parsedDate ?? 'Missing',
        Cell: ImportPreviewTextCell,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'item',
        header: 'Item',
        size: 150,
        accessorFn: (row) => row.item ?? 'Missing item',
        Cell: ImportPreviewTextCell,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'description',
        header: 'Description',
        size: 220,
        accessorFn: (row) => row.description ?? 'Missing description',
        Cell: ImportPreviewTextCell,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'amountCents',
        header: 'Amount',
        size: 112,
        accessorFn: (row) =>
          row.amountCents == null
            ? 'Missing'
            : formatCurrencyFromCents(row.amountCents, currencyCode),
        Cell: ImportPreviewTextCell,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-right txnTable-head',
        },
        mantineTableBodyCellProps: {
          className: 'table-body-right txnTable-cell',
        },
      },
      {
        id: 'mapping',
        header: 'Mapping',
        size: 220,
        accessorFn: (row) =>
          `${row.categoryName ?? ''} ${row.subCategoryName ?? ''} ${row.mappingStatus} ${row.duplicateReason ?? ''}`,
        enableSorting: false,
        Cell: createImportPreviewMappingCell({
          excludedSourceRowIndexes,
          reviewDecisions,
        }),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        id: 'action',
        header: 'Action',
        size: 220,
        enableSorting: false,
        Cell: createImportPreviewActionCell({
          excludedSourceRowIndexes,
          reviewDecisions,
          onReviewDecision,
          onTogglePreviewRow,
        }),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
    ],
    [
      currencyCode,
      excludedSourceRowIndexes,
      onReviewDecision,
      onTogglePreviewRow,
      reviewDecisions,
    ]
  );

  const excludedPreviewColumns = useMemo(
    () => previewColumns.filter((column) => column.id !== 'mapping'),
    [previewColumns]
  );

  return { previewColumns, excludedPreviewColumns };
}

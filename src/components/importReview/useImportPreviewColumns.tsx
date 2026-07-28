import { useMemo } from 'react';
import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import type { MRT_ColumnDef } from 'mantine-react-table-open';

import type { ImportReviewDecision } from '../../api/types';
import type { ImportPreviewRow } from '../../types';
import { formatCurrencyFromCents } from '../../utils/money';

type CurrencyCode = 'AUD' | 'USD' | 'EUR' | 'GBP';
type ReviewDecision = ImportReviewDecision['decision'];
type ReviewDecisionMode = 'selected' | 'all' | 'row';

function displayWarningsForRow(row: ImportPreviewRow): string[] {
  return row.warnings.filter(
    (warning) =>
      !(
        row.mappingStatus === 'uncoded' &&
        warning.startsWith('No category/subcategory could be resolved.')
      )
  );
}

function mappingStatusLabel(row: ImportPreviewRow) {
  if (row.mappingStatus === 'matched_rule') return 'Auto-Categorise match';
  if (row.mappingStatus === 'source_taxonomy') return 'Category match';
  if (row.mappingStatus === 'auto_created') return 'Will auto-create';
  if (row.mappingStatus === 'invalid') return 'Invalid';
  return 'Uncoded';
}

function mappingStatusColor(row: ImportPreviewRow) {
  if (row.mappingStatus === 'invalid' || row.mappingStatus === 'uncoded') {
    return 'red';
  }
  if (row.mappingStatus === 'auto_created') return 'yellow';
  return 'green';
}

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
        accessorFn: (row) => row.externalId ?? '',
        Cell: ({ row }) => (
          <Text className="table-body-left">
            {row.original.externalId ?? '—'}
          </Text>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'parsedDate',
        header: 'Date',
        size: 92,
        Cell: ({ row }) => (
          <Text className="table-body-left">
            {row.original.parsedDate ?? 'Missing'}
          </Text>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'item',
        header: 'Item',
        size: 150,
        Cell: ({ row }) => (
          <Text className="table-body-left">
            {row.original.item ?? 'Missing item'}
          </Text>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'description',
        header: 'Description',
        size: 220,
        Cell: ({ row }) => (
          <Text className="table-body-left">
            {row.original.description ?? 'Missing description'}
          </Text>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left txnTable-head',
        },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'amountCents',
        header: 'Amount',
        size: 112,
        Cell: ({ row }) => (
          <Text className="table-body-emphasis">
            {row.original.amountCents == null
              ? 'Missing'
              : formatCurrencyFromCents(row.original.amountCents, currencyCode)}
          </Text>
        ),
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
        Cell: ({ row }) => {
          const reviewDecision = reviewDecisions.get(
            row.original.sourceRowIndex
          );
          const isReviewRow = row.original.importAction === 'review';
          const warnings = displayWarningsForRow(row.original);
          return (
            <Stack gap={4}>
              <Group gap="xs" wrap="wrap">
                {isReviewRow && !reviewDecision ? (
                  <Badge size="sm" variant="light" color="yellow">
                    Decision required
                  </Badge>
                ) : null}
                {reviewDecision === 'import_uncoded' ? (
                  <Badge size="sm" variant="light" color="blue">
                    Import uncoded
                  </Badge>
                ) : null}
                {reviewDecision === 'exclude' ||
                (!isReviewRow &&
                  excludedSourceRowIndexes.has(row.original.sourceRowIndex)) ? (
                  <Badge size="sm" variant="light" color="gray">
                    Excluded
                  </Badge>
                ) : null}
                {row.original.importAction === 'exclude' ? (
                  <Badge size="sm" variant="light" color="gray">
                    Rule excluded
                  </Badge>
                ) : null}
                {!isReviewRow ? (
                  <Badge
                    size="sm"
                    variant="light"
                    color={mappingStatusColor(row.original)}
                  >
                    {mappingStatusLabel(row.original)}
                  </Badge>
                ) : null}
                {row.original.duplicate ? (
                  <Badge size="sm" variant="light" color="orange">
                    {row.original.duplicateReason === 'existing'
                      ? 'Existing duplicate'
                      : 'Import duplicate'}
                  </Badge>
                ) : null}
              </Group>
              {!isReviewRow &&
              row.original.categoryName &&
              row.original.subCategoryName ? (
                <Text size="xs" c="dimmed">
                  {row.original.categoryName} &gt;{' '}
                  {row.original.subCategoryName}
                </Text>
              ) : null}
              {row.original.importRuleName ? (
                <Text size="xs" c="dimmed">
                  Import rule: {row.original.importRuleName}
                </Text>
              ) : null}
              {isReviewRow && reviewDecision === 'import_uncoded' ? (
                <Text size="xs" c="dimmed">
                  Any suggested category will be ignored so this transaction
                  enters the coding workflow.
                </Text>
              ) : null}
              {warnings.length ? (
                <Stack gap={2}>
                  {warnings.map((warning, index) => (
                    <Text
                      key={`${row.original.sourceRowIndex}-warning-${index}`}
                      size="xs"
                      c="dimmed"
                    >
                      {warning}
                    </Text>
                  ))}
                </Stack>
              ) : null}
            </Stack>
          );
        },
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
        Cell: ({ row }) => {
          if (row.original.importAction === 'review') {
            const decision = reviewDecisions.get(row.original.sourceRowIndex);
            const cannotImport =
              row.original.mappingStatus === 'invalid' ||
              row.original.duplicate;
            return (
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="xs"
                  variant={decision === 'import_uncoded' ? 'filled' : 'light'}
                  disabled={cannotImport}
                  onClick={() =>
                    onReviewDecision([row.original], 'import_uncoded', 'row')
                  }
                >
                  Import uncoded
                </Button>
                <Button
                  size="xs"
                  variant={decision === 'exclude' ? 'filled' : 'subtle'}
                  color="gray"
                  onClick={() =>
                    onReviewDecision([row.original], 'exclude', 'row')
                  }
                >
                  Exclude
                </Button>
              </Group>
            );
          }

          const isExcluded = excludedSourceRowIndexes.has(
            row.original.sourceRowIndex
          );
          return (
            <Button
              size="xs"
              variant={isExcluded ? 'light' : 'subtle'}
              color={isExcluded ? 'blue' : 'gray'}
              onClick={() => onTogglePreviewRow(row.original)}
            >
              {isExcluded ? 'Include' : 'Exclude'}
            </Button>
          );
        },
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

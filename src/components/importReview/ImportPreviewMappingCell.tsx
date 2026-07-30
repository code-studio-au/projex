import { Badge, Group, Stack, Text } from '@mantine/core';
import type { MRT_ColumnDef } from 'mantine-react-table-open';

import type { ImportReviewDecision } from '../../api/types';
import type { ImportPreviewRow } from '../../types';

type ReviewDecision = ImportReviewDecision['decision'];
type ImportPreviewCellProps = Parameters<
  NonNullable<MRT_ColumnDef<ImportPreviewRow>['Cell']>
>[0];

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

export function createImportPreviewMappingCell(args: {
  excludedSourceRowIndexes: Set<number>;
  reviewDecisions: Map<number, ReviewDecision>;
}) {
  return function ImportPreviewMappingCell({ row }: ImportPreviewCellProps) {
    const reviewDecision = args.reviewDecisions.get(
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
            args.excludedSourceRowIndexes.has(row.original.sourceRowIndex)) ? (
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
            {row.original.categoryName} &gt; {row.original.subCategoryName}
          </Text>
        ) : null}
        {row.original.importRuleName ? (
          <Text size="xs" c="dimmed">
            Import rule: {row.original.importRuleName}
          </Text>
        ) : null}
        {isReviewRow && reviewDecision === 'import_uncoded' ? (
          <Text size="xs" c="dimmed">
            Any suggested category will be ignored so this transaction enters
            the coding workflow.
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
  };
}

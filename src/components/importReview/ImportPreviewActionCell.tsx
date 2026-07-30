import { Button, Group } from '@mantine/core';
import type { MRT_ColumnDef } from 'mantine-react-table-open';

import type { ImportReviewDecision } from '../../api/types';
import type { ImportPreviewRow } from '../../types';

type ReviewDecision = ImportReviewDecision['decision'];
type ReviewDecisionMode = 'selected' | 'all' | 'row';
type ImportPreviewCellProps = Parameters<
  NonNullable<MRT_ColumnDef<ImportPreviewRow>['Cell']>
>[0];

export function createImportPreviewActionCell(args: {
  excludedSourceRowIndexes: Set<number>;
  reviewDecisions: Map<number, ReviewDecision>;
  onReviewDecision: (
    rows: ImportPreviewRow[],
    decision: ReviewDecision,
    mode: ReviewDecisionMode
  ) => void;
  onTogglePreviewRow: (row: ImportPreviewRow) => void;
}) {
  return function ImportPreviewActionCell({ row }: ImportPreviewCellProps) {
    if (row.original.importAction === 'review') {
      const decision = args.reviewDecisions.get(row.original.sourceRowIndex);
      const cannotImport =
        row.original.mappingStatus === 'invalid' || row.original.duplicate;
      return (
        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant={decision === 'import_uncoded' ? 'filled' : 'light'}
            disabled={cannotImport}
            onClick={() =>
              args.onReviewDecision([row.original], 'import_uncoded', 'row')
            }
          >
            Import uncoded
          </Button>
          <Button
            size="xs"
            variant={decision === 'exclude' ? 'filled' : 'subtle'}
            color="gray"
            onClick={() =>
              args.onReviewDecision([row.original], 'exclude', 'row')
            }
          >
            Exclude
          </Button>
        </Group>
      );
    }

    const isExcluded = args.excludedSourceRowIndexes.has(
      row.original.sourceRowIndex
    );
    return (
      <Button
        size="xs"
        variant={isExcluded ? 'light' : 'subtle'}
        color={isExcluded ? 'blue' : 'gray'}
        onClick={() => args.onTogglePreviewRow(row.original)}
      >
        {isExcluded ? 'Include' : 'Exclude'}
      </Button>
    );
  };
}

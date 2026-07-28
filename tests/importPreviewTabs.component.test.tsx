// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import type {
  MRT_ColumnDef,
  MRT_PaginationState,
  MRT_RowSelectionState,
  MRT_SortingState,
} from 'mantine-react-table-open';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import ImportPreviewTabs from '../src/components/importReview/ImportPreviewTabs';
import type { ImportPreviewRow } from '../src/types';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

const reviewRow: ImportPreviewRow = {
  sourceRowIndex: 1,
  importId: 'import-preview-component-test',
  parsedDate: '2026-07-01',
  amountCents: 1_000,
  item: 'Review item',
  description: 'Review description',
  duplicate: false,
  importAction: 'review',
  mappingStatus: 'uncoded',
  codingPendingApproval: false,
  willCreateCategory: false,
  willCreateSubCategory: false,
  willCreateBudgetLine: false,
  warnings: [],
};

const columns: MRT_ColumnDef<ImportPreviewRow>[] = [
  {
    accessorKey: 'sourceRowIndex',
    header: 'Row',
  },
];

function createProps() {
  return {
    previewTab: 'included' as const,
    includedCount: 0,
    unresolvedReviewCount: 1,
    duplicateCount: 0,
    invalidCount: 0,
    excludedCount: 0,
    visiblePreviewRows: [reviewRow],
    needsReviewPreviewRows: [reviewRow],
    selectedNeedsReviewRows: [],
    previewColumns: columns,
    excludedPreviewColumns: columns,
    pagination: { pageIndex: 0, pageSize: 20 } as MRT_PaginationState,
    sorting: [{ id: 'sourceRowIndex', desc: false }] as MRT_SortingState,
    rowSelection: { '1': true } as MRT_RowSelectionState,
    setPreviewTab: vi.fn(),
    setPagination: vi.fn(),
    setSorting: vi.fn(),
    setRowSelection: vi.fn(),
    onReviewDecision: vi.fn(),
  };
}

describe('ImportPreviewTabs', () => {
  it('resets row selection when the review scope changes', () => {
    const props = createProps();
    renderComponent(<ImportPreviewTabs {...props} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Review (1 remaining)' }));

    expect(props.setRowSelection).toHaveBeenCalledWith({});
    expect(props.setPreviewTab).toHaveBeenCalledWith('needsReview');
  });

  it('routes all-row review decisions with the underlying preview rows', () => {
    const props = {
      ...createProps(),
      previewTab: 'needsReview' as const,
      rowSelection: {},
    };
    renderComponent(<ImportPreviewTabs {...props} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Import all as uncoded' })
    );

    expect(props.onReviewDecision).toHaveBeenCalledWith(
      [reviewRow],
      'import_uncoded',
      'all'
    );
  });
});

// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import { usePowerBiImportWorkflow } from '../src/hooks/usePowerBiImportWorkflow';
import type { TxnImportInput, TxnImportResult } from '../src/api/types';
import type { ImportPreviewRow } from '../src/types';
import { asImportBatchId, asProjectId } from '../src/types';

const serverMocks = vi.hoisted(() => ({
  cancelPreview: vi.fn(),
  previewImport: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../src/server/start/functions/importReads', () => ({
  cancelImportPreviewServerFn: serverMocks.cancelPreview,
  previewImportTransactionsServerFn: serverMocks.previewImport,
}));

vi.mock('../src/utils/toast', () => ({
  showAppToast: serverMocks.showToast,
}));

afterEach(() => {
  serverMocks.cancelPreview.mockReset();
  serverMocks.previewImport.mockReset();
  serverMocks.showToast.mockReset();
});

const projectId = asProjectId('project-import-workflow');
const importBatchId = asImportBatchId('batch-import-workflow');
const previewRow: ImportPreviewRow = {
  sourceRowIndex: 1,
  importId: 'preview-row',
  parsedDate: '2026-07-30',
  amountCents: 25_000,
  item: 'Supplier invoice',
  description: 'Workflow test',
  duplicate: false,
  importAction: 'import',
  mappingStatus: 'matched_rule',
  codingPendingApproval: false,
  willCreateCategory: false,
  willCreateSubCategory: false,
  willCreateBudgetLine: false,
  warnings: [],
};

function previewRowWith(
  sourceRowIndex: number,
  overrides: Partial<ImportPreviewRow>
): ImportPreviewRow {
  return {
    ...previewRow,
    sourceRowIndex,
    importId: `preview-row-${sourceRowIndex}`,
    ...overrides,
  };
}

type CommitOptions = Omit<TxnImportInput, 'mode'>;
type CommitMock = Mock<(options: CommitOptions) => Promise<TxnImportResult>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderWorkflow(
  overrides: {
    onAppend?: CommitMock;
    onReplaceAll?: CommitMock;
  } = {}
) {
  const onAppend =
    overrides.onAppend ??
    vi
      .fn<(options: CommitOptions) => Promise<TxnImportResult>>()
      .mockResolvedValue({ count: 1, skipped: 0, replaced: 0 });
  const onReplaceAll =
    overrides.onReplaceAll ??
    vi
      .fn<(options: CommitOptions) => Promise<TxnImportResult>>()
      .mockResolvedValue({ count: 1, skipped: 0, replaced: 1 });
  const hook = renderHook(() =>
    usePowerBiImportWorkflow({
      projectId,
      initialPageSize: 20,
      onAppend,
      onReplaceAll,
    })
  );
  return { ...hook, onAppend, onReplaceAll };
}

async function createPreview(
  result: ReturnType<typeof renderWorkflow>['result']
) {
  serverMocks.previewImport.mockResolvedValue({
    importBatchId,
    rows: [previewRow],
  });
  act(() => result.current.handleDraftCsvTextChange('header,row'));
  await act(async () => {
    await result.current.previewImport();
  });
  expect(result.current.previewActive).toBe(true);
}

describe('usePowerBiImportWorkflow', () => {
  it('ignores an older file read that finishes after the current selection', async () => {
    const olderRead = deferred<string>();
    const newerRead = deferred<string>();
    const olderFile = {
      name: 'older.csv',
      text: () => olderRead.promise,
    } as File;
    const newerFile = {
      name: 'newer.csv',
      text: () => newerRead.promise,
    } as File;
    const { result } = renderWorkflow();

    act(() => {
      result.current.handleFileChange(olderFile);
      result.current.handleFileChange(newerFile);
    });
    await act(async () => newerRead.resolve('newer,file'));
    await waitFor(() => expect(result.current.isReadingFile).toBe(false));
    await act(async () => olderRead.resolve('older,file'));

    serverMocks.previewImport.mockResolvedValue({
      importBatchId,
      rows: [previewRow],
    });
    await act(async () => {
      await result.current.previewImport();
    });

    expect(serverMocks.previewImport).toHaveBeenCalledWith({
      data: {
        projectId,
        payload: {
          csvText: 'newer,file',
          sourceType: 'powerbi_expenditure_actuals',
          fileName: 'newer.csv',
          autoCreateStructures: true,
        },
      },
    });
  });

  it('permits only one commit while a slow mutation is in flight', async () => {
    const append = deferred<{
      count: number;
      skipped: number;
      replaced: number;
    }>();
    const onAppend = vi.fn(() => append.promise);
    const { result } = renderWorkflow({ onAppend });
    await createPreview(result);

    let firstCommit!: Promise<string | null>;
    let duplicateCommit!: Promise<string | null>;
    act(() => {
      firstCommit = result.current.commitAppend();
      duplicateCommit = result.current.commitAppend();
    });

    expect(result.current.isCommitting).toBe(true);
    expect(onAppend).toHaveBeenCalledOnce();
    await expect(duplicateCommit).resolves.toBeNull();

    await act(async () =>
      append.resolve({ count: 1, skipped: 0, replaced: 0 })
    );
    await expect(firstCommit).resolves.toBe('Imported 1 rows.');
    expect(result.current.isCommitting).toBe(false);
    expect(result.current.previewActive).toBe(false);
  });

  it('keeps a failed import preview available and succeeds on retry', async () => {
    const onAppend = vi
      .fn()
      .mockRejectedValueOnce(new Error('Import commit timed out'))
      .mockResolvedValueOnce({ count: 1, skipped: 0, replaced: 0 });
    const { result } = renderWorkflow({ onAppend });
    await createPreview(result);

    await act(async () => {
      await result.current.commitAppend();
    });
    expect(result.current.importError).toBe('Import commit timed out');
    expect(result.current.previewActive).toBe(true);

    await act(async () => {
      await result.current.commitAppend();
    });
    expect(onAppend).toHaveBeenCalledTimes(2);
    expect(result.current.importError).toBeNull();
    expect(result.current.previewActive).toBe(false);
  });

  it('tracks review, invalid, duplicate, and excluded decisions explicitly', async () => {
    const rows = [
      previewRow,
      previewRowWith(2, {
        importAction: 'review',
        mappingStatus: 'uncoded',
      }),
      previewRowWith(3, {
        importAction: 'exclude',
        mappingStatus: 'uncoded',
      }),
      previewRowWith(4, {
        mappingStatus: 'invalid',
      }),
      previewRowWith(5, {
        duplicate: true,
        duplicateReason: 'import',
      }),
    ];
    const { result } = renderWorkflow();
    serverMocks.previewImport.mockResolvedValue({ importBatchId, rows });
    act(() => result.current.handleDraftCsvTextChange('header,row'));
    await act(async () => {
      await result.current.previewImport();
    });

    expect(result.current.previewSummary).toMatchObject({
      rows: 5,
      included: 1,
      excluded: 1,
      invalid: 1,
      duplicate: 1,
      review: 1,
    });
    expect(result.current.hasBlockingIssues).toBe(true);
    expect(result.current.hasReplaceAllBlockers).toBe(true);

    act(() => {
      result.current.setReviewRowsDecision([2], 'import_uncoded');
      result.current.togglePreviewRow(4);
      result.current.togglePreviewRow(5);
    });

    expect(result.current.unresolvedReviewPreviewRows).toHaveLength(0);
    expect(result.current.includedPreviewRows).toHaveLength(2);
    expect(result.current.excludedPreviewRows).toHaveLength(3);
    expect(result.current.hasBlockingIssues).toBe(false);
    expect(result.current.hasReplaceAllBlockers).toBe(false);
  });

  it('clears local preview state even when server draft cancellation fails', async () => {
    const { result } = renderWorkflow();
    await createPreview(result);
    serverMocks.cancelPreview.mockRejectedValue(
      new Error('Cancellation endpoint unavailable')
    );

    await act(async () => {
      await result.current.clearPreview();
    });

    expect(result.current.previewActive).toBe(false);
    expect(result.current.importError).toContain('Preview was cleared locally');
    expect(result.current.importError).toContain(
      'Cancellation endpoint unavailable'
    );
    expect(serverMocks.cancelPreview).toHaveBeenCalledWith({
      data: { projectId, importBatchId },
    });
  });

  it('keeps replacement state after failure and resets it after retry', async () => {
    const onReplaceAll = vi
      .fn<(options: CommitOptions) => Promise<TxnImportResult>>()
      .mockRejectedValueOnce(new Error('Protected rows block replacement'))
      .mockResolvedValueOnce({ count: 2, skipped: 0, replaced: 3 });
    const { result } = renderWorkflow({ onReplaceAll });
    await createPreview(result);
    act(() => result.current.setConfirmReplaceOpen(true));

    await act(async () => {
      await result.current.commitReplaceAll();
    });
    expect(result.current.importError).toBe('Protected rows block replacement');
    expect(result.current.confirmReplaceOpen).toBe(true);
    expect(result.current.previewActive).toBe(true);

    let message: string | null = null;
    await act(async () => {
      message = await result.current.commitReplaceAll();
    });
    expect(message).toBe(
      'Replaced 3 transaction(s) in the imported period with 2 rows.'
    );
    expect(result.current.confirmReplaceOpen).toBe(false);
    expect(result.current.previewActive).toBe(false);
  });

  it('reports a current file-read failure without retaining stale content', async () => {
    const { result } = renderWorkflow();
    const unreadableFile = {
      name: 'unreadable.csv',
      text: () => Promise.reject(new Error('Local file permission denied')),
    } as File;

    act(() => result.current.handleFileChange(unreadableFile));
    await waitFor(() => expect(result.current.isReadingFile).toBe(false));

    expect(result.current.file).toBeNull();
    expect(result.current.importError).toBe('Local file permission denied');
  });
});

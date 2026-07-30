import { useMemo, useRef, useState } from 'react';
import type {
  MRT_PaginationState,
  MRT_SortingState,
} from 'mantine-react-table-open';

import type {
  ImportReviewDecision,
  TxnImportInput,
  TxnImportResult,
} from '../api/types';
import type { ImportBatchId, ImportPreviewRow, ProjectId } from '../types';
import { showAppToast } from '../utils/toast';
import {
  cancelImportPreviewServerFn,
  previewImportTransactionsServerFn,
} from '../server/start/functions/importReads';

type PowerBiImportCommitOptions = Omit<TxnImportInput, 'mode'>;
export type ImportPreviewTab =
  | 'included'
  | 'needsReview'
  | 'duplicate'
  | 'invalid'
  | 'excluded';

export function usePowerBiImportWorkflow(params: {
  projectId: ProjectId;
  initialPageSize: number;
  onAppend: (options: PowerBiImportCommitOptions) => Promise<TxnImportResult>;
  onReplaceAll: (
    options: PowerBiImportCommitOptions
  ) => Promise<TxnImportResult>;
}) {
  const { projectId, initialPageSize, onAppend, onReplaceAll } = params;
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [draftCsvText, setDraftCsvText] = useState('');
  const [autoCreateStructures, setAutoCreateStructures] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [previewTab, setPreviewTab] = useState<ImportPreviewTab>('included');
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[] | null>(
    null
  );
  const [previewBatchId, setPreviewBatchId] = useState<ImportBatchId | null>(
    null
  );
  const [previewSourceLabel, setPreviewSourceLabel] = useState<string | null>(
    null
  );
  const [excludedSourceRowIndexes, setExcludedSourceRowIndexes] = useState<
    Set<number>
  >(new Set());
  const [reviewDecisions, setReviewDecisions] = useState<
    Map<number, ImportReviewDecision['decision']>
  >(new Map());
  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'sourceRowIndex', desc: false },
  ]);
  const fileReadGenerationRef = useRef(0);
  const commitInFlightRef = useRef(false);

  const previewActive = previewRows !== null;

  const activePreviewRows = useMemo(
    () =>
      (previewRows ?? []).filter(
        (row) => !excludedSourceRowIndexes.has(row.sourceRowIndex)
      ),
    [excludedSourceRowIndexes, previewRows]
  );

  const needsReviewPreviewRows = useMemo(
    () => (previewRows ?? []).filter((row) => row.importAction === 'review'),
    [previewRows]
  );

  const unresolvedReviewPreviewRows = useMemo(
    () =>
      needsReviewPreviewRows.filter(
        (row) => !reviewDecisions.has(row.sourceRowIndex)
      ),
    [needsReviewPreviewRows, reviewDecisions]
  );

  const duplicatePreviewRows = useMemo(
    () => activePreviewRows.filter((row) => row.duplicate),
    [activePreviewRows]
  );

  const invalidPreviewRows = useMemo(
    () => activePreviewRows.filter((row) => row.mappingStatus === 'invalid'),
    [activePreviewRows]
  );

  const includedPreviewRows = useMemo(
    () =>
      activePreviewRows.filter(
        (row) =>
          (row.importAction === 'import' ||
            reviewDecisions.get(row.sourceRowIndex) === 'import_uncoded') &&
          row.mappingStatus !== 'invalid' &&
          !row.duplicate
      ),
    [activePreviewRows, reviewDecisions]
  );

  const excludedPreviewRows = useMemo(
    () =>
      (previewRows ?? []).filter((row) =>
        excludedSourceRowIndexes.has(row.sourceRowIndex)
      ),
    [excludedSourceRowIndexes, previewRows]
  );

  const visiblePreviewRows = useMemo(() => {
    if (previewTab === 'needsReview') return needsReviewPreviewRows;
    if (previewTab === 'duplicate') return duplicatePreviewRows;
    if (previewTab === 'invalid') return invalidPreviewRows;
    if (previewTab === 'excluded') return excludedPreviewRows;
    return includedPreviewRows;
  }, [
    duplicatePreviewRows,
    excludedPreviewRows,
    includedPreviewRows,
    invalidPreviewRows,
    needsReviewPreviewRows,
    previewTab,
  ]);

  const previewSummary = useMemo(() => {
    const counts = {
      rows: (previewRows ?? []).length,
      active: activePreviewRows.length,
      included: includedPreviewRows.length,
      excluded: 0,
      invalid: 0,
      duplicate: 0,
      uncoded: 0,
      review: 0,
    };

    for (const row of previewRows ?? []) {
      if (
        row.importAction === 'review' &&
        !reviewDecisions.has(row.sourceRowIndex)
      ) {
        counts.review += 1;
      }
      if (excludedSourceRowIndexes.has(row.sourceRowIndex)) {
        counts.excluded += 1;
        continue;
      }
      if (row.mappingStatus === 'invalid') counts.invalid += 1;
      if (row.duplicate) counts.duplicate += 1;
      if (row.mappingStatus === 'uncoded') counts.uncoded += 1;
    }

    return counts;
  }, [
    activePreviewRows.length,
    excludedSourceRowIndexes,
    includedPreviewRows.length,
    previewRows,
    reviewDecisions,
  ]);

  const hasBlockingIssues = useMemo(
    () =>
      activePreviewRows.some(
        (row) =>
          row.mappingStatus === 'invalid' || (!skipDuplicates && row.duplicate)
      ) || unresolvedReviewPreviewRows.length > 0,
    [activePreviewRows, skipDuplicates, unresolvedReviewPreviewRows.length]
  );

  const hasReplaceAllBlockers = useMemo(
    () =>
      activePreviewRows.some(
        (row) =>
          row.mappingStatus === 'invalid' || row.duplicateReason === 'import'
      ) || unresolvedReviewPreviewRows.length > 0,
    [activePreviewRows, unresolvedReviewPreviewRows.length]
  );

  function clearFeedback() {
    setImportError(null);
  }

  function updatePreviewTab(nextTab: ImportPreviewTab) {
    setPreviewTab(nextTab);
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
    );
  }

  async function loadFileText(nextFile: File, generation: number) {
    setIsReadingFile(true);
    try {
      const text = await nextFile.text();
      if (fileReadGenerationRef.current !== generation) return;
      setFileText(text);
    } catch (error) {
      if (fileReadGenerationRef.current !== generation) return;
      setFile(null);
      setFileText('');
      setImportError(
        error instanceof Error
          ? error.message
          : 'Could not read the PowerBI CSV file.'
      );
    } finally {
      if (fileReadGenerationRef.current === generation) {
        setIsReadingFile(false);
      }
    }
  }

  function handleFileChange(nextFile: File | null) {
    const generation = fileReadGenerationRef.current + 1;
    fileReadGenerationRef.current = generation;
    clearFeedback();
    setFile(nextFile);
    setFileText('');
    if (nextFile) {
      void loadFileText(nextFile, generation);
    } else {
      setIsReadingFile(false);
    }
  }

  function handleDraftCsvTextChange(nextValue: string) {
    clearFeedback();
    setDraftCsvText(nextValue);
  }

  function resetImporter() {
    fileReadGenerationRef.current += 1;
    setFile(null);
    setFileText('');
    setIsReadingFile(false);
    setDraftCsvText('');
    setPreviewRows(null);
    setPreviewBatchId(null);
    setPreviewSourceLabel(null);
    updatePreviewTab('included');
    setExcludedSourceRowIndexes(new Set());
    setReviewDecisions(new Map());
    setImportError(null);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    setSorting([{ id: 'sourceRowIndex', desc: false }]);
  }

  async function clearPreview() {
    const batchId = previewBatchId;
    resetImporter();
    if (!batchId) return;

    try {
      await cancelImportPreviewServerFn({
        data: { projectId, importBatchId: batchId },
      });
    } catch (error) {
      setImportError(
        error instanceof Error
          ? `Preview was cleared locally, but the server draft could not be cancelled: ${error.message}`
          : 'Preview was cleared locally, but the server draft could not be cancelled.'
      );
    }
  }

  async function previewImport() {
    if (isPreviewing) return null;

    setIsPreviewing(true);
    try {
      clearFeedback();

      const sourceText = file ? fileText : draftCsvText;
      const sourceLabel = file
        ? `Uploaded PowerBI export: ${file.name}`
        : 'Pasted PowerBI CSV';
      if (!sourceText.trim()) {
        throw new Error(
          'Add a PowerBI CSV file or paste PowerBI CSV text before previewing the import.'
        );
      }

      const preview = await previewImportTransactionsServerFn({
        data: {
          projectId,
          payload: {
            csvText: sourceText,
            sourceType: 'powerbi_expenditure_actuals',
            fileName: file?.name,
            autoCreateStructures,
          },
        },
      });
      if (!preview.rows.length) {
        throw new Error(
          'No importable rows were found in the provided PowerBI CSV.'
        );
      }

      setPreviewRows(preview.rows);
      setPreviewBatchId(preview.importBatchId ?? null);
      setPreviewSourceLabel(sourceLabel);
      updatePreviewTab('included');
      setExcludedSourceRowIndexes(
        new Set(
          preview.rows.flatMap((row) =>
            row.importAction === 'exclude' ? [row.sourceRowIndex] : []
          )
        )
      );
      setReviewDecisions(new Map());
      setPagination((current) => ({ ...current, pageIndex: 0 }));
      return preview;
    } catch (error) {
      setPreviewRows(null);
      setPreviewBatchId(null);
      setPreviewSourceLabel(null);
      updatePreviewTab('included');
      setExcludedSourceRowIndexes(new Set());
      setReviewDecisions(new Map());
      setImportError(
        error instanceof Error ? error.message : 'Could not preview the import.'
      );
      return null;
    } finally {
      setIsPreviewing(false);
    }
  }

  function togglePreviewRow(sourceRowIndex: number) {
    setExcludedSourceRowIndexes((current) => {
      const next = new Set(current);
      if (next.has(sourceRowIndex)) next.delete(sourceRowIndex);
      else next.add(sourceRowIndex);
      return next;
    });
  }

  function setReviewRowsDecision(
    sourceRowIndexes: number[],
    decision: ImportReviewDecision['decision']
  ) {
    if (!sourceRowIndexes.length) return;
    setReviewDecisions((current) => {
      const next = new Map(current);
      for (const sourceRowIndex of sourceRowIndexes) {
        next.set(sourceRowIndex, decision);
      }
      return next;
    });
    setExcludedSourceRowIndexes((current) => {
      const next = new Set(current);
      for (const sourceRowIndex of sourceRowIndexes) {
        if (decision === 'exclude') next.add(sourceRowIndex);
        else next.delete(sourceRowIndex);
      }
      return next;
    });
  }

  function importCommitOptions(): PowerBiImportCommitOptions {
    if (!previewBatchId) {
      throw new Error('Import preview is missing its server batch ID.');
    }
    return {
      importBatchId: previewBatchId,
      skipDuplicates,
      excludedSourceRowIndexes: [...excludedSourceRowIndexes],
      reviewDecisions: needsReviewPreviewRows.flatMap((row) => {
        const decision = reviewDecisions.get(row.sourceRowIndex);
        return decision
          ? [{ sourceRowIndex: row.sourceRowIndex, decision }]
          : [];
      }),
    };
  }

  async function commitAppend() {
    if (commitInFlightRef.current) return null;
    commitInFlightRef.current = true;
    setIsCommitting(true);
    try {
      clearFeedback();
      const result = await onAppend(importCommitOptions());
      resetImporter();
      return result.count === 0
        ? 'Completed the import with no rows added.'
        : result.skipped > 0
          ? `Imported ${result.count} rows. Skipped ${result.skipped} duplicate row(s).`
          : `Imported ${result.count} rows.`;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not append imported transactions.';
      setImportError(message);
      showAppToast({ tone: 'error', title: 'Import failed', message });
      return null;
    } finally {
      commitInFlightRef.current = false;
      setIsCommitting(false);
    }
  }

  async function commitReplaceAll() {
    if (commitInFlightRef.current) return null;
    commitInFlightRef.current = true;
    setIsCommitting(true);
    try {
      clearFeedback();
      const result = await onReplaceAll(importCommitOptions());
      setConfirmReplaceOpen(false);
      resetImporter();
      return `Replaced ${result.replaced} transaction(s) in the imported period with ${result.count} rows.`;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not replace imported transactions.';
      setImportError(message);
      showAppToast({ tone: 'error', title: 'Import failed', message });
      return null;
    } finally {
      commitInFlightRef.current = false;
      setIsCommitting(false);
    }
  }

  return {
    file,
    isReadingFile,
    isPreviewing,
    isCommitting,
    draftCsvText,
    autoCreateStructures,
    skipDuplicates,
    previewTab,
    confirmReplaceOpen,
    importError,
    previewRows,
    activePreviewRows,
    includedPreviewRows,
    needsReviewPreviewRows,
    unresolvedReviewPreviewRows,
    duplicatePreviewRows,
    invalidPreviewRows,
    excludedPreviewRows,
    previewSourceLabel,
    excludedSourceRowIndexes,
    reviewDecisions,
    pagination,
    sorting,
    previewActive,
    visiblePreviewRows,
    previewSummary,
    hasBlockingIssues,
    hasReplaceAllBlockers,
    setAutoCreateStructures,
    setSkipDuplicates,
    setPreviewTab: updatePreviewTab,
    setConfirmReplaceOpen,
    setPagination,
    setSorting,
    handleFileChange,
    handleDraftCsvTextChange,
    clearPreview,
    resetImporter,
    previewImport,
    togglePreviewRow,
    setReviewRowsDecision,
    commitAppend,
    commitReplaceAll,
  };
}

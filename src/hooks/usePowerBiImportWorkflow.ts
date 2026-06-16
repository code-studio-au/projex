import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  MRT_PaginationState,
  MRT_SortingState,
} from 'mantine-react-table-open';

import type { TaxonomyHook } from './useTaxonomy';
import type { BudgetsHook } from './useBudgets';
import type {
  CategoryId,
  CompanyId,
  ImportBatchId,
  ImportPreviewRow,
  ProjectId,
  SubCategoryId,
  Txn,
} from '../types';
import { asTxnId } from '../types';
import { withStandardTxnAccountingMetadata } from '../utils/transactions';
import { txnInputSchema } from '../validation/schemas';
import { qk } from '../queries/keys';
import { useQueryScopeUserId } from '../queries/scope';
import {
  cancelImportPreviewServerFn,
  previewImportTransactionsServerFn,
} from '../server/start/functions/importReads';

type PowerBiImportMode = 'append' | 'replaceAll';
export type ImportPreviewTab =
  | 'included'
  | 'needsReview'
  | 'duplicate'
  | 'invalid'
  | 'excluded';

function validateImportedRows(
  rows: Array<Pick<Txn, 'date' | 'item' | 'description' | 'amountCents'>>
) {
  for (let index = 0; index < rows.length; index += 1) {
    const parsed = txnInputSchema.safeParse(rows[index]);
    if (parsed.success) continue;
    const issue = parsed.error.issues[0];
    const field = String(issue?.path?.[0] ?? '');
    if (field === 'date') {
      throw new Error(
        `Row ${index + 1}: Transaction date "${rows[index]?.date ?? ''}" must be YYYY-MM-DD`
      );
    }
    throw new Error(issue?.message ?? `Row ${index + 1}: Validation failed`);
  }
}

export function usePowerBiImportWorkflow(params: {
  taxonomy: TaxonomyHook;
  budgets: BudgetsHook;
  companyId: CompanyId;
  projectId: ProjectId;
  canEditBudgets: boolean;
  initialPageSize: number;
  onAppend: (
    txns: Txn[],
    options?: { autoCreateBudgets?: boolean }
  ) => Promise<void>;
  onReplaceAll: (
    txns: Txn[],
    options?: { autoCreateBudgets?: boolean }
  ) => Promise<void>;
}) {
  const {
    taxonomy,
    budgets,
    companyId,
    projectId,
    canEditBudgets,
    initialPageSize,
    onAppend,
    onReplaceAll,
  } = params;
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();

  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [draftCsvText, setDraftCsvText] = useState('');
  const [autoCreateStructures, setAutoCreateStructures] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [previewTab, setPreviewTab] = useState<ImportPreviewTab>('included');
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
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
  const [excludedImportIds, setExcludedImportIds] = useState<Set<string>>(
    new Set()
  );
  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'sourceRowIndex', desc: false },
  ]);

  const previewActive = previewRows !== null;

  const activePreviewRows = useMemo(
    () =>
      (previewRows ?? []).filter((row) => !excludedImportIds.has(row.importId)),
    [excludedImportIds, previewRows]
  );

  const needsReviewPreviewRows = useMemo(
    () => activePreviewRows.filter((row) => row.importAction === 'review'),
    [activePreviewRows]
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
          row.importAction === 'import' &&
          row.mappingStatus !== 'invalid' &&
          !row.duplicate
      ),
    [activePreviewRows]
  );

  const excludedPreviewRows = useMemo(
    () =>
      (previewRows ?? []).filter((row) => excludedImportIds.has(row.importId)),
    [excludedImportIds, previewRows]
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
      if (row.importAction === 'review') counts.review += 1;
      if (excludedImportIds.has(row.importId)) {
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
    excludedImportIds,
    includedPreviewRows.length,
    previewRows,
  ]);

  const hasBlockingIssues = useMemo(
    () =>
      activePreviewRows.some(
        (row) =>
          row.mappingStatus === 'invalid' ||
          row.importAction === 'review' ||
          (!skipDuplicates && row.duplicate)
      ),
    [activePreviewRows, skipDuplicates]
  );

  const hasReplaceAllBlockers = useMemo(
    () =>
      activePreviewRows.some(
        (row) =>
          row.mappingStatus === 'invalid' ||
          row.importAction === 'review' ||
          row.duplicateReason === 'import'
      ),
    [activePreviewRows]
  );

  function clearFeedback() {
    setImportError(null);
    setImportNotice(null);
  }

  function updatePreviewTab(nextTab: ImportPreviewTab) {
    setPreviewTab(nextTab);
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
    );
  }

  async function loadFileText(nextFile: File) {
    setIsReadingFile(true);
    try {
      const text = await nextFile.text();
      setFileText(text);
    } catch (error) {
      setFile(null);
      setFileText('');
      setImportError(
        error instanceof Error
          ? error.message
          : 'Could not read the PowerBI CSV file.'
      );
    } finally {
      setIsReadingFile(false);
    }
  }

  function handleFileChange(nextFile: File | null) {
    clearFeedback();
    setFile(nextFile);
    setFileText('');
    if (nextFile) {
      void loadFileText(nextFile);
    }
  }

  function handleDraftCsvTextChange(nextValue: string) {
    clearFeedback();
    setDraftCsvText(nextValue);
  }

  function resetImporter() {
    setFile(null);
    setFileText('');
    setDraftCsvText('');
    setPreviewRows(null);
    setPreviewBatchId(null);
    setPreviewSourceLabel(null);
    updatePreviewTab('included');
    setExcludedImportIds(new Set());
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
      await qc.invalidateQueries({
        queryKey: qk.importCandidates(scopeUserId, projectId),
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
      setExcludedImportIds(
        new Set(
          preview.rows
            .filter((row) => row.importAction === 'exclude')
            .map((row) => row.importId)
        )
      );
      setPagination((current) => ({ ...current, pageIndex: 0 }));
      return preview;
    } catch (error) {
      setPreviewRows(null);
      setPreviewBatchId(null);
      setPreviewSourceLabel(null);
      updatePreviewTab('included');
      setExcludedImportIds(new Set());
      setImportError(
        error instanceof Error ? error.message : 'Could not preview the import.'
      );
      return null;
    }
  }

  function togglePreviewRow(importId: string) {
    setExcludedImportIds((current) => {
      const next = new Set(current);
      if (next.has(importId)) next.delete(importId);
      else next.add(importId);
      return next;
    });
  }

  const ensureBudgetLinesForImportedSubCategories = async (
    next: Array<{ categoryId?: CategoryId; subCategoryId?: SubCategoryId }>
  ) => {
    if (!autoCreateStructures || !canEditBudgets) return;

    const existing = new Set(
      budgets.budgets
        .map((budget) => budget.subCategoryId)
        .filter((id): id is SubCategoryId => Boolean(id))
    );
    const createdThisRun = new Set<SubCategoryId>();

    for (const txn of next) {
      const subId = txn.subCategoryId;
      const catId = txn.categoryId;
      if (!subId || !catId) continue;
      if (existing.has(subId) || createdThisRun.has(subId)) continue;
      createdThisRun.add(subId);
      await budgets.upsertBudgetForSubCategory(subId, catId);
    }
  };

  const buildImportPayloadFromPreview = async (
    mode: PowerBiImportMode
  ): Promise<{ txns: Txn[]; skipped: number }> => {
    const activeRows = (previewRows ?? []).filter(
      (row) =>
        !excludedImportIds.has(row.importId) &&
        row.importAction === 'import' &&
        row.mappingStatus !== 'invalid' &&
        (mode === 'replaceAll' || !skipDuplicates || !row.duplicate)
    );

    const categoryIdByName = new Map<string, CategoryId>(
      taxonomy.categories.map((category) => [
        category.name.trim().toLowerCase(),
        category.id,
      ])
    );
    const subCategoryIdByKey = new Map<string, SubCategoryId>(
      taxonomy.subCategories.map((subCategory) => {
        const categoryName = taxonomy
          .getCategoryName(subCategory.categoryId)
          .trim()
          .toLowerCase();
        return [
          `${categoryName}|||${subCategory.name.trim().toLowerCase()}`,
          subCategory.id,
        ];
      })
    );

    for (const row of activeRows) {
      if (!row.willCreateCategory || !row.categoryName) continue;
      const key = row.categoryName.trim().toLowerCase();
      if (categoryIdByName.has(key)) continue;
      const createdId = await taxonomy.addCategory(row.categoryName);
      categoryIdByName.set(key, createdId);
    }

    for (const row of activeRows) {
      if (
        !row.willCreateSubCategory ||
        !row.categoryName ||
        !row.subCategoryName
      )
        continue;
      const categoryKey = row.categoryName.trim().toLowerCase();
      const categoryId = categoryIdByName.get(categoryKey);
      if (!categoryId) {
        throw new Error(
          `Could not resolve category "${row.categoryName}" for imported subcategory creation.`
        );
      }
      const subKey = `${categoryKey}|||${row.subCategoryName.trim().toLowerCase()}`;
      if (subCategoryIdByKey.has(subKey)) continue;
      const createdId = await taxonomy.addSubCategory(
        categoryId,
        row.subCategoryName
      );
      subCategoryIdByKey.set(subKey, createdId);
    }

    const txns: Txn[] = [];
    let skipped = 0;

    for (const row of previewRows ?? []) {
      if (excludedImportIds.has(row.importId)) continue;
      if (row.importAction !== 'import') continue;
      if (row.mappingStatus === 'invalid') continue;
      if (mode === 'append' && skipDuplicates && row.duplicate) {
        skipped += 1;
        continue;
      }

      let categoryId = row.categoryId;
      let subCategoryId = row.subCategoryId;

      if (row.categoryName) {
        categoryId =
          categoryIdByName.get(row.categoryName.trim().toLowerCase()) ??
          categoryId;
      }
      if (row.categoryName && row.subCategoryName) {
        const subKey = `${row.categoryName.trim().toLowerCase()}|||${row.subCategoryName
          .trim()
          .toLowerCase()}`;
        subCategoryId = subCategoryIdByKey.get(subKey) ?? subCategoryId;
      }

      txns.push(
        withStandardTxnAccountingMetadata({
          id: asTxnId(row.importId),
          externalId: row.externalId,
          companyId,
          projectId,
          date: row.parsedDate ?? '',
          item: row.item ?? '',
          description: row.description ?? '',
          amountCents: row.amountCents ?? 0,
          categoryId,
          subCategoryId,
          companyDefaultMappingRuleId: row.ruleId,
          codingSource: row.codingSource,
          codingPendingApproval: row.codingPendingApproval,
          importBatchId: previewBatchId ?? undefined,
          importSourceType: row.sourceType,
          importSourceMeta: row.rawSourceRow,
        })
      );
    }

    validateImportedRows(txns);
    return { txns, skipped };
  };

  async function commitAppend() {
    try {
      clearFeedback();
      const { txns, skipped } = await buildImportPayloadFromPreview('append');
      await ensureBudgetLinesForImportedSubCategories(txns);
      await onAppend(txns, { autoCreateBudgets: autoCreateStructures });
      const importedCount = txns.length;
      resetImporter();
      setImportNotice(
        skipped > 0
          ? `Imported ${importedCount} rows. Skipped ${skipped} duplicate preview row(s).`
          : `Imported ${importedCount} rows.`
      );
    } catch (error) {
      setImportNotice(null);
      setImportError(
        error instanceof Error
          ? error.message
          : 'Could not append imported transactions.'
      );
    }
  }

  async function commitReplaceAll() {
    try {
      clearFeedback();
      const { txns } = await buildImportPayloadFromPreview('replaceAll');
      await ensureBudgetLinesForImportedSubCategories(txns);
      await onReplaceAll(txns, { autoCreateBudgets: autoCreateStructures });
      const importedCount = txns.length;
      setConfirmReplaceOpen(false);
      resetImporter();
      setImportNotice(
        `Replaced transactions with ${importedCount} imported rows.`
      );
    } catch (error) {
      setImportNotice(null);
      setImportError(
        error instanceof Error
          ? error.message
          : 'Could not replace imported transactions.'
      );
    }
  }

  return {
    file,
    isReadingFile,
    draftCsvText,
    autoCreateStructures,
    skipDuplicates,
    previewTab,
    confirmReplaceOpen,
    importNotice,
    importError,
    previewRows,
    activePreviewRows,
    includedPreviewRows,
    needsReviewPreviewRows,
    duplicatePreviewRows,
    invalidPreviewRows,
    excludedPreviewRows,
    previewSourceLabel,
    excludedImportIds,
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
    commitAppend,
    commitReplaceAll,
  };
}

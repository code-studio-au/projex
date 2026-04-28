import { useEffect, useMemo, useState } from 'react';
import type {
  MRT_PaginationState,
  MRT_SortingState,
} from 'mantine-react-table';

import { useApi } from './useApi';
import type { TaxonomyHook } from './useTaxonomy';
import type { BudgetsHook } from './useBudgets';
import type {
  CategoryId,
  CompanyId,
  ImportPreviewRow,
  ProjectId,
  SubCategoryId,
  Txn,
} from '../types';
import { txnInputSchema } from '../validation/schemas';

export type ImportPreviewFilter =
  | 'all'
  | 'exceptions'
  | 'invalid'
  | 'duplicate'
  | 'uncoded'
  | 'warnings';

type CsvImportMode = 'append' | 'replaceAll';

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

export function useCsvImportWorkflow(params: {
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
  const api = useApi();

  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [draftCsvText, setDraftCsvText] = useState('');
  const [autoCreateStructures, setAutoCreateStructures] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [previewFilter, setPreviewFilter] =
    useState<ImportPreviewFilter>('all');
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[] | null>(
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

  const includedPreviewRows = useMemo(
    () =>
      (previewRows ?? []).filter((row) => !excludedImportIds.has(row.importId)),
    [excludedImportIds, previewRows]
  );

  const filteredPreviewRows = useMemo(() => {
    const rows = previewRows ?? [];
    if (previewFilter === 'all') return rows;

    return rows.filter((row) => {
      const isException =
        excludedImportIds.has(row.importId) ||
        row.duplicate ||
        row.mappingStatus === 'invalid' ||
        row.mappingStatus === 'uncoded' ||
        row.warnings.length > 0;

      if (previewFilter === 'exceptions') return isException;
      if (previewFilter === 'invalid') return row.mappingStatus === 'invalid';
      if (previewFilter === 'duplicate') return row.duplicate;
      if (previewFilter === 'uncoded') return row.mappingStatus === 'uncoded';
      if (previewFilter === 'warnings') return row.warnings.length > 0;
      return true;
    });
  }, [excludedImportIds, previewFilter, previewRows]);

  const previewSummary = useMemo(() => {
    const counts = {
      rows: (previewRows ?? []).length,
      included: 0,
      excluded: 0,
      invalid: 0,
      duplicate: 0,
      uncoded: 0,
    };

    for (const row of previewRows ?? []) {
      if (excludedImportIds.has(row.importId)) {
        counts.excluded += 1;
        continue;
      }
      counts.included += 1;
      if (row.mappingStatus === 'invalid') counts.invalid += 1;
      if (row.duplicate) counts.duplicate += 1;
      if (row.mappingStatus === 'uncoded') counts.uncoded += 1;
    }

    return counts;
  }, [excludedImportIds, previewRows]);

  const previewFilterCounts = useMemo(() => {
    const rows = previewRows ?? [];
    return {
      all: rows.length,
      exceptions: rows.filter(
        (row) =>
          excludedImportIds.has(row.importId) ||
          row.duplicate ||
          row.mappingStatus === 'invalid' ||
          row.mappingStatus === 'uncoded' ||
          row.warnings.length > 0
      ).length,
      invalid: rows.filter((row) => row.mappingStatus === 'invalid').length,
      duplicate: rows.filter((row) => row.duplicate).length,
      uncoded: rows.filter((row) => row.mappingStatus === 'uncoded').length,
      warnings: rows.filter((row) => row.warnings.length > 0).length,
    };
  }, [excludedImportIds, previewRows]);

  const filteredPreviewIds = useMemo(
    () => filteredPreviewRows.map((row) => row.importId),
    [filteredPreviewRows]
  );
  const filteredIncludedCount = useMemo(
    () => filteredPreviewIds.filter((id) => !excludedImportIds.has(id)).length,
    [excludedImportIds, filteredPreviewIds]
  );
  const filteredExcludedCount = useMemo(
    () => filteredPreviewIds.filter((id) => excludedImportIds.has(id)).length,
    [excludedImportIds, filteredPreviewIds]
  );

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [previewFilter]);

  const hasBlockingIssues = useMemo(
    () =>
      includedPreviewRows.some(
        (row) =>
          row.mappingStatus === 'invalid' || (!skipDuplicates && row.duplicate)
      ),
    [includedPreviewRows, skipDuplicates]
  );

  const hasReplaceAllBlockers = useMemo(
    () =>
      includedPreviewRows.some(
        (row) =>
          row.mappingStatus === 'invalid' || row.duplicateReason === 'import'
      ),
    [includedPreviewRows]
  );

  function clearFeedback() {
    setImportError(null);
    setImportNotice(null);
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
        error instanceof Error ? error.message : 'Could not read the CSV file.'
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
    setPreviewSourceLabel(null);
    setPreviewFilter('all');
    setExcludedImportIds(new Set());
    setImportError(null);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    setSorting([{ id: 'sourceRowIndex', desc: false }]);
  }

  async function previewImport() {
    try {
      clearFeedback();

      const sourceText = file ? fileText : draftCsvText;
      const sourceLabel = file ? `Uploaded file: ${file.name}` : 'Pasted CSV';
      if (!sourceText.trim()) {
        throw new Error(
          'Add a CSV file or paste CSV text before previewing the import.'
        );
      }

      const preview = await api.previewImportTransactions(projectId, {
        csvText: sourceText,
        autoCreateStructures,
      });
      if (!preview.rows.length) {
        throw new Error('No importable rows were found in the provided CSV.');
      }

      setPreviewRows(preview.rows);
      setPreviewSourceLabel(sourceLabel);
      setPreviewFilter('all');
      setExcludedImportIds(new Set());
      setPagination((current) => ({ ...current, pageIndex: 0 }));
    } catch (error) {
      setPreviewRows(null);
      setPreviewSourceLabel(null);
      setPreviewFilter('all');
      setExcludedImportIds(new Set());
      setImportError(
        error instanceof Error ? error.message : 'Could not preview the import.'
      );
    }
  }

  function excludePreviewRows(importIds: string[]) {
    setExcludedImportIds((current) => {
      const next = new Set(current);
      for (const importId of importIds) next.add(importId);
      return next;
    });
  }

  function includePreviewRows(importIds: string[]) {
    setExcludedImportIds((current) => {
      const next = new Set(current);
      for (const importId of importIds) next.delete(importId);
      return next;
    });
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
    mode: CsvImportMode
  ): Promise<{ txns: Txn[]; skipped: number }> => {
    const activeRows = (previewRows ?? []).filter(
      (row) =>
        !excludedImportIds.has(row.importId) &&
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

      txns.push({
        id: row.importId as Txn['id'],
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
      });
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
    previewFilter,
    confirmReplaceOpen,
    importNotice,
    importError,
    previewRows,
    previewSourceLabel,
    excludedImportIds,
    pagination,
    sorting,
    previewActive,
    filteredPreviewRows,
    previewSummary,
    previewFilterCounts,
    filteredPreviewIds,
    filteredIncludedCount,
    filteredExcludedCount,
    hasBlockingIssues,
    hasReplaceAllBlockers,
    setAutoCreateStructures,
    setSkipDuplicates,
    setPreviewFilter,
    setConfirmReplaceOpen,
    setPagination,
    setSorting,
    handleFileChange,
    handleDraftCsvTextChange,
    resetImporter,
    previewImport,
    excludePreviewRows,
    includePreviewRows,
    togglePreviewRow,
    commitAppend,
    commitReplaceAll,
  };
}

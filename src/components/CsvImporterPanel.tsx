import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Modal,
  Paper,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  MantineReactTable,
  type MRT_ColumnDef,
  type MRT_PaginationState,
  type MRT_SortingState,
} from 'mantine-react-table';

import type {
  CategoryId,
  CompanyId,
  ImportPreviewRow,
  ProjectId,
  SubCategoryId,
  Txn,
} from '../types';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import type { BudgetsHook } from '../hooks/useBudgets';
import { formatCurrencyFromCents } from '../utils/money';
import { txnInputSchema } from '../validation/schemas';
import { useApi } from '../hooks/useApi';

export default function CsvImporterPanel(props: {
  taxonomy: TaxonomyHook;
  budgets: BudgetsHook;
  companyId: CompanyId;
  projectId: ProjectId;
  currencyCode: 'AUD' | 'USD' | 'EUR' | 'GBP';
  canEditTaxonomy: boolean;
  canEditBudgets: boolean;
  onAppend: (txns: Txn[], options?: { autoCreateBudgets?: boolean }) => Promise<void>;
  onReplaceAll: (txns: Txn[], options?: { autoCreateBudgets?: boolean }) => Promise<void>;
}) {
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

  const {
    taxonomy,
    budgets,
    companyId,
    projectId,
    currencyCode,
    canEditTaxonomy,
    canEditBudgets,
    onAppend,
    onReplaceAll,
  } = props;

  const isMobile = useMediaQuery('(max-width: 48em)');
  const api = useApi();

  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [draftCsvText, setDraftCsvText] = useState('');
  const [autoCreateStructures, setAutoCreateStructures] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [previewFilter, setPreviewFilter] = useState<
    'all' | 'exceptions' | 'invalid' | 'duplicate' | 'uncoded' | 'warnings'
  >('all');
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[] | null>(null);
  const [previewSourceLabel, setPreviewSourceLabel] = useState<string | null>(null);
  const [excludedImportIds, setExcludedImportIds] = useState<Set<string>>(new Set());
  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: isMobile ? 10 : 20,
  });
  const [sorting, setSorting] = useState<MRT_SortingState>([{ id: 'sourceRowIndex', desc: false }]);

  const previewActive = previewRows !== null;

  const exampleCsv = `date,description,amount,category,subcategory
2024-01-08,Taxi from airport to hotel,46.80,Transport,Rideshare
2024-01-08,Accommodation - Sydney,389.00,Travel,Accommodation
2024-01-09,Flight SYD to MEL,245.60,Travel,Flights
2024-01-09,Coffee with client,7.50,Meals,Client Meals
2024-01-10,USB-C adapter,29.95,Work Supplies,Electronics
2024-01-10,Snacks for team meeting,18.40,Meals,Team Catering
`;

  const includedPreviewRows = useMemo(
    () => (previewRows ?? []).filter((row) => !excludedImportIds.has(row.importId)),
    [excludedImportIds, previewRows]
  );

  const filteredPreviewRows = useMemo(
    () => {
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
    },
    [excludedImportIds, previewFilter, previewRows]
  );

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
        (row) => row.mappingStatus === 'invalid' || (!skipDuplicates && row.duplicate)
      ),
    [includedPreviewRows, skipDuplicates]
  );

  const hasReplaceAllBlockers = useMemo(
    () =>
      includedPreviewRows.some(
        (row) => row.mappingStatus === 'invalid' || row.duplicateReason === 'import'
      ),
    [includedPreviewRows]
  );

  const previewColumns = useMemo<MRT_ColumnDef<ImportPreviewRow>[]>(
    () => [
      {
        accessorKey: 'sourceRowIndex',
        header: 'Row',
        size: 72,
        mantineTableHeadCellProps: { className: 'table-head-cell table-head-left txnTable-head' },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        id: 'importedId',
        header: 'Imported ID',
        size: 140,
        accessorFn: (row) => row.externalId ?? '',
        Cell: ({ row }) => <Text className="table-body-left">{row.original.externalId ?? '—'}</Text>,
        mantineTableHeadCellProps: { className: 'table-head-cell table-head-left txnTable-head' },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'parsedDate',
        header: 'Date',
        size: 92,
        Cell: ({ row }) => <Text className="table-body-left">{row.original.parsedDate ?? 'Missing'}</Text>,
        mantineTableHeadCellProps: { className: 'table-head-cell table-head-left txnTable-head' },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'item',
        header: 'Item',
        size: 150,
        Cell: ({ row }) => <Text className="table-body-left">{row.original.item ?? 'Missing item'}</Text>,
        mantineTableHeadCellProps: { className: 'table-head-cell table-head-left txnTable-head' },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        accessorKey: 'description',
        header: 'Description',
        size: 220,
        Cell: ({ row }) => (
          <Text className="table-body-left">{row.original.description ?? 'Missing description'}</Text>
        ),
        mantineTableHeadCellProps: { className: 'table-head-cell table-head-left txnTable-head' },
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
        mantineTableHeadCellProps: { className: 'table-head-cell table-head-right txnTable-head' },
        mantineTableBodyCellProps: { className: 'table-body-right txnTable-cell' },
      },
      {
        id: 'mapping',
        header: 'Mapping',
        size: 220,
        accessorFn: (row) =>
          `${row.categoryName ?? ''} ${row.subCategoryName ?? ''} ${row.mappingStatus} ${row.duplicateReason ?? ''}`,
        enableSorting: false,
        Cell: ({ row }) => (
          <Stack gap={4}>
            <Group gap="xs" wrap="wrap">
              {excludedImportIds.has(row.original.importId) ? (
                <Badge size="sm" variant="light" color="gray">
                  Excluded
                </Badge>
              ) : null}
              <Badge
                size="sm"
                variant="light"
                color={
                  row.original.mappingStatus === 'invalid'
                    ? 'red'
                    : row.original.mappingStatus === 'uncoded'
                      ? 'red'
                      : row.original.mappingStatus === 'matched_rule'
                        ? 'green'
                        : row.original.mappingStatus === 'auto_created'
                          ? 'yellow'
                          : 'green'
                }
              >
                {row.original.mappingStatus === 'matched_rule'
                  ? 'Company rule match'
                  : row.original.mappingStatus === 'csv_taxonomy'
                    ? 'Category match'
                    : row.original.mappingStatus === 'auto_created'
                      ? 'Will auto-create'
                      : row.original.mappingStatus === 'invalid'
                        ? 'Invalid'
                        : 'Uncoded'}
              </Badge>
              {row.original.duplicate ? (
                <Badge size="sm" variant="light" color="orange">
                  {row.original.duplicateReason === 'existing'
                    ? 'Existing duplicate'
                    : 'Import duplicate'}
                </Badge>
              ) : null}
            </Group>
            {row.original.categoryName && row.original.subCategoryName ? (
              <Text size="xs" c="dimmed">
                {row.original.categoryName} &gt; {row.original.subCategoryName}
              </Text>
            ) : null}
          </Stack>
        ),
        mantineTableHeadCellProps: { className: 'table-head-cell table-head-left txnTable-head' },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        id: 'warnings',
        header: 'Warnings',
        size: 320,
        accessorFn: (row) => row.warnings.join(' '),
        enableSorting: false,
        Cell: ({ row }) =>
          row.original.warnings.length ? (
            <Stack gap={2}>
              {row.original.warnings.map((warning, index) => (
                <Text key={`${row.original.importId}-warning-${index}`} size="xs" c="dimmed">
                  {warning}
                </Text>
              ))}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              No warnings
            </Text>
          ),
        mantineTableHeadCellProps: { className: 'table-head-cell table-head-left txnTable-head' },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
      {
        id: 'action',
        header: 'Action',
        size: 100,
        enableSorting: false,
        Cell: ({ row }) => (
          <Button
            size="xs"
            variant={excludedImportIds.has(row.original.importId) ? 'light' : 'subtle'}
            color={excludedImportIds.has(row.original.importId) ? 'blue' : 'gray'}
            onClick={() => {
              setExcludedImportIds((current) => {
                const next = new Set(current);
                if (next.has(row.original.importId)) next.delete(row.original.importId);
                else next.add(row.original.importId);
                return next;
              });
            }}
          >
            {excludedImportIds.has(row.original.importId) ? 'Include' : 'Exclude'}
          </Button>
        ),
        mantineTableHeadCellProps: { className: 'table-head-cell table-head-left txnTable-head' },
        mantineTableBodyCellProps: { className: 'txnTable-cell' },
      },
    ],
    [currencyCode, excludedImportIds]
  );

  async function loadFileText(nextFile: File) {
    setIsReadingFile(true);
    try {
      const text = await nextFile.text();
      setFileText(text);
    } catch (error) {
      setFile(null);
      setFileText('');
      setImportError(error instanceof Error ? error.message : 'Could not read the CSV file.');
    } finally {
      setIsReadingFile(false);
    }
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

  async function handlePreviewImport() {
    try {
      setImportError(null);
      setImportNotice(null);

      const sourceText = file ? fileText : draftCsvText;
      const sourceLabel = file ? `Uploaded file: ${file.name}` : 'Pasted CSV';
      if (!sourceText.trim()) {
        throw new Error('Add a CSV file or paste CSV text before previewing the import.');
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
      setImportError(error instanceof Error ? error.message : 'Could not preview the import.');
    }
  }

  const ensureBudgetLinesForImportedSubCategories = (
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
      budgets.upsertBudgetForSubCategory(subId, catId);
    }
  };

  const buildImportPayloadFromPreview = async (
    mode: 'append' | 'replaceAll'
  ): Promise<{ txns: Txn[]; skipped: number }> => {
    const activeRows = (previewRows ?? []).filter(
      (row) =>
        !excludedImportIds.has(row.importId) &&
        row.mappingStatus !== 'invalid' &&
        (mode === 'replaceAll' || !skipDuplicates || !row.duplicate)
    );

    const categoryIdByName = new Map<string, CategoryId>(
      taxonomy.categories.map((category) => [category.name.trim().toLowerCase(), category.id])
    );
    const subCategoryIdByKey = new Map<string, SubCategoryId>(
      taxonomy.subCategories.map((subCategory) => {
        const categoryName = taxonomy.getCategoryName(subCategory.categoryId).trim().toLowerCase();
        return [`${categoryName}|||${subCategory.name.trim().toLowerCase()}`, subCategory.id];
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
      if (!row.willCreateSubCategory || !row.categoryName || !row.subCategoryName) continue;
      const categoryKey = row.categoryName.trim().toLowerCase();
      const categoryId = categoryIdByName.get(categoryKey);
      if (!categoryId) {
        throw new Error(
          `Could not resolve category "${row.categoryName}" for imported subcategory creation.`
        );
      }
      const subKey = `${categoryKey}|||${row.subCategoryName.trim().toLowerCase()}`;
      if (subCategoryIdByKey.has(subKey)) continue;
      const createdId = await taxonomy.addSubCategory(categoryId, row.subCategoryName);
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
        categoryId = categoryIdByName.get(row.categoryName.trim().toLowerCase()) ?? categoryId;
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

  return (
    <Stack gap="md">
      <Paper withBorder radius="lg" p="lg" className="importPanelCard">
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <Title order={5}>CSV import</Title>
            {previewActive ? (
              <Button variant="subtle" color="gray" onClick={resetImporter}>
                Clear preview
              </Button>
            ) : null}
          </Group>

          {importError ? <Alert color="red" variant="light">{importError}</Alert> : null}
          {importNotice ? <Alert color="green" variant="light">{importNotice}</Alert> : null}

          <Text size="sm" c="dimmed" className="panelHelperText">
            Upload a CSV file or paste CSV text, then preview the import before committing it.
            If a file is selected, the preview uses the uploaded file.
          </Text>

          <FileInput
            label="Upload CSV"
            placeholder="Select file"
            value={file}
            disabled={previewActive}
            accept=".csv,text/csv"
            onChange={(nextFile) => {
              setImportError(null);
              setImportNotice(null);
              setFile(nextFile);
              setFileText('');
              if (nextFile) {
                void loadFileText(nextFile);
              }
            }}
          />

          <Textarea
            label="Paste CSV"
            minRows={8}
            value={draftCsvText}
            disabled={previewActive}
            onChange={(event) => {
              setImportError(null);
              setImportNotice(null);
              setDraftCsvText(event.currentTarget.value);
            }}
            placeholder={exampleCsv}
          />

          <Group gap="md" align="center" wrap="wrap">
            <Switch
              label="Auto-create new categories/subcategories and budget lines"
              checked={autoCreateStructures}
              disabled={previewActive || !canEditTaxonomy || !canEditBudgets}
              onChange={(event) => setAutoCreateStructures(event.currentTarget.checked)}
              style={{ width: isMobile ? '100%' : 'auto' }}
            />
            <Switch
              label="Skip duplicates (existing and within this import)"
              checked={skipDuplicates}
              disabled={previewActive}
              onChange={(event) => setSkipDuplicates(event.currentTarget.checked)}
              style={{ width: isMobile ? '100%' : 'auto' }}
            />
          </Group>

          <Group justify="flex-end" wrap="wrap">
            <Button
              fullWidth={isMobile}
              onClick={() => void handlePreviewImport()}
              loading={isReadingFile}
              disabled={previewActive || isReadingFile || (!file && !draftCsvText.trim())}
            >
              Preview import
            </Button>
          </Group>
        </Stack>
      </Paper>

      {previewActive ? (
        <Stack gap="md">
          <Paper withBorder radius="lg" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center" wrap="wrap">
                <Group gap="sm" align="center" wrap="wrap">
                  <Title order={5}>Import preview</Title>
                  <Badge variant="light">{previewSummary.rows} rows</Badge>
                  <Badge variant="light" color={previewSummary.included ? 'blue' : 'gray'}>
                    {previewSummary.included} included
                  </Badge>
                  <Badge variant="light" color="gray">
                    {previewSummary.excluded} excluded
                  </Badge>
                  <Badge variant="light" color={previewSummary.invalid ? 'red' : 'gray'}>
                    {previewSummary.invalid} invalid
                  </Badge>
                  <Badge variant="light" color={previewSummary.duplicate ? 'orange' : 'gray'}>
                    {previewSummary.duplicate} duplicate
                  </Badge>
                  <Badge variant="light" color={previewSummary.uncoded ? 'yellow' : 'gray'}>
                    {previewSummary.uncoded} uncoded
                  </Badge>
                </Group>
              </Group>

              <Group gap="xs" wrap="wrap">
                <Button
                  size="xs"
                  variant={previewFilter === 'all' ? 'filled' : 'light'}
                  onClick={() => setPreviewFilter('all')}
                >
                  All ({previewFilterCounts.all})
                </Button>
                <Button
                  size="xs"
                  variant={previewFilter === 'exceptions' ? 'filled' : 'light'}
                  color="gray"
                  onClick={() => setPreviewFilter('exceptions')}
                >
                  Exceptions ({previewFilterCounts.exceptions})
                </Button>
                <Button
                  size="xs"
                  variant={previewFilter === 'invalid' ? 'filled' : 'light'}
                  color="red"
                  onClick={() => setPreviewFilter('invalid')}
                >
                  Invalid ({previewFilterCounts.invalid})
                </Button>
                <Button
                  size="xs"
                  variant={previewFilter === 'duplicate' ? 'filled' : 'light'}
                  color="orange"
                  onClick={() => setPreviewFilter('duplicate')}
                >
                  Duplicate ({previewFilterCounts.duplicate})
                </Button>
                <Button
                  size="xs"
                  variant={previewFilter === 'uncoded' ? 'filled' : 'light'}
                  color="yellow"
                  onClick={() => setPreviewFilter('uncoded')}
                >
                  Uncoded ({previewFilterCounts.uncoded})
                </Button>
                <Button
                  size="xs"
                  variant={previewFilter === 'warnings' ? 'filled' : 'light'}
                  color="blue"
                  onClick={() => setPreviewFilter('warnings')}
                >
                  Warnings ({previewFilterCounts.warnings})
                </Button>
              </Group>

              <Group justify="space-between" align="center" wrap="wrap">
                <Text size="sm" c="dimmed">
                  {filteredPreviewRows.length
                    ? `Current filter shows ${filteredPreviewRows.length} rows: ${filteredIncludedCount} included, ${filteredExcludedCount} excluded.`
                    : 'Current filter shows no rows.'}
                </Text>
                <Group gap="xs" wrap="wrap">
                  <Button
                    size="xs"
                    variant="light"
                    color="gray"
                    disabled={!filteredPreviewRows.length || filteredIncludedCount === 0}
                    onClick={() =>
                      setExcludedImportIds((current) => {
                        const next = new Set(current);
                        for (const importId of filteredPreviewIds) next.add(importId);
                        return next;
                      })
                    }
                  >
                    Exclude filtered
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="blue"
                    disabled={!filteredPreviewRows.length || filteredExcludedCount === 0}
                    onClick={() =>
                      setExcludedImportIds((current) => {
                        const next = new Set(current);
                        for (const importId of filteredPreviewIds) next.delete(importId);
                        return next;
                      })
                    }
                  >
                    Include filtered
                  </Button>
                </Group>
              </Group>

              {previewSourceLabel ? (
                <Text size="sm" c="dimmed">
                  Preview source: {previewSourceLabel}
                </Text>
              ) : null}

              {hasBlockingIssues ? (
                <Alert color="red" variant="light">
                  Invalid rows or duplicate handling settings will block append until those rows are
                  excluded or corrected.
                </Alert>
              ) : null}

              {!hasBlockingIssues && skipDuplicates && previewSummary.duplicate > 0 ? (
                <Alert color="blue" variant="light">
                  Duplicate rows will be skipped automatically during append unless you explicitly
                  include them by turning off duplicate skipping first.
                </Alert>
              ) : null}

              {!hasBlockingIssues && hasReplaceAllBlockers ? (
                <Alert color="red" variant="light">
                  Duplicate rows inside the import file will block replace all until they are
                  excluded.
                </Alert>
              ) : null}

              {!previewSummary.included ? (
                <Alert color="yellow" variant="light">
                  All preview rows are currently excluded from import.
                </Alert>
              ) : null}
            </Stack>
          </Paper>

          <MantineReactTable
            columns={previewColumns}
            data={filteredPreviewRows}
            getRowId={(row) => row.importId}
            state={{ pagination, sorting }}
            onPaginationChange={setPagination}
            onSortingChange={setSorting}
            enableColumnResizing
            enableSorting
            enableSortingRemoval={false}
            enableGlobalFilter
            enablePagination
            autoResetPageIndex={false}
            initialState={{ density: 'xs' }}
            mantineTableContainerProps={{ className: 'financeTable txnTable' }}
            mantineTableProps={{
              highlightOnHover: true,
              striped: 'odd',
              withTableBorder: true,
              style: { tableLayout: 'auto' },
            }}
            enableDensityToggle={false}
            enableFullScreenToggle={false}
            mantineTableBodyRowProps={({ row }) =>
              excludedImportIds.has(row.original.importId)
                ? { style: { opacity: 0.6 } }
                : row.original.mappingStatus === 'invalid'
                  ? { style: { outline: '1px solid rgba(255,0,0,0.20)' } }
                  : {}
            }
          />

          <Paper withBorder radius="lg" p="md">
            <Group justify="space-between" align="center" wrap="wrap">
              <Text size="sm" c="dimmed">
                Review the preview, exclude anything that should stay out of the tracker, then
                commit the included rows.
              </Text>
              <Group wrap="wrap">
                <Button variant="subtle" color="gray" onClick={resetImporter}>
                  Clear preview
                </Button>
                <Button
                  fullWidth={isMobile}
                  disabled={!previewSummary.included || hasBlockingIssues}
                  onClick={async () => {
                    try {
                      setImportError(null);
                      setImportNotice(null);
                      const { txns, skipped } = await buildImportPayloadFromPreview('append');
                      ensureBudgetLinesForImportedSubCategories(txns);
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
                  }}
                >
                  Append
                </Button>
                <Button
                  color="red"
                  fullWidth={isMobile}
                  disabled={!previewSummary.included || hasReplaceAllBlockers}
                  onClick={() => setConfirmReplaceOpen(true)}
                >
                  Replace all
                </Button>
              </Group>
            </Group>
          </Paper>
        </Stack>
      ) : null}

      {!previewActive ? (
        <Paper withBorder radius="lg" p="lg" className="importPanelCard importExampleCard">
          <Stack gap="sm">
            <Text fw={700}>Example CSV</Text>
            <pre className="importExamplePre">{exampleCsv}</pre>
          </Stack>
        </Paper>
      ) : null}

      <Modal
        opened={confirmReplaceOpen}
        onClose={() => setConfirmReplaceOpen(false)}
        title="Replace all transactions?"
        fullScreen={isMobile}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed" className="panelHelperText">
            This will replace all existing transactions in this project with the currently included
            preview rows. This cannot be undone.
          </Text>
          <Group justify="flex-end" wrap="wrap">
            <Button variant="light" fullWidth={isMobile} onClick={() => setConfirmReplaceOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              fullWidth={isMobile}
              onClick={async () => {
                try {
                  setImportError(null);
                  setImportNotice(null);
                  const { txns } = await buildImportPayloadFromPreview('replaceAll');
                  ensureBudgetLinesForImportedSubCategories(txns);
                  await onReplaceAll(txns, { autoCreateBudgets: autoCreateStructures });
                  const importedCount = txns.length;
                  setConfirmReplaceOpen(false);
                  resetImporter();
                  setImportNotice(`Replaced transactions with ${importedCount} imported rows.`);
                } catch (error) {
                  setImportNotice(null);
                  setImportError(
                    error instanceof Error
                      ? error.message
                      : 'Could not replace imported transactions.'
                  );
                }
              }}
            >
              Replace all
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

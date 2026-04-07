import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  FileInput,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { CategoryId, CompanyId, ImportPreviewRow, ImportTxnWithTaxonomy, ProjectId, SubCategoryId, Txn } from '../types';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import type { BudgetsHook } from '../hooks/useBudgets';
import { parseCsv, rowsToImportTxns } from '../utils/csv';
import { buildImportPreview } from '../utils/importPreview';
import { formatCurrencyFromCents } from '../utils/money';
import { txnInputSchema } from '../validation/schemas';
import {
  useCompanyDefaultCategoriesQuery,
  useCompanyDefaultMappingRulesQuery,
  useCompanyDefaultSubCategoriesQuery,
} from '../queries/taxonomy';

/**
 * CSV Import panel.
 *
 * UI-only component:
 * - Handles file/paste input and user options.
 * - Delegates parsing + normalization to csv utilities.
 *
 * Notes:
 * - You can paste CSV text OR upload a .csv file.
 * - Imported rows are appended or replace all.
 * - Optional: auto-create missing categories/subcategories.
 */
export default function CsvImporterPanel(props: {
  taxonomy: TaxonomyHook;
  budgets: BudgetsHook;
  existingTxns: Txn[];
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
    existingTxns,
    companyId,
    projectId,
    currencyCode,
    canEditTaxonomy,
    canEditBudgets,
    onAppend,
    onReplaceAll,
  } = props;

  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState('');
  const [autoCreate, setAutoCreate] = useState(true);
  const [autoCreateBudgets, setAutoCreateBudgets] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [showExceptionsOnly, setShowExceptionsOnly] = useState(true);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [excludedImportIds, setExcludedImportIds] = useState<Set<string>>(new Set());
  const isMobile = useMediaQuery('(max-width: 48em)');
  const defaultCategoriesQ = useCompanyDefaultCategoriesQuery(companyId);
  const defaultSubCategoriesQ = useCompanyDefaultSubCategoriesQuery(companyId);
  const mappingRulesQ = useCompanyDefaultMappingRulesQuery(companyId);

  const existingKeys = useMemo(
    () =>
      new Set(
        existingTxns.map((t) =>
          t.externalId?.trim() ? `external:${t.externalId.trim()}` : `id:${t.id}`
        )
      ),
    [existingTxns]
  );

  const exampleCsv = `date,description,amount,category,subcategory
2024-01-08,Taxi from airport to hotel,46.80,Transport,Rideshare
2024-01-08,Accommodation - Sydney,389.00,Travel,Accommodation
2024-01-09,Flight SYD to MEL,245.60,Travel,Flights
2024-01-09,Coffee with client,7.50,Meals,Client Meals
2024-01-10,USB-C adapter,29.95,Work Supplies,Electronics
2024-01-10,Snacks for team meeting,18.40,Meals,Team Catering
`;

  async function loadFileText(f: File) {
    const text = await f.text();
    setExcludedImportIds(new Set());
    setCsvText(text);
  }

  /**
   * Option A:
   * Invalid CSV → empty array.
   * No setState inside useMemo.
   */
  const importTxns = useMemo<ImportTxnWithTaxonomy[]>(() => {
    try {
      const rows = parseCsv(csvText);
      return rowsToImportTxns(rows);
    } catch {
      return [];
    }
  }, [csvText]);

  const previewCount = importTxns.length;
  const previewRows = useMemo<ImportPreviewRow[]>(
    () =>
      buildImportPreview({
        importTxns,
        existingKeys,
        categories: taxonomy.categories,
        subCategories: taxonomy.subCategories,
        budgets: budgets.budgets,
        defaultCategories: defaultCategoriesQ.data ?? [],
        defaultSubCategories: defaultSubCategoriesQ.data ?? [],
        mappingRules: mappingRulesQ.data ?? [],
        autoCreateTaxonomy: autoCreate,
        canEditTaxonomy,
        autoCreateBudgets,
        canEditBudgets,
      }),
    [
      autoCreate,
      autoCreateBudgets,
      budgets.budgets,
      canEditBudgets,
      canEditTaxonomy,
      defaultCategoriesQ.data,
      defaultSubCategoriesQ.data,
      existingKeys,
      importTxns,
      mappingRulesQ.data,
      taxonomy.categories,
      taxonomy.subCategories,
    ]
  );
  const filteredPreviewRows = useMemo(
    () =>
      showExceptionsOnly
        ? previewRows.filter(
            (row) =>
              !excludedImportIds.has(row.importId) &&
              row.duplicate ||
              (!excludedImportIds.has(row.importId) &&
                (row.mappingStatus === 'invalid' ||
                  row.mappingStatus === 'uncoded' ||
                  row.warnings.length > 0))
          )
        : previewRows,
    [excludedImportIds, previewRows, showExceptionsOnly]
  );
  const includedPreviewRows = useMemo(
    () => previewRows.filter((row) => !excludedImportIds.has(row.importId)),
    [excludedImportIds, previewRows]
  );
  const previewSummary = useMemo(() => {
    const counts = {
      totalRows: previewRows.length,
      includedRows: 0,
      excludedRows: 0,
      validRows: 0,
      duplicateRows: 0,
      uncodedRows: 0,
      invalidRows: 0,
      matchedRuleRows: 0,
      autoCreatedRows: 0,
      rowsWithWarnings: 0,
      budgetLinesToCreate: 0,
      categoriesToCreate: 0,
      subCategoriesToCreate: 0,
    };
    const categoryCreateKeys = new Set<string>();
    const subCategoryCreateKeys = new Set<string>();
    const budgetCreateKeys = new Set<string>();

    for (const row of previewRows) {
      if (excludedImportIds.has(row.importId)) {
        counts.excludedRows += 1;
        continue;
      }
      counts.includedRows += 1;
      if (row.mappingStatus !== 'invalid') counts.validRows += 1;
      if (row.duplicate) counts.duplicateRows += 1;
      if (row.mappingStatus === 'uncoded') counts.uncodedRows += 1;
      if (row.mappingStatus === 'invalid') counts.invalidRows += 1;
      if (row.mappingStatus === 'matched_rule') counts.matchedRuleRows += 1;
      if (row.mappingStatus === 'auto_created') counts.autoCreatedRows += 1;
      if (row.warnings.length > 0) counts.rowsWithWarnings += 1;
      if (row.willCreateCategory && row.categoryName) categoryCreateKeys.add(row.categoryName.toLowerCase());
      if (row.willCreateSubCategory && row.categoryName && row.subCategoryName) {
        subCategoryCreateKeys.add(`${row.categoryName.toLowerCase()}|||${row.subCategoryName.toLowerCase()}`);
      }
      if (row.willCreateBudgetLine && row.categoryName && row.subCategoryName) {
        budgetCreateKeys.add(`${row.categoryName.toLowerCase()}|||${row.subCategoryName.toLowerCase()}`);
      }
    }

    counts.categoriesToCreate = categoryCreateKeys.size;
    counts.subCategoriesToCreate = subCategoryCreateKeys.size;
    counts.budgetLinesToCreate = budgetCreateKeys.size;

    return counts;
  }, [excludedImportIds, previewRows]);

  const hasBlockingIssues = useMemo(
    () =>
      includedPreviewRows.some(
        (row) =>
          row.mappingStatus === 'invalid' || (!skipDuplicates && row.duplicate)
      ),
    [includedPreviewRows, skipDuplicates]
  );

  const ensureBudgetLinesForImportedSubCategories = (
    next: Array<{ categoryId?: CategoryId; subCategoryId?: SubCategoryId }>
  ) => {
    if (!autoCreateBudgets || !canEditBudgets) return;

    // Avoid duplicate creates within a single import even if query state hasn't refreshed yet.
    const existing = new Set(
      budgets.budgets
        .map((b) => b.subCategoryId)
        .filter((id): id is SubCategoryId => Boolean(id))
    );
    const createdThisRun = new Set<SubCategoryId>();

    for (const t of next) {
      const subId = t.subCategoryId;
      const catId = t.categoryId;
      if (!subId || !catId) continue;
      if (existing.has(subId) || createdThisRun.has(subId)) continue;
      createdThisRun.add(subId);
      budgets.upsertBudgetForSubCategory(subId, catId);
    }
  };

  const buildImportPayloadFromPreview = async (
    mode: 'append' | 'replaceAll'
  ): Promise<{ txns: Txn[]; skipped: number }> => {
    const activeRows = previewRows.filter(
      (row) =>
        !excludedImportIds.has(row.importId) &&
        row.mappingStatus !== 'invalid' &&
        (mode === 'replaceAll' || !skipDuplicates || row.duplicateReason !== 'existing')
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
        throw new Error(`Could not resolve category "${row.categoryName}" for imported subcategory creation.`);
      }
      const subKey = `${categoryKey}|||${row.subCategoryName.trim().toLowerCase()}`;
      if (subCategoryIdByKey.has(subKey)) continue;
      const createdId = await taxonomy.addSubCategory(categoryId, row.subCategoryName);
      subCategoryIdByKey.set(subKey, createdId);
    }

    const txns: Txn[] = [];
    let skipped = 0;
    for (const row of previewRows) {
      if (excludedImportIds.has(row.importId)) continue;
      if (row.mappingStatus === 'invalid') continue;
      if (mode === 'append' && skipDuplicates && row.duplicateReason === 'existing') {
        skipped += 1;
        continue;
      }

      let categoryId = row.categoryId;
      let subCategoryId = row.subCategoryId;
      if (row.categoryName) {
        categoryId = categoryIdByName.get(row.categoryName.trim().toLowerCase()) ?? categoryId;
      }
      if (row.categoryName && row.subCategoryName) {
        const subKey = `${row.categoryName.trim().toLowerCase()}|||${row.subCategoryName.trim().toLowerCase()}`;
        subCategoryId = subCategoryIdByKey.get(subKey) ?? subCategoryId;
      }

      const next: Txn = {
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
      };
      txns.push(next);
    }

    validateImportedRows(txns);
    return { txns, skipped };
  };

  const toggleExcluded = (importId: string) => {
    setExcludedImportIds((current) => {
      const next = new Set(current);
      if (next.has(importId)) next.delete(importId);
      else next.add(importId);
      return next;
    });
  };

  return (
    <Stack gap="md">
      <Paper withBorder radius="lg" p="lg" className="importPanelCard">
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <Text fw={700}>CSV import</Text>
            <Badge variant="light">{previewCount} rows parsed</Badge>
          </Group>
          {importError ? <Text size="sm" c="red">{importError}</Text> : null}
          <Text size="sm" c="dimmed" className="panelHelperText">
            Supports headers: date, item, description, amount, and optional category/subcategory. If item is missing, description is used.
          </Text>

          <Group align="flex-end" wrap="wrap">
            <FileInput
              label="Upload CSV"
              placeholder="Select file"
              value={file}
              onChange={(f) => {
                setFile(f);
                setExcludedImportIds(new Set());
                if (f) void loadFileText(f);
                if (!f) setCsvText('');
              }}
              accept=".csv,text/csv"
              style={{ width: '100%' }}
            />
          </Group>

          <Group gap="md" align="center" wrap="wrap">
            <Switch
              label="Auto-create missing categories/subcategories"
              checked={autoCreate}
              disabled={!canEditTaxonomy}
              onChange={(e) => setAutoCreate(e.currentTarget.checked)}
              style={{ width: isMobile ? '100%' : 'auto' }}
            />

            <Switch
              label="Auto-create budget lines for imported subcategories (allocated = 0)"
              checked={autoCreateBudgets}
              disabled={!canEditBudgets}
              onChange={(e) => setAutoCreateBudgets(e.currentTarget.checked)}
              style={{ width: isMobile ? '100%' : 'auto' }}
            />

            <Switch
              label="Skip duplicates (external ID / stable key)"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.currentTarget.checked)}
              style={{ width: isMobile ? '100%' : 'auto' }}
            />
          </Group>
          <Divider />

          <Textarea
            label="Or paste CSV"
            minRows={8}
            value={csvText}
            onChange={(e) => {
              setExcludedImportIds(new Set());
              setCsvText(e.currentTarget.value);
            }}
            placeholder={exampleCsv}
          />

          <Group justify="space-between" wrap="wrap">
            <Text size="sm" c="dimmed">Preview rows: {previewCount}</Text>

            <Group wrap="wrap">
              <Button
                fullWidth={isMobile}
                disabled={!previewSummary.includedRows || hasBlockingIssues}
                onClick={async () => {
                  try {
                    setImportError(null);
                    const { txns, skipped } = await buildImportPayloadFromPreview('append');

                    ensureBudgetLinesForImportedSubCategories(txns);
                    await onAppend(
                      txns,
                      { autoCreateBudgets }
                    );

                    setImportNotice(
                      skipped > 0
                        ? `Imported ${txns.length} rows. Skipped ${skipped} duplicate(s).`
                        : `Imported ${txns.length} rows.`
                    );
                  } catch (err) {
                    setImportNotice(null);
                    setImportError(err instanceof Error ? err.message : 'Could not append imported transactions.');
                  }
                }}
              >
                Append
              </Button>

              <Button
                color="red"
                fullWidth={isMobile}
                disabled={
                  !previewSummary.includedRows ||
                  includedPreviewRows.some(
                    (row) => row.mappingStatus === 'invalid' || row.duplicateReason === 'import'
                  )
                }
                onClick={async () => {
                  setConfirmReplaceOpen(true);
                }}
              >
                Replace all
              </Button>
            </Group>
          </Group>
        </Stack>
      </Paper>

      {previewCount ? (
        <Paper withBorder radius="lg" p="lg" className="importPanelCard">
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="wrap">
              <Text fw={700}>Import preview</Text>
              <Group gap="xs" wrap="wrap">
                <Badge variant="light">{previewSummary.totalRows} rows</Badge>
                <Badge color={previewSummary.includedRows ? 'blue' : 'gray'} variant="light">
                  {previewSummary.includedRows} included
                </Badge>
                <Badge color={previewSummary.excludedRows ? 'gray' : 'gray'} variant="light">
                  {previewSummary.excludedRows} excluded
                </Badge>
                <Badge color={previewSummary.invalidRows ? 'red' : 'gray'} variant="light">
                  {previewSummary.invalidRows} invalid
                </Badge>
                <Badge color={previewSummary.duplicateRows ? 'orange' : 'gray'} variant="light">
                  {previewSummary.duplicateRows} duplicate
                </Badge>
                <Badge color={previewSummary.uncodedRows ? 'yellow' : 'gray'} variant="light">
                  {previewSummary.uncodedRows} uncoded
                </Badge>
              </Group>
            </Group>

            {(defaultCategoriesQ.isLoading || defaultSubCategoriesQ.isLoading || mappingRulesQ.isLoading) ? (
              <Alert color="blue" variant="light">
                Loading company default mapping rules for a more accurate preview.
              </Alert>
            ) : null}

            {hasBlockingIssues ? (
              <Alert color="red" variant="light">
                Invalid rows or duplicate handling settings will block import. Fix the rows or re-enable
                duplicate skipping before appending.
              </Alert>
            ) : null}
            {!hasBlockingIssues && includedPreviewRows.some((row) => row.duplicateReason === 'import') ? (
              <Alert color="red" variant="light">
                Duplicate rows inside the import file will block replace-all until they are removed.
              </Alert>
            ) : null}
            {!previewSummary.includedRows ? (
              <Alert color="yellow" variant="light">
                All rows are currently excluded from import.
              </Alert>
            ) : null}

            <Group gap="sm" wrap="wrap">
              <Badge variant="light">Valid: {previewSummary.validRows}</Badge>
              <Badge variant="light">Warnings: {previewSummary.rowsWithWarnings}</Badge>
              <Badge variant="light">Rule matched: {previewSummary.matchedRuleRows}</Badge>
              <Badge variant="light">Taxonomy to create: {previewSummary.categoriesToCreate} categories</Badge>
              <Badge variant="light">
                Taxonomy to create: {previewSummary.subCategoriesToCreate} subcategories
              </Badge>
              <Badge variant="light">Budget lines to create: {previewSummary.budgetLinesToCreate}</Badge>
            </Group>

            <Switch
              label="Show exceptions only"
              checked={showExceptionsOnly}
              onChange={(e) => setShowExceptionsOnly(e.currentTarget.checked)}
            />

            <ScrollArea>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Row</Table.Th>
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Details</Table.Th>
                      <Table.Th>Amount</Table.Th>
                      <Table.Th>Mapping</Table.Th>
                      <Table.Th>Action</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                  {filteredPreviewRows.length ? (
                    filteredPreviewRows.map((row) => (
                      <Table.Tr key={row.sourceRowIndex}>
                        <Table.Td>{row.sourceRowIndex}</Table.Td>
                        <Table.Td>{row.parsedDate ?? 'Missing'}</Table.Td>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm" fw={500}>
                              {row.item ?? 'Missing item'}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {row.description ?? 'Missing description'}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>{row.amountCents == null ? 'Missing' : formatCurrencyFromCents(row.amountCents, currencyCode)}</Table.Td>
                        <Table.Td>
                          <Stack gap={4}>
                            <Group gap={6} wrap="wrap">
                              {excludedImportIds.has(row.importId) ? (
                                <Badge size="sm" variant="light" color="gray">
                                  Excluded
                                </Badge>
                              ) : null}
                              <Badge
                                size="sm"
                                variant="light"
                                color={
                                  row.mappingStatus === 'invalid'
                                    ? 'red'
                                    : row.mappingStatus === 'uncoded'
                                      ? 'yellow'
                                      : row.mappingStatus === 'matched_rule'
                                        ? 'blue'
                                        : row.mappingStatus === 'auto_created'
                                          ? 'teal'
                                          : 'green'
                                }
                              >
                                {row.mappingStatus === 'matched_rule'
                                  ? 'Matched rule'
                                  : row.mappingStatus === 'csv_taxonomy'
                                    ? 'Category match'
                                    : row.mappingStatus === 'auto_created'
                                      ? 'Will auto-create'
                                      : row.mappingStatus === 'invalid'
                                        ? 'Invalid'
                                        : 'Uncoded'}
                              </Badge>
                              {row.duplicate ? (
                                <Badge size="sm" variant="light" color="orange">
                                  {row.duplicateReason === 'existing' ? 'Existing duplicate' : 'Import duplicate'}
                                </Badge>
                              ) : null}
                              {row.codingPendingApproval ? (
                                <Badge size="sm" variant="light" color="blue">
                                  Auto-coded pending
                                </Badge>
                              ) : null}
                            </Group>
                            <Text size="xs" c="dimmed">
                              {row.categoryName && row.subCategoryName
                                ? `${row.categoryName} > ${row.subCategoryName}`
                                : 'No resolved category/subcategory'}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant={excludedImportIds.has(row.importId) ? 'light' : 'subtle'}
                            color={excludedImportIds.has(row.importId) ? 'blue' : 'gray'}
                            onClick={() => toggleExcluded(row.importId)}
                          >
                            {excludedImportIds.has(row.importId) ? 'Include' : 'Exclude'}
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text size="sm" c="dimmed">
                          No rows match the current preview filter.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Paper>
      ) : null}

      <Paper withBorder radius="lg" p="lg" className="importPanelCard importExampleCard">
        <Stack gap="sm">
          <Text fw={700}>Example CSV</Text>
          <pre className="importExamplePre">{exampleCsv}</pre>
        </Stack>
      </Paper>

      <Modal
        opened={confirmReplaceOpen}
        onClose={() => setConfirmReplaceOpen(false)}
        title="Replace all transactions?"
        fullScreen={isMobile}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed" className="panelHelperText">
            This will replace all existing transactions in this project with imported rows. This cannot be undone.
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
                  const { txns } = await buildImportPayloadFromPreview('replaceAll');

                  ensureBudgetLinesForImportedSubCategories(txns);
                  await onReplaceAll(
                    txns,
                    { autoCreateBudgets }
                  );
                  setConfirmReplaceOpen(false);
                  setImportNotice(`Replaced transactions with ${txns.length} imported rows.`);
                } catch (err) {
                  setImportNotice(null);
                  setImportError(err instanceof Error ? err.message : 'Could not replace imported transactions.');
                }
              }}
            >
              Replace all
            </Button>
          </Group>
        </Stack>
      </Modal>

      {importNotice ? (
        <Paper withBorder radius="md" p="sm" className="importNoticeCard">
          <Text size="sm">{importNotice}</Text>
        </Paper>
      ) : null}
    </Stack>
  );
}

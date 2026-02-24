import { useMemo, useState } from 'react';
import {
  Button,
  FileInput,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mantine/core';
import type {
  CategoryId,
  CompanyId,
  ImportTxnWithTaxonomy,
  ProjectId,
  SubCategoryId,
  Txn,
} from '../types';
import type { TaxonomyHook } from '../hooks/useTaxonomy';
import type { BudgetsHook } from '../hooks/useBudgets';
import { parseCsv, rowsToImportTxns, finalizeImportTxns } from '../utils/csv';

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
  canEditTaxonomy: boolean;
  canEditBudgets: boolean;
  onAppend: (txns: Txn[]) => void;
  onReplaceAll: (txns: Txn[]) => void;
}) {
  const {
    taxonomy,
    budgets,
    existingTxns,
    companyId,
    projectId,
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

  const existingIds = useMemo(
    () => new Set(existingTxns.map((t) => t.id)),
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

  /**
   * Apply taxonomy mapping and optional auto-creation.
   * Normalizes all IDs to branded types.
   */
  const applyMapping = (): ImportTxnWithTaxonomy[] => {
    type CategoryLookup = { id: CategoryId; name: string };
    type SubCategoryLookup = {
      id: SubCategoryId;
      categoryId: CategoryId;
      name: string;
    };

    // Build fast lookups from the current taxonomy snapshot.
    // Important: during CSV import we may optimistically "create" categories/subcategories
    // before queries refetch, so we must not rely on taxonomy.getCategoryName() here.
    const catByName = new Map<string, CategoryLookup>(
      taxonomy.categories.map((c) => [
        c.name.trim().toLowerCase(),
        { id: c.id, name: c.name },
      ])
    );

    const catNameById = new Map<CategoryId, string>(
      taxonomy.categories.map((c) => [c.id, c.name])
    );

    const subByKey = new Map<string, SubCategoryLookup>(
      taxonomy.subCategories.map((s) => {
        const catName = (catNameById.get(s.categoryId) ?? '').trim().toLowerCase();
        const key = `${catName}|||${s.name.trim().toLowerCase()}`;
        return [key, { id: s.id, categoryId: s.categoryId, name: s.name }];
      })
    );

    return importTxns.map((t) => {
      const catName = String(t.category ?? '').trim();
      const subName = String(t.subcategory ?? '').trim();

      let categoryId: CategoryId | undefined;
      let subCategoryId: SubCategoryId | undefined;

      if (catName) {
        const cKey = catName.toLowerCase();
        const existing = catByName.get(cKey);

        if (existing) {
          categoryId = existing.id;
        } else if (autoCreate) {
          const created = taxonomy.addCategory(catName);
          if (created) {
            categoryId = created;
            catByName.set(cKey, { id: created, name: catName });
            catNameById.set(created, catName);
          }
        }
      }

      if (categoryId && subName) {
        const catNameResolved = (catNameById.get(categoryId) ?? catName).trim();
        const key = `${catNameResolved.toLowerCase()}|||${subName.toLowerCase()}`;
        const existing = subByKey.get(key);

        if (existing) {
          subCategoryId = existing.id;
        } else if (autoCreate) {
          const created = taxonomy.addSubCategory(categoryId, subName);
          if (created) {
            subCategoryId = created;
            subByKey.set(key, { id: created, categoryId, name: subName });
          }
        }
      }

      const id = typeof t.id === 'string' ? t.id : String(t.id ?? '').trim();

      return {
        id,
        date: t.date,
        item: t.item,
        description: t.description,
        amount: t.amount,
        categoryId,
        subCategoryId,
      };
    });
  };;

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text fw={600}>CSV Import</Text>
          <Text size="sm" c="dimmed">
            Supports headers: date,item,description,amount,(optional) category,
            subcategory
          </Text>

          <Group align="flex-end">
            <FileInput
              label="Upload CSV"
              placeholder="Select file"
              value={file}
              onChange={(f) => {
                setFile(f);
                if (f) void loadFileText(f);
              }}
              accept=".csv,text/csv"
              style={{ flex: 1 }}
            />

            <Switch
              label="Auto-create missing categories/subcategories"
              checked={autoCreate}
              disabled={!canEditTaxonomy}
              onChange={(e) => setAutoCreate(e.currentTarget.checked)}
            />

            <Switch
              label="Auto-create budget lines for imported subcategories (allocated = 0)"
              checked={autoCreateBudgets}
              disabled={!canEditBudgets}
              onChange={(e) => setAutoCreateBudgets(e.currentTarget.checked)}
            />

            <Switch
              label="Skip duplicates (stable IDs)"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.currentTarget.checked)}
            />
          </Group>

          <Textarea
            label="Or paste CSV"
            minRows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.currentTarget.value)}
            placeholder={exampleCsv}
          />

          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Preview rows: {previewCount}
            </Text>

            <Group>
              <Button
                disabled={!importTxns.length}
                onClick={() => {
                  const mapped = applyMapping();
                  const { txns, skipped } = finalizeImportTxns(mapped, {
                    existingIds,
                    skipDuplicates,
                  });

                  ensureBudgetLinesForImportedSubCategories(txns);

                  onAppend(txns.map((t) => ({ ...t, companyId, projectId })));

                  if (skipped > 0) {
                    alert(`Skipped ${skipped} duplicate(s).`);
                  }
                }}
              >
                Append
              </Button>

              <Button
                color="red"
                disabled={!importTxns.length}
                onClick={() => {
                  if (!confirm('Replace ALL transactions with imported CSV?')) {
                    return;
                  }

                  const mapped = applyMapping();
                  const { txns } = finalizeImportTxns(mapped, {
                    skipDuplicates: false,
                  });

                  ensureBudgetLinesForImportedSubCategories(txns);

                  onReplaceAll(
                    txns.map((t) => ({ ...t, companyId, projectId }))
                  );
                }}
              >
                Replace all
              </Button>
            </Group>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Text fw={600}>Example CSV</Text>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{exampleCsv}</pre>
      </Paper>
    </Stack>
  );
}

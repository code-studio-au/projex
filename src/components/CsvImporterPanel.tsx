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
  existingTxns: Txn[];
  companyId: CompanyId;
  projectId: ProjectId;
  canEditTaxonomy: boolean;
  onAppend: (txns: Txn[]) => void;
  onReplaceAll: (txns: Txn[]) => void;
}) {
  const {
    taxonomy,
    existingTxns,
    companyId,
    projectId,
    canEditTaxonomy,
    onAppend,
    onReplaceAll,
  } = props;

  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState('');
  const [autoCreate, setAutoCreate] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const existingIds = useMemo(
    () => new Set(existingTxns.map((t) => t.id)),
    [existingTxns]
  );

  const exampleCsv = `id,date,item,description,amount,category,subcategory
EXP-1002345,2024-01-08,Uber,Taxi from airport to hotel,-46.80,Transport,Rideshare
EXP-1002346,2024-01-08,Hyatt Regency,Accommodation - Sydney,-389.00,Travel,Accommodation
EXP-1002347,2024-01-09,Qantas Airways,Flight SYD to MEL,-245.60,Travel,Flights
EXP-1002348,2024-01-09,Starbucks,Coffee with client,-7.50,Meals,Client Meals
EXP-1002349,2024-01-10,Officeworks,USB-C adapter,-29.95,Work Supplies,Electronics
EXP-1002350,2024-01-10,Coles,Snacks for team meeting,-18.40,Meals,Team Catering
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

    const catByName = new Map<string, CategoryLookup>(
      taxonomy.categories.map((c) => [
        c.name.trim().toLowerCase(),
        { id: c.id, name: c.name },
      ])
    );

    const subByKey = new Map<string, SubCategoryLookup>(
      taxonomy.subCategories.map((s) => {
        const cat = taxonomy.categories.find((c) => c.id === s.categoryId);
        const key = `${(cat?.name ?? '').trim().toLowerCase()}|||${s.name
          .trim()
          .toLowerCase()}`;

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
          }
        }
      }

      if (categoryId && subName) {
        const catNameResolved = taxonomy.getCategoryName(categoryId);
        const key = `${catNameResolved.trim().toLowerCase()}|||${subName.toLowerCase()}`;
        const existing = subByKey.get(key);

        if (existing) {
          subCategoryId = existing.id;
        } else if (autoCreate) {
          const created = taxonomy.addSubCategory(categoryId, subName);
          if (created) {
            subCategoryId = created;
            subByKey.set(key, {
              id: created,
              categoryId,
              name: subName,
            });
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
  };

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

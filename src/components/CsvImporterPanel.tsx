import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Divider,
  FileInput,
  Group,
  Modal,
  Paper,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
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
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const isMobile = useMediaQuery('(max-width: 48em)');

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
  const applyMapping = async (): Promise<ImportTxnWithTaxonomy[]> => {
    type CategoryLookup = { id: CategoryId; name: string };
    type SubCategoryLookup = {
      id: SubCategoryId;
      categoryId: CategoryId;
      name: string;
    };

    // Build fast lookups from the current taxonomy snapshot.
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

    const out: ImportTxnWithTaxonomy[] = [];

    for (const t of importTxns) {
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
          const created = await taxonomy.addCategory(catName);
          categoryId = created;
          catByName.set(cKey, { id: created, name: catName });
          catNameById.set(created, catName);
        }
      }

      if (categoryId && subName) {
        const catNameResolved = (catNameById.get(categoryId) ?? catName).trim();
        const key = `${catNameResolved.toLowerCase()}|||${subName.toLowerCase()}`;
        const existing = subByKey.get(key);

        if (existing) {
          subCategoryId = existing.id;
        } else if (autoCreate) {
          const created = await taxonomy.addSubCategory(categoryId, subName);
          subCategoryId = created;
          subByKey.set(key, { id: created, categoryId, name: subName });
        }
      }

      const id = typeof t.id === 'string' ? t.id : String(t.id ?? '').trim();

      out.push({
        id,
        externalId: t.externalId?.trim() || undefined,
        date: t.date,
        item: t.item,
        description: t.description,
        amountCents: t.amountCents,
        categoryId,
        subCategoryId,
      });
    }

    return out;
  };

  return (
    <Stack gap="md">
      <Paper withBorder radius="lg" p="lg" className="importPanelCard">
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <Text fw={700}>CSV import</Text>
            <Badge variant="light">{previewCount} rows parsed</Badge>
          </Group>
          <Text size="sm" c="dimmed" className="panelHelperText">
            Supports headers: date, item, description, amount, and optional category/subcategory.
          </Text>

          <Group align="flex-end" wrap="wrap">
            <FileInput
              label="Upload CSV"
              placeholder="Select file"
              value={file}
              onChange={(f) => {
                setFile(f);
                if (f) void loadFileText(f);
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
            onChange={(e) => setCsvText(e.currentTarget.value)}
            placeholder={exampleCsv}
          />

          <Group justify="space-between" wrap="wrap">
            <Text size="sm" c="dimmed">Preview rows: {previewCount}</Text>

            <Group wrap="wrap">
              <Button
                fullWidth={isMobile}
                disabled={!importTxns.length}
                onClick={async () => {
                  const mapped = await applyMapping();
                  const { txns, skipped } = finalizeImportTxns(mapped, {
                    existingKeys,
                    skipDuplicates,
                  });

                  ensureBudgetLinesForImportedSubCategories(txns);

                  onAppend(txns.map((t) => ({ ...t, companyId, projectId })));

                  setImportNotice(
                    skipped > 0
                      ? `Imported ${txns.length} rows. Skipped ${skipped} duplicate(s).`
                      : `Imported ${txns.length} rows.`
                  );
                }}
              >
                Append
              </Button>

              <Button
                color="red"
                fullWidth={isMobile}
                disabled={!importTxns.length}
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
                const mapped = await applyMapping();
                const { txns } = finalizeImportTxns(mapped, {
                  skipDuplicates: false,
                });

                ensureBudgetLinesForImportedSubCategories(txns);
                onReplaceAll(txns.map((t) => ({ ...t, companyId, projectId })));
                setConfirmReplaceOpen(false);
                setImportNotice(`Replaced transactions with ${txns.length} imported rows.`);
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

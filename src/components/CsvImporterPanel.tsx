import React, { useMemo, useState } from "react";
import { Button, FileInput, Group, Paper, Stack, Switch, Text, Textarea } from "@mantine/core";
import type { CompanyId, ImportTxnWithTaxonomy, ProjectId, Txn } from "../types";
import type { TaxonomyHook } from "../hooks/useTaxonomy";
import { parseCsv, rowsToImportTxns, finalizeImportTxns } from "../utils/csv";

/**
 * Importer notes:
 * - You can paste CSV text OR upload a .csv file.
 * - By default, imported rows are appended.
 * - Optional: auto-create missing categories/subcategories by name.
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
  const { taxonomy, existingTxns, companyId, projectId, canEditTaxonomy, onAppend, onReplaceAll } = props;

  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [autoCreate, setAutoCreate] = useState(true);

  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const [skipDuplicates, setSkipDuplicates] = useState(true);
const existingIds = useMemo(() => new Set(existingTxns.map((t) => t.id)), [existingTxns]);


  const exampleCsv = `id,date,item,description,amount,category,subcategory
EXP-1002345,2024-01-08,Uber,Taxi from airport to hotel,-46.80,Transport,Rideshare
EXP-1002346,2024-01-08,Hyatt Regency,Accommodation - Sydney,-389.00,Travel,Accommodation
EXP-1002347,2024-01-09,Qantas Airways,Flight SYD to MEL,-245.60,Travel,Flights
EXP-1002348,2024-01-09,Starbucks,Coffee with client,-7.50,Meals,Client Meals
EXP-1002349,2024-01-10,Officeworks,USB-C adapter,-29.95,Work Supplies,Electronics
EXP-1002350,2024-01-10,Coles,Snacks for team meeting,-18.40,Meals,Team Catering
`;

  async function loadFileText(f: File) {
    const t = await f.text();
    setCsvText(t);
  }

  const importTxns = useMemo<ImportTxnWithTaxonomy[]>(() => {
    try {
      const rows = parseCsv(csvText);
      const imp = rowsToImportTxns(rows);
      setPreviewCount(imp.length);
      return imp;
    } catch {
      setPreviewCount(null);
      return [];
    }
  }, [csvText]);

  const applyMapping = () => {
    // map category/subcategory names to IDs
    // if autoCreate: create missing taxonomy entries
    const catByName = new Map(taxonomy.categories.map((c) => [c.name.trim().toLowerCase(), c]));
    const subByKey = new Map(
      taxonomy.subCategories.map((s) => {
        const cat = taxonomy.categories.find((c) => c.id === s.categoryId);
        const key = `${(cat?.name ?? "").trim().toLowerCase()}|||${s.name.trim().toLowerCase()}`;
        return [key, s] as const;
      })
    );

    const mapped = importTxns.map((t) => {
      const catName = String(t.category ?? "").trim();
      const subName = String(t.subcategory ?? "").trim();

      let categoryId: string | undefined;
      let subCategoryId: string | undefined;

      if (catName) {
        const cKey = catName.toLowerCase();
        const cat = catByName.get(cKey);
        if (cat) categoryId = cat.id;
        else if (autoCreate) {
          const newCatId = taxonomy.addCategory(catName);
          categoryId = newCatId;
          catByName.set(cKey, { id: newCatId, name: catName });
        }
      }

      if (categoryId && subName) {
        const catNameResolved = taxonomy.getCategoryName(categoryId);
        const key = `${catNameResolved.trim().toLowerCase()}|||${subName.toLowerCase()}`;
        const sub = subByKey.get(key);
        if (sub) subCategoryId = sub.id;
        else if (autoCreate) {
          const newSubId = taxonomy.addSubCategory(categoryId, subName);
          subCategoryId = newSubId;
          subByKey.set(key, { id: newSubId, categoryId, name: subName });
        }
      }

      return {
        id: t.id,
        date: t.date,
        item: t.item,
        description: t.description,
        amount: t.amount,
        categoryId,
        subCategoryId,
      } satisfies ImportTxnWithTaxonomy;
    });

    return mapped;
  };

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text fw={600}>CSV Import</Text>
          <Text size="sm" c="dimmed">
            Supports headers: date,item,description,amount,(optional) category, subcategory
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
              Preview rows: {previewCount ?? 0}
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

    if (skipped > 0) alert(`Skipped ${skipped} duplicate(s).`);
  }}
>
  Append
</Button>
<Button
  color="red"
  onClick={() => {
    if (!confirm("Replace ALL transactions with imported CSV?")) return;

    const mapped = applyMapping();

    const { txns } = finalizeImportTxns(mapped, {
      skipDuplicates: false,
    });

    onReplaceAll(txns.map((t) => ({ ...t, companyId, projectId })));
  }}
  disabled={!importTxns.length}
>
  Replace all
</Button>

</Group>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Text fw={600}>Example CSV</Text>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{exampleCsv}</pre>
      </Paper>
    </Stack>
  );
}

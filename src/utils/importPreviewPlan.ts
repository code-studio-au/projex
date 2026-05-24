import { AppError } from '../api/errors';
import type {
  BudgetLine,
  Category,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  ImportPreviewRow,
  ImportRule,
  ImportTxnWithTaxonomy,
  SubCategory,
  Txn,
} from '../types';
import { parseCsv } from './csv';
import { buildImportPreview } from './importPreview';
import { MAX_IMPORT_PREVIEW_ROW_COUNT } from './importLimits';
import {
  decidePowerBiImportRule,
  powerBiAmountCents,
  powerBiDescription,
  powerBiExternalId,
  powerBiItem,
  powerBiTransactionDate,
  toPowerBiExpenditureActualsRow,
} from './powerBiImport';
import { normalizeExternalId } from './transactions';

function transactionImportKey(txn: Pick<Txn, 'id' | 'externalId'>) {
  const normalizedExternalId = normalizeExternalId(txn.externalId);
  return normalizedExternalId
    ? `external:${normalizedExternalId}`
    : `id:${txn.id}`;
}

export function planImportPreview(args: {
  csvText: string;
  importRules?: ImportRule[];
  existingTransactions: Array<Pick<Txn, 'id' | 'externalId'>>;
  categories: Category[];
  subCategories: SubCategory[];
  budgets: BudgetLine[];
  defaultCategories: CompanyDefaultCategory[];
  defaultSubCategories: CompanyDefaultSubCategory[];
  mappingRules: CompanyDefaultMappingRule[];
  autoCreateStructures: boolean;
  canEditTaxonomy: boolean;
  canEditBudgets: boolean;
}): { rows: ImportPreviewRow[] } {
  const rows = parseCsv(args.csvText);
  if (rows.length > MAX_IMPORT_PREVIEW_ROW_COUNT) {
    throw new AppError(
      'VALIDATION_ERROR',
      `CSV import preview is limited to ${MAX_IMPORT_PREVIEW_ROW_COUNT} data rows`
    );
  }
  const importTxns = rowsToPowerBiImportTxns(rows, args.importRules ?? []);
  const existingKeys = new Set(
    args.existingTransactions.map(transactionImportKey)
  );

  return {
    rows: buildImportPreview({
      importTxns,
      existingKeys,
      categories: args.categories,
      subCategories: args.subCategories,
      budgets: args.budgets,
      defaultCategories: args.defaultCategories,
      defaultSubCategories: args.defaultSubCategories,
      mappingRules: args.mappingRules,
      autoCreateTaxonomy: args.autoCreateStructures,
      canEditTaxonomy: args.canEditTaxonomy,
      autoCreateBudgets: args.autoCreateStructures,
      canEditBudgets: args.canEditBudgets,
    }),
  };
}

function rowsToPowerBiImportTxns(
  rows: Record<string, string>[],
  importRules: ImportRule[]
): ImportTxnWithTaxonomy[] {
  return rows.map((rawRow) => {
    const row = toPowerBiExpenditureActualsRow(rawRow);
    const decision = decidePowerBiImportRule({ row, rules: importRules });

    return {
      externalId: powerBiExternalId(row) || undefined,
      date: powerBiTransactionDate(row),
      item: powerBiItem(row),
      description: powerBiDescription(row),
      amountCents: powerBiAmountCents(row),
      importSourceType: 'powerbi_expenditure_actuals',
      importSourceMeta: row.raw,
      importAction: decision.action,
      importRuleId: decision.matchedRule?.id,
      importRuleName: decision.matchedRule?.name,
      importDecisionReason: decision.reason,
      rawSourceRow: row.raw,
    };
  });
}

import type {
  BudgetLine,
  Category,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  ImportPreviewRow,
  SubCategory,
  Txn,
} from '../types';
import { parseCsv, rowsToImportTxns } from './csv';
import { buildImportPreview } from './importPreview';
import { normalizeExternalId } from './transactions';

function transactionImportKey(txn: Pick<Txn, 'id' | 'externalId'>) {
  const normalizedExternalId = normalizeExternalId(txn.externalId);
  return normalizedExternalId
    ? `external:${normalizedExternalId}`
    : `id:${txn.id}`;
}

export function planImportPreview(args: {
  csvText: string;
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
  const importTxns = rowsToImportTxns(rows);
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

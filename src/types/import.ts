import type { CategoryId, SubCategoryId, TxnId } from './ids.ts';
import type { Txn } from './domain.ts';
import type { CompanyDefaultMappingRuleId } from './ids.ts';

/**
 * Import-only transaction shape (no company/project scoping yet).
 * `externalId` is optional because many CSVs don't provide a stable source ID.
 * `id` is optional and may be synthesized later for local/client identity.
 */
export type ImportTxn = Omit<
  Txn,
  'id' | 'internalId' | 'companyId' | 'projectId'
> & {
  id?: TxnId | string;
  externalId?: string;
};

/**
 * Import transaction with raw taxonomy names still attached.
 * This avoids `any` and `@ts-expect-error` in the CSV pipeline.
 */
export type ImportTxnWithTaxonomy = ImportTxn & {
  category?: string;
  subcategory?: string;
  categoryId?: CategoryId;
  subCategoryId?: SubCategoryId;
};

export type ImportPreviewMappingStatus =
  | 'matched_rule'
  | 'csv_taxonomy'
  | 'auto_created'
  | 'uncoded'
  | 'invalid';

export type ImportPreviewDuplicateReason = 'existing' | 'import';

export type ImportPreviewRow = {
  sourceRowIndex: number;
  importId: string;
  externalId?: string;
  parsedDate: string | null;
  amountCents: number | null;
  item: string | null;
  description: string | null;
  duplicate: boolean;
  duplicateReason?: ImportPreviewDuplicateReason;
  mappingStatus: ImportPreviewMappingStatus;
  categoryId?: CategoryId;
  subCategoryId?: SubCategoryId;
  categoryName?: string;
  subCategoryName?: string;
  ruleId?: CompanyDefaultMappingRuleId;
  codingSource?: 'manual' | 'company_default_rule';
  codingPendingApproval: boolean;
  willCreateCategory: boolean;
  willCreateSubCategory: boolean;
  willCreateBudgetLine: boolean;
  warnings: string[];
};

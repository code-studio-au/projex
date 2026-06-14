import type { CategoryId, ImportRuleId, SubCategoryId, TxnId } from './ids.ts';
import type { ImportRule, ImportRuleAction, Txn } from './domain.ts';
import type { CompanyDefaultMappingRuleId } from './ids.ts';

/**
 * Import-only transaction shape (no company/project scoping yet).
 * `externalId` is optional because source exports may not provide a stable ID.
 * `id` is optional and may be synthesized later for local/client identity.
 */
export type ImportTxn = Omit<
  Txn,
  | 'id'
  | 'internalId'
  | 'companyId'
  | 'projectId'
  | 'txnType'
  | 'parentTxnId'
  | 'sourceTxnId'
  | 'transferProjectId'
  | 'budgetImpact'
  | 'categorisable'
> & {
  id?: TxnId | string;
  externalId?: string;
};

/**
 * Import transaction with raw taxonomy names still attached.
 * This avoids `any` and `@ts-expect-error` in the import pipeline.
 */
export type ImportTxnWithTaxonomy = ImportTxn & {
  category?: string;
  subcategory?: string;
  categoryId?: CategoryId;
  subCategoryId?: SubCategoryId;
  importAction?: ImportRuleAction;
  importRuleId?: ImportRuleId;
  importRuleName?: string;
  importDecisionReason?: string;
  rawSourceRow?: Record<string, string>;
};

export type ImportPreviewMappingStatus =
  | 'matched_rule'
  | 'source_taxonomy'
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
  importAction: ImportRuleAction;
  importRuleId?: ImportRuleId;
  importRuleName?: string;
  importDecisionReason?: string;
  mappingStatus: ImportPreviewMappingStatus;
  categoryId?: CategoryId;
  subCategoryId?: SubCategoryId;
  categoryName?: string;
  subCategoryName?: string;
  ruleId?: CompanyDefaultMappingRuleId;
  codingSource?: 'manual' | 'company_default_rule' | 'project_rule';
  codingPendingApproval: boolean;
  willCreateCategory: boolean;
  willCreateSubCategory: boolean;
  willCreateBudgetLine: boolean;
  sourceType?: Txn['importSourceType'];
  rawSourceRow?: Record<string, string>;
  warnings: string[];
};

export type PowerBiExpenditureActualsRow = {
  ledger: string;
  fiscalYear: string;
  period: string;
  ccAndDescription: string;
  rcAndDescription: string;
  pcAndDescription: string;
  ac: string;
  expenditureActuals: string;
  journalLineDescription: string;
  journalId: string;
  referenceNum: string;
  journalDate: string;
  journalLine: string;
  journalLineRef: string;
  postedDate: string;
  unpostSeq: string;
  source: string;
  operatorId: string;
  poId: string;
  vendorId: string;
  vendorName: string;
  raw: Record<string, string>;
};

export type ImportRuleDecision = {
  action: ImportRuleAction;
  matchedRule?: ImportRule;
  reason: string;
};

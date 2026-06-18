import type { Kysely } from 'kysely';

import type { DB } from '../db/schema';
import type {
  CompanyId,
  ImportRule,
  ProjectAutoCodingRule,
  ProjectId,
  Txn,
} from '../../types';
import {
  asCompanyId,
  asImportRuleId,
  asProjectAutoCodingRuleId,
  asSubCategoryId,
  asTxnId,
  asUserId,
} from '../../types';
import { normalizeExternalId } from '../../utils/transactions';
import { defaultPowerBiImportRules } from '../../utils/powerBiImport';
import { toBudgetLines, toTxn } from '../mappers/transactionRows';
import {
  toCategory,
  toCompanyDefaultCategory,
  toCompanyDefaultMappingRule,
  toCompanyDefaultSubCategory,
  toSubCategory,
} from '../mappers/taxonomyRows';

function compareProjectImportRules(
  a: Awaited<ReturnType<typeof selectProjectImportRules>>[number],
  b: Awaited<ReturnType<typeof selectProjectImportRules>>[number]
) {
  const aGroup = a.sync_status === 'inherited' ? 1 : 0;
  const bGroup = b.sync_status === 'inherited' ? 1 : 0;
  if (aGroup !== bGroup) return aGroup - bGroup;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.created_at.localeCompare(b.created_at);
}

function compareProjectAutoCodingRules(
  a: Awaited<ReturnType<typeof selectProjectAutoCodingRules>>[number],
  b: Awaited<ReturnType<typeof selectProjectAutoCodingRules>>[number]
) {
  const aGroup = a.sync_status === 'inherited' ? 1 : 0;
  const bGroup = b.sync_status === 'inherited' ? 1 : 0;
  if (aGroup !== bGroup) return aGroup - bGroup;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.created_at.localeCompare(b.created_at);
}

export async function loadTransactionImportCommitContext(
  db: Kysely<DB>,
  args: { companyId: CompanyId; projectId: ProjectId }
) {
  const [
    defaultCategoriesRows,
    defaultSubCategoriesRows,
    mappingRuleRows,
    projectRuleRows,
    projectCategoryRows,
    projectSubCategoryRows,
    existingTxnRows,
    budgetRows,
  ] = await Promise.all([
    selectCompanyDefaultCategories(db, args.companyId),
    selectCompanyDefaultSubCategories(db, args.companyId),
    selectCompanyDefaultMappingRules(db, args.companyId),
    selectProjectAutoCodingRules(db, args.projectId),
    selectProjectCategories(db, args.projectId),
    selectProjectSubCategories(db, args.projectId),
    selectProjectTransactions(db, args.projectId),
    selectProjectBudgetLines(db, args.projectId),
  ]);

  return {
    defaultCategories: defaultCategoriesRows.map(toCompanyDefaultCategory),
    defaultSubCategories: defaultSubCategoriesRows.map(
      toCompanyDefaultSubCategory
    ),
    mappingRules: mappingRuleRows.map(toCompanyDefaultMappingRule),
    projectAutoCodingRules: projectRuleRows
      .sort(compareProjectAutoCodingRules)
      .map(toProjectAutoCodingRule),
    projectCategories: projectCategoryRows.map(toCategory),
    projectSubCategories: projectSubCategoryRows.map(toSubCategory),
    existingTransactions: existingTxnRows.map(toTxn),
    budgets: toBudgetLines(budgetRows),
  };
}

export async function loadTransactionImportPreviewContext(
  db: Kysely<DB>,
  args: { companyId: CompanyId; projectId: ProjectId }
) {
  const [
    existingRows,
    defaultCategoriesRows,
    defaultSubCategoriesRows,
    mappingRuleRows,
    projectRuleRows,
    projectImportRuleRows,
    projectCategoryRows,
    projectSubCategoryRows,
    budgetRows,
  ] = await Promise.all([
    selectProjectTransactionKeys(db, args.projectId),
    selectCompanyDefaultCategories(db, args.companyId),
    selectCompanyDefaultSubCategories(db, args.companyId),
    selectCompanyDefaultMappingRules(db, args.companyId),
    selectProjectAutoCodingRules(db, args.projectId),
    selectProjectImportRules(db, args.projectId),
    selectProjectCategories(db, args.projectId),
    selectProjectSubCategories(db, args.projectId),
    selectProjectBudgetLines(db, args.projectId),
  ]);

  return {
    existingTransactions: existingRows.map((txn) => ({
      id: asTxnId(txn.public_id),
      externalId: normalizeExternalId(txn.external_id),
    })) satisfies Array<Pick<Txn, 'id' | 'externalId'>>,
    defaultCategories: defaultCategoriesRows.map(toCompanyDefaultCategory),
    defaultSubCategories: defaultSubCategoriesRows.map(
      toCompanyDefaultSubCategory
    ),
    mappingRules: mappingRuleRows.map(toCompanyDefaultMappingRule),
    projectAutoCodingRules: projectRuleRows
      .sort(compareProjectAutoCodingRules)
      .map(toProjectAutoCodingRule),
    importRules: projectImportRuleRows.length
      ? projectImportRuleRows.sort(compareProjectImportRules).map(toImportRule)
      : defaultImportRules(args.companyId),
    projectCategories: projectCategoryRows.map(toCategory),
    projectSubCategories: projectSubCategoryRows.map(toSubCategory),
    budgets: toBudgetLines(budgetRows),
  };
}

function selectCompanyDefaultCategories(db: Kysely<DB>, companyId: CompanyId) {
  return db
    .selectFrom('company_default_categories')
    .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
    .where('company_id', '=', companyId)
    .execute();
}

function selectCompanyDefaultSubCategories(
  db: Kysely<DB>,
  companyId: CompanyId
) {
  return db
    .selectFrom('company_default_sub_categories')
    .select([
      'id',
      'company_id',
      'company_default_category_id',
      'name',
      'created_at',
      'updated_at',
    ])
    .where('company_id', '=', companyId)
    .execute();
}

function selectCompanyDefaultMappingRules(
  db: Kysely<DB>,
  companyId: CompanyId
) {
  return db
    .selectFrom('company_default_mapping_rules')
    .select([
      'id',
      'company_id',
      'match_text',
      'company_default_category_id',
      'company_default_sub_category_id',
      'sort_order',
      'created_at',
      'updated_at',
    ])
    .where('company_id', '=', companyId)
    .orderBy('sort_order', 'asc')
    .orderBy('created_at', 'asc')
    .execute();
}

function selectProjectImportRules(db: Kysely<DB>, projectId: ProjectId) {
  return db
    .selectFrom('import_rules')
    .select([
      'id',
      'company_id',
      'project_id',
      'name',
      'origin_scope',
      'origin_company_item_id',
      'sync_status',
      'last_synced_at',
      'source_updated_at_snapshot',
      'action',
      'field',
      'operator',
      'value',
      'sort_order',
      'enabled',
      'created_at',
      'updated_at',
    ])
    .where('project_id', '=', projectId)
    .orderBy('sort_order', 'asc')
    .orderBy('created_at', 'asc')
    .execute();
}

function selectProjectAutoCodingRules(db: Kysely<DB>, projectId: ProjectId) {
  return db
    .selectFrom('project_auto_coding_rules')
    .select([
      'id',
      'company_id',
      'project_id',
      'match_text',
      'category_id',
      'sub_category_id',
      'origin_scope',
      'origin_company_item_id',
      'sync_status',
      'last_synced_at',
      'source_updated_at_snapshot',
      'sort_order',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
    .where('project_id', '=', projectId)
    .execute();
}

function toImportRule(
  row: Awaited<ReturnType<typeof selectProjectImportRules>>[number]
): ImportRule {
  return {
    id: asImportRuleId(row.id),
    companyId: asCompanyId(row.company_id),
    scope: row.project_id ? 'project' : 'company',
    projectId: row.project_id ? (row.project_id as ProjectId) : undefined,
    name: row.name,
    originScope: row.origin_scope ?? undefined,
    originCompanyItemId: row.origin_company_item_id ?? undefined,
    syncStatus: row.sync_status ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    sourceUpdatedAtSnapshot: row.source_updated_at_snapshot ?? undefined,
    action: row.action,
    field: row.field,
    operator: row.operator,
    value: row.value,
    sortOrder: row.sort_order,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function defaultImportRules(companyId: CompanyId): ImportRule[] {
  return defaultPowerBiImportRules(companyId).map((rule, index) => ({
    ...rule,
    id: asImportRuleId(`default_import_rule_${index + 1}`),
  }));
}

function toProjectAutoCodingRule(
  row: Awaited<ReturnType<typeof selectProjectAutoCodingRules>>[number]
): ProjectAutoCodingRule {
  return {
    id: asProjectAutoCodingRuleId(row.id),
    companyId: asCompanyId(row.company_id),
    projectId: row.project_id as ProjectId,
    matchText: row.match_text,
    categoryId: row.category_id as ProjectAutoCodingRule['categoryId'],
    subCategoryId: asSubCategoryId(row.sub_category_id),
    originScope: row.origin_scope ?? undefined,
    originCompanyItemId: row.origin_company_item_id ?? undefined,
    syncStatus: row.sync_status ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    sourceUpdatedAtSnapshot: row.source_updated_at_snapshot ?? undefined,
    sortOrder: row.sort_order,
    createdByUserId: asUserId(row.created_by_user_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function selectProjectCategories(db: Kysely<DB>, projectId: ProjectId) {
  return db
    .selectFrom('categories')
    .select([
      'id',
      'company_id',
      'project_id',
      'name',
      'origin_scope',
      'origin_company_item_id',
      'sync_status',
      'last_synced_at',
      'source_updated_at_snapshot',
      'created_at',
      'updated_at',
    ])
    .where('project_id', '=', projectId)
    .execute();
}

function selectProjectSubCategories(db: Kysely<DB>, projectId: ProjectId) {
  return db
    .selectFrom('sub_categories')
    .select([
      'id',
      'company_id',
      'project_id',
      'category_id',
      'name',
      'origin_scope',
      'origin_company_item_id',
      'sync_status',
      'last_synced_at',
      'source_updated_at_snapshot',
      'created_at',
      'updated_at',
    ])
    .where('project_id', '=', projectId)
    .execute();
}

function selectProjectTransactions(db: Kysely<DB>, projectId: ProjectId) {
  return db
    .selectFrom('txns')
    .select([
      'id',
      'public_id',
      'external_id',
      'company_id',
      'project_id',
      'txn_date',
      'item',
      'description',
      'amount_cents',
      'txn_type',
      'parent_public_id',
      'source_public_id',
      'transfer_project_id',
      'budget_impact',
      'categorisable',
      'category_id',
      'sub_category_id',
      'company_default_mapping_rule_id',
      'coding_source',
      'coding_pending_approval',
      'reviewed_at',
      'reviewed_by_user_id',
      'locked_at',
      'locked_by_user_id',
      'created_at',
      'updated_at',
    ])
    .where('project_id', '=', projectId)
    .execute();
}

function selectProjectTransactionKeys(db: Kysely<DB>, projectId: ProjectId) {
  return db
    .selectFrom('txns')
    .select(['public_id', 'external_id'])
    .where('project_id', '=', projectId)
    .execute();
}

function selectProjectBudgetLines(db: Kysely<DB>, projectId: ProjectId) {
  return db
    .selectFrom('budget_lines')
    .select([
      'id',
      'company_id',
      'project_id',
      'category_id',
      'sub_category_id',
      'allocated_cents',
      'created_at',
      'updated_at',
    ])
    .where('project_id', '=', projectId)
    .execute();
}

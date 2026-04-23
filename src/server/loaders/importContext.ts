import type { Kysely } from 'kysely';

import type { DB } from '../db/schema';
import type { CompanyId, ProjectId, Txn } from '../../types';
import { asTxnId } from '../../types';
import { normalizeExternalId } from '../../utils/transactions';
import {
  type BudgetLineRow,
  type TxnRow,
  toBudgetLines,
  toTxn,
} from '../mappers/transactionRows';
import {
  type CategoryRow,
  type CompanyDefaultCategoryRow,
  type CompanyDefaultMappingRuleRow,
  type CompanyDefaultSubCategoryRow,
  type SubCategoryRow,
  toCategory,
  toCompanyDefaultCategory,
  toCompanyDefaultMappingRule,
  toCompanyDefaultSubCategory,
  toSubCategory,
} from '../mappers/taxonomyRows';

export async function loadTransactionImportCommitContext(
  db: Kysely<DB>,
  args: { companyId: CompanyId; projectId: ProjectId }
) {
  const [
    defaultCategoriesRows,
    defaultSubCategoriesRows,
    mappingRuleRows,
    projectCategoryRows,
    projectSubCategoryRows,
    existingTxnRows,
    budgetRows,
  ] = await Promise.all([
    selectCompanyDefaultCategories(db, args.companyId),
    selectCompanyDefaultSubCategories(db, args.companyId),
    selectCompanyDefaultMappingRules(db, args.companyId),
    selectProjectCategories(db, args.projectId),
    selectProjectSubCategories(db, args.projectId),
    selectProjectTransactions(db, args.projectId),
    selectProjectBudgetLines(db, args.projectId),
  ]);

  return {
    defaultCategories: defaultCategoriesRows.map((row) =>
      toCompanyDefaultCategory(row as CompanyDefaultCategoryRow)
    ),
    defaultSubCategories: defaultSubCategoriesRows.map((row) =>
      toCompanyDefaultSubCategory(row as CompanyDefaultSubCategoryRow)
    ),
    mappingRules: mappingRuleRows.map((row) =>
      toCompanyDefaultMappingRule(row as CompanyDefaultMappingRuleRow)
    ),
    projectCategories: projectCategoryRows.map((row) =>
      toCategory(row as CategoryRow)
    ),
    projectSubCategories: projectSubCategoryRows.map((row) =>
      toSubCategory(row as SubCategoryRow)
    ),
    existingTransactions: existingTxnRows.map((row) => toTxn(row as TxnRow)),
    budgets: toBudgetLines(budgetRows as BudgetLineRow[]),
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
    projectCategoryRows,
    projectSubCategoryRows,
    budgetRows,
  ] = await Promise.all([
    selectProjectTransactionKeys(db, args.projectId),
    selectCompanyDefaultCategories(db, args.companyId),
    selectCompanyDefaultSubCategories(db, args.companyId),
    selectCompanyDefaultMappingRules(db, args.companyId),
    selectProjectCategories(db, args.projectId),
    selectProjectSubCategories(db, args.projectId),
    selectProjectBudgetLines(db, args.projectId),
  ]);

  return {
    existingTransactions: existingRows.map((txn) => ({
      id: asTxnId(txn.public_id),
      externalId: normalizeExternalId(txn.external_id),
    })) satisfies Array<Pick<Txn, 'id' | 'externalId'>>,
    defaultCategories: defaultCategoriesRows.map((row) =>
      toCompanyDefaultCategory(row as CompanyDefaultCategoryRow)
    ),
    defaultSubCategories: defaultSubCategoriesRows.map((row) =>
      toCompanyDefaultSubCategory(row as CompanyDefaultSubCategoryRow)
    ),
    mappingRules: mappingRuleRows.map((row) =>
      toCompanyDefaultMappingRule(row as CompanyDefaultMappingRuleRow)
    ),
    projectCategories: projectCategoryRows.map((row) =>
      toCategory(row as CategoryRow)
    ),
    projectSubCategories: projectSubCategoryRows.map((row) =>
      toSubCategory(row as SubCategoryRow)
    ),
    budgets: toBudgetLines(budgetRows as BudgetLineRow[]),
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

function selectProjectCategories(db: Kysely<DB>, projectId: ProjectId) {
  return db
    .selectFrom('categories')
    .select([
      'id',
      'company_id',
      'project_id',
      'name',
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
      'category_id',
      'sub_category_id',
      'company_default_mapping_rule_id',
      'coding_source',
      'coding_pending_approval',
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

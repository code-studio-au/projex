import { AppError } from '../../../api/errors';
import type { CompanyDefaults, CompanyId, UserId } from '../../../types';
import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultSubCategoryId,
} from '../../../types';
import { recordAuditEvent } from '../../audit/auditEvents';
import { getDb } from '../../db/db';
import type { DB } from '../../db/schema';
import { syncCompanyAutoCodingRulesToSyncedProjects } from '../projectAutoCodingRules';
import { syncCompanyTaxonomyToSyncedProjects } from './standards';
import type { Transaction } from 'kysely';
import {
  toCompanyDefaultCategory,
  toCompanyDefaultMappingRule,
  toCompanyDefaultSubCategory,
} from '../../mappers/taxonomyRows';

export function companyDefaultCategorySelectColumns() {
  return ['id', 'company_id', 'name', 'created_at', 'updated_at'] as const;
}

export function companyDefaultSubCategorySelectColumns() {
  return [
    'id',
    'company_id',
    'company_default_category_id',
    'name',
    'created_at',
    'updated_at',
  ] as const;
}

export function companyDefaultMappingRuleSelectColumns() {
  return [
    'id',
    'company_id',
    'match_text',
    'company_default_category_id',
    'company_default_sub_category_id',
    'sort_order',
    'created_at',
    'updated_at',
  ] as const;
}

export async function listCompanyDefaultCategories(companyId: CompanyId) {
  const rows = await getDb()
    .selectFrom('company_default_categories')
    .select(companyDefaultCategorySelectColumns())
    .where('company_id', '=', companyId)
    .orderBy('name', 'asc')
    .execute();
  return rows.map(toCompanyDefaultCategory);
}

export async function findCompanyDefaultCategoryById(args: {
  companyId: CompanyId;
  categoryId: string;
}) {
  const row = await getDb()
    .selectFrom('company_default_categories')
    .select(companyDefaultCategorySelectColumns())
    .where('company_id', '=', args.companyId)
    .where('id', '=', args.categoryId)
    .executeTakeFirst();
  return row ? toCompanyDefaultCategory(row) : null;
}

export async function listCompanyDefaultSubCategories(companyId: CompanyId) {
  const rows = await getDb()
    .selectFrom('company_default_sub_categories')
    .select(companyDefaultSubCategorySelectColumns())
    .where('company_id', '=', companyId)
    .orderBy('name', 'asc')
    .execute();
  return rows.map(toCompanyDefaultSubCategory);
}

export async function findCompanyDefaultSubCategoryById(args: {
  companyId: CompanyId;
  subCategoryId: string;
}) {
  const row = await getDb()
    .selectFrom('company_default_sub_categories')
    .select(companyDefaultSubCategorySelectColumns())
    .where('company_id', '=', args.companyId)
    .where('id', '=', args.subCategoryId)
    .executeTakeFirst();
  return row ? toCompanyDefaultSubCategory(row) : null;
}

export async function listCompanyDefaultMappingRules(companyId: CompanyId) {
  const rows = await getDb()
    .selectFrom('company_default_mapping_rules')
    .select(companyDefaultMappingRuleSelectColumns())
    .where('company_id', '=', companyId)
    .orderBy('sort_order', 'asc')
    .orderBy('created_at', 'asc')
    .execute();
  return rows.map(toCompanyDefaultMappingRule);
}

export async function findCompanyDefaultMappingRuleById(args: {
  companyId: CompanyId;
  ruleId: string;
}) {
  const row = await getDb()
    .selectFrom('company_default_mapping_rules')
    .select(companyDefaultMappingRuleSelectColumns())
    .where('company_id', '=', args.companyId)
    .where('id', '=', args.ruleId)
    .executeTakeFirst();
  return row ? toCompanyDefaultMappingRule(row) : null;
}

export async function getCompanyDefaults(
  companyId: CompanyId
): Promise<CompanyDefaults> {
  const [categories, subCategories, mappingRules] = await Promise.all([
    listCompanyDefaultCategories(companyId),
    listCompanyDefaultSubCategories(companyId),
    listCompanyDefaultMappingRules(companyId),
  ]);

  return {
    categories,
    subCategories,
    mappingRules,
  };
}

export async function assertCompanyDefaultCategoryExists(args: {
  companyId: CompanyId;
  categoryId: string;
}) {
  const category = await getDb()
    .selectFrom('company_default_categories')
    .select('id')
    .where('company_id', '=', args.companyId)
    .where('id', '=', args.categoryId)
    .executeTakeFirst();
  if (!category) {
    throw new AppError('NOT_FOUND', 'Unknown company default category');
  }
}

export async function listCompanyDefaultSubCategoryRows(companyId: CompanyId) {
  return getDb()
    .selectFrom('company_default_sub_categories')
    .select(['id', 'company_default_category_id'])
    .where('company_id', '=', companyId)
    .execute();
}

export async function assertCompanyDefaultSubCategoryExists(args: {
  companyId: CompanyId;
  subCategoryId: string;
}) {
  const subCategory = await getDb()
    .selectFrom('company_default_sub_categories')
    .select(['id', 'company_default_category_id'])
    .where('company_id', '=', args.companyId)
    .where('id', '=', args.subCategoryId)
    .executeTakeFirst();
  if (!subCategory) {
    throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
  }
  return subCategory;
}

export async function assertCompanyDefaultSubCategoryBelongsToCategory(args: {
  companyId: CompanyId;
  subCategoryId: string;
  categoryId: string;
}) {
  const subCategory = await assertCompanyDefaultSubCategoryExists({
    companyId: args.companyId,
    subCategoryId: args.subCategoryId,
  });
  if (subCategory.company_default_category_id !== args.categoryId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Subcategory does not belong to the selected company default category'
    );
  }
  return subCategory;
}

export async function syncCompanyDefaultTaxonomyChange(args: {
  companyId: CompanyId;
  actorUserId: UserId;
  includeTaxonomy: boolean;
  trx: Transaction<DB>;
}) {
  if (args.includeTaxonomy) {
    await syncCompanyTaxonomyToSyncedProjects({
      db: args.trx,
      companyId: args.companyId,
    });
  }
  await syncCompanyAutoCodingRulesToSyncedProjects({
    db: args.trx,
    companyId: args.companyId,
    actorUserId: args.actorUserId,
  });
  await recordAuditEvent({
    db: args.trx,
    companyId: args.companyId,
    actorUserId: args.actorUserId,
    eventClass: 'inheritance',
    eventType: 'company_standards.propagated',
    entityType: 'company',
    entityId: args.companyId,
    reason: 'Propagated changed company standards to synced projects',
    resultingState: {
      taxonomyReconciled: args.includeTaxonomy,
      autoCodingRulesReconciled: true,
    },
  });
}

export function toCompanyDefaultCategoryId(value: string) {
  return asCompanyDefaultCategoryId(value);
}

export function toCompanyDefaultSubCategoryId(value: string) {
  return asCompanyDefaultSubCategoryId(value);
}

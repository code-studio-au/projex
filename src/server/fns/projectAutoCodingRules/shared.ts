import type { Kysely } from 'kysely';
import type { ProjectAutoCodingRule, ProjectId } from '../../../types';
import { asProjectAutoCodingRuleId, asSubCategoryId } from '../../../types';
import { resolveCompanyDefaultRuleToProjectTaxonomy } from '../../../utils/companyDefaultMappings';
import { canonicalizeRuleText } from '../../../utils/textRuleMatching';
import type { DB } from '../../db/schema';
import {
  toCategory,
  toCompanyDefaultCategory,
  toCompanyDefaultMappingRule,
  toCompanyDefaultSubCategory,
  toSubCategory,
} from '../../mappers/taxonomyRows';
import { toTxn } from '../../mappers/transactionRows';
import { getDb } from '../../db/db';
import { compareProjectStandards } from '../../sync/projectStandards';

export type ProjectAutoCodingRuleRow = {
  id: string;
  company_id: string;
  project_id: string;
  match_text: string;
  category_id: string;
  sub_category_id: string;
  origin_scope: 'company' | 'project' | null;
  origin_company_item_id: string | null;
  sync_status: 'local' | 'inherited' | 'overridden' | 'detached' | null;
  last_synced_at: string | null;
  source_updated_at_snapshot: string | null;
  sort_order: number;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export function projectAutoCodingRuleSelectColumns() {
  return [
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
  ] as const;
}

export function toProjectAutoCodingRule(
  row: ProjectAutoCodingRuleRow
): ProjectAutoCodingRule {
  return {
    id: asProjectAutoCodingRuleId(row.id),
    companyId: row.company_id as ProjectAutoCodingRule['companyId'],
    projectId: row.project_id as ProjectId,
    matchText: row.match_text,
    categoryId: row.category_id as ProjectAutoCodingRule['categoryId'],
    subCategoryId: asSubCategoryId(row.sub_category_id),
    originScope: row.origin_scope ?? 'project',
    originCompanyItemId: row.origin_company_item_id ?? undefined,
    syncStatus: row.sync_status ?? 'local',
    lastSyncedAt: row.last_synced_at ?? undefined,
    sourceUpdatedAtSnapshot: row.source_updated_at_snapshot ?? undefined,
    sortOrder: row.sort_order,
    createdByUserId:
      row.created_by_user_id == null
        ? undefined
        : (row.created_by_user_id as ProjectAutoCodingRule['createdByUserId']),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function projectAutoCodingRuleFingerprint(
  row: Pick<ProjectAutoCodingRuleRow, 'match_text' | 'sub_category_id'>
) {
  return [
    canonicalizeRuleText(row.match_text),
    String(row.sub_category_id),
  ].join('|');
}

export async function listProjectRules(
  db: ReturnType<typeof getDb>,
  projectId: ProjectId
) {
  const rows = await db
    .selectFrom('project_auto_coding_rules')
    .select(projectAutoCodingRuleSelectColumns())
    .where('project_id', '=', projectId)
    .execute();
  return rows.sort(compareProjectStandards).map(toProjectAutoCodingRule);
}

export async function listProjectTransactions(
  db: Kysely<DB>,
  projectId: ProjectId
) {
  const rows = await db
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
      'import_batch_id',
      'import_source_type',
      'import_source_meta',
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
  return rows.map(toTxn);
}

export async function listCompanyDefaultCategories(
  db: Kysely<DB>,
  companyId: ProjectAutoCodingRule['companyId']
) {
  const rows = await db
    .selectFrom('company_default_categories')
    .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
    .where('company_id', '=', companyId)
    .orderBy('name', 'asc')
    .execute();
  return rows.map(toCompanyDefaultCategory);
}

export async function listCompanyDefaultSubCategories(
  db: Kysely<DB>,
  companyId: ProjectAutoCodingRule['companyId']
) {
  const rows = await db
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
    .orderBy('name', 'asc')
    .execute();
  return rows.map(toCompanyDefaultSubCategory);
}

export async function listProjectCategories(
  db: Kysely<DB>,
  projectId: ProjectId
) {
  const rows = await db
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
    .orderBy('name', 'asc')
    .execute();
  return rows.map(toCategory);
}

export async function listProjectSubCategories(
  db: Kysely<DB>,
  projectId: ProjectId
) {
  const rows = await db
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
    .orderBy('name', 'asc')
    .execute();
  return rows.map(toSubCategory);
}

export async function resolveInheritedCompanyAutoCodingRule(args: {
  db: Kysely<DB>;
  companyId: ProjectAutoCodingRule['companyId'];
  projectId: ProjectId;
  companyRuleId: string;
}) {
  const companyRule = await args.db
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
    .where('company_id', '=', args.companyId)
    .where('id', '=', args.companyRuleId)
    .executeTakeFirst();
  if (!companyRule) return null;

  const [
    defaultCategories,
    defaultSubCategories,
    projectCategories,
    projectSubCategories,
  ] = await Promise.all([
    listCompanyDefaultCategories(args.db, args.companyId),
    listCompanyDefaultSubCategories(args.db, args.companyId),
    listProjectCategories(args.db, args.projectId),
    listProjectSubCategories(args.db, args.projectId),
  ]);

  const resolved = resolveCompanyDefaultRuleToProjectTaxonomy({
    rule: toCompanyDefaultMappingRule(companyRule),
    defaultCategories,
    defaultSubCategories,
    projectCategories,
    projectSubCategories,
  });
  if (!resolved) return null;

  return {
    companyRule,
    resolved,
  };
}

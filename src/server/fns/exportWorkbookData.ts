import type { Kysely } from 'kysely';

import { AppError } from '../../api/errors';
import type { CompanyExportOptions, CompanyId, UserId } from '../../types';
import { requireAuthorized } from '../auth/authorize';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import type { DB } from '../db/schema';
import type { ProjectExportRow } from './exportWorkbookShared';
import {
  txnReversalJoin,
  txnReversalSelectExpressions,
} from './transactions/shared';

export type CompanyExportCompanyRow = {
  id: string;
  name: string;
  status: string;
  deactivated_at: string | null;
};

export type CompanyMemberExportRow = {
  company_id: string;
  user_id: string;
  role: string;
  user_name: string;
  user_email: string;
  user_disabled: boolean;
  is_global_superadmin: boolean;
};

export type ProjectMembershipExportRow = {
  project_id: string;
  user_id: string;
  role: string;
  user_name: string;
  user_email: string;
};

export type CategoryExportRow = {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type SubCategoryExportRow = {
  id: string;
  company_id: string;
  project_id: string;
  category_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type BudgetLineExportRow = {
  id: string;
  company_id: string;
  project_id: string;
  category_id: string | null;
  sub_category_id: string | null;
  allocated_cents: number | string | bigint;
  created_at: string;
  updated_at: string;
};

export type TxnExportSourceRow = {
  id: string;
  public_id: string;
  external_id: string | null;
  company_id: string;
  project_id: string;
  txn_date: string;
  item: string;
  description: string;
  amount_cents: number | string | bigint;
  txn_type: string;
  parent_public_id: string | null;
  source_public_id: string | null;
  transfer_project_id: string | null;
  budget_impact: boolean;
  categorisable: boolean;
  import_batch_id: string | null;
  import_source_type: string | null;
  import_source_meta: unknown;
  category_id: string | null;
  sub_category_id: string | null;
  company_default_mapping_rule_id: string | null;
  coding_source: string | null;
  coding_pending_approval: boolean;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  locked_at: string | null;
  locked_by_user_id: string | null;
  reversal_id: string | null;
  reversal_status: string | null;
  reversal_side: string | null;
  reversal_counterpart_txn_public_id: string | null;
  reversal_expected_project_id: string | null;
  reversal_marked_at: string | null;
  reversal_marked_by_user_id: string | null;
  reversal_matched_at: string | null;
  reversal_matched_by_user_id: string | null;
  reversal_created_at: string | null;
  reversal_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyDefaultCategoryExportRow = {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type CompanyDefaultSubCategoryExportRow = {
  id: string;
  company_id: string;
  company_default_category_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type CompanyDefaultMappingRuleExportRow = {
  id: string;
  company_id: string;
  match_text: string;
  company_default_category_id: string;
  company_default_sub_category_id: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ImportRuleExportRow = {
  id: string;
  company_id: string;
  project_id: string | null;
  name: string;
  action: string;
  field: string;
  operator: string;
  value: string;
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type LoadedCompanyExportData = {
  company: CompanyExportCompanyRow;
  options: CompanyExportOptions;
  isSuperadmin: boolean;
  projectRows: ProjectExportRow[];
  companyMembers: CompanyMemberExportRow[];
  projectMemberships: ProjectMembershipExportRow[];
  categories: CategoryExportRow[];
  subCategories: SubCategoryExportRow[];
  budgetLines: BudgetLineExportRow[];
  txns: TxnExportSourceRow[];
  companyDefaultCategories: CompanyDefaultCategoryExportRow[];
  companyDefaultSubCategories: CompanyDefaultSubCategoryExportRow[];
  companyDefaultMappingRules: CompanyDefaultMappingRuleExportRow[];
  importRules: ImportRuleExportRow[];
};

export async function loadCompanyExportData(args: {
  db: Kysely<DB>;
  userId: UserId;
  companyId: CompanyId;
  options: CompanyExportOptions;
}): Promise<LoadedCompanyExportData> {
  const company = await args.db
    .selectFrom('companies')
    .select(['id', 'name', 'status', 'deactivated_at'])
    .where('id', '=', args.companyId)
    .executeTakeFirst();
  if (!company) throw new AppError('NOT_FOUND', 'Unknown company');

  await requireAuthorized({
    db: args.db,
    userId: args.userId,
    action: 'company:export',
    companyId: args.companyId,
  });

  const isSuperadmin = await isGlobalSuperadminUser(args.userId, args.db);

  const allProjectRows = await args.db
    .selectFrom('projects')
    .select([
      'id',
      'company_id',
      'name',
      'project_type',
      'parent_project_id',
      'budget_total_cents',
      'currency',
      'status',
      'deactivated_at',
      'visibility',
      'allow_superadmin_access',
      'sync_company_defaults',
      'allow_txn_transfers',
    ])
    .where('company_id', '=', args.companyId)
    .orderBy('project_type', 'asc')
    .orderBy('name', 'asc')
    .execute();

  const visibleProjectRows = isSuperadmin
    ? allProjectRows.filter((row) => row.allow_superadmin_access)
    : allProjectRows;
  const projectRows =
    args.options.scope === 'active'
      ? visibleProjectRows.filter((row) => row.status === 'active')
      : visibleProjectRows;
  const projectIds = projectRows.map((row) => row.id);

  const [
    companyMembers,
    projectMemberships,
    categories,
    subCategories,
    budgetLines,
    txns,
    companyDefaultCategories,
    companyDefaultSubCategories,
    companyDefaultMappingRules,
    importRules,
  ] = await Promise.all([
    args.db
      .selectFrom('company_memberships as cm')
      .innerJoin('users as u', 'u.id', 'cm.user_id')
      .select([
        'cm.company_id as company_id',
        'cm.user_id as user_id',
        'cm.role as role',
        'u.name as user_name',
        'u.email as user_email',
        'u.disabled as user_disabled',
        'u.is_global_superadmin as is_global_superadmin',
      ])
      .where('cm.company_id', '=', args.companyId)
      .orderBy('u.name', 'asc')
      .execute(),
    projectIds.length
      ? args.db
          .selectFrom('project_memberships as pm')
          .innerJoin('users as u', 'u.id', 'pm.user_id')
          .select([
            'pm.project_id as project_id',
            'pm.user_id as user_id',
            'pm.role as role',
            'u.name as user_name',
            'u.email as user_email',
          ])
          .where('pm.project_id', 'in', projectIds)
          .orderBy('pm.project_id', 'asc')
          .orderBy('u.name', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? args.db
          .selectFrom('categories')
          .select([
            'id',
            'company_id',
            'project_id',
            'name',
            'created_at',
            'updated_at',
          ])
          .where('project_id', 'in', projectIds)
          .orderBy('project_id', 'asc')
          .orderBy('name', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? args.db
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
          .where('project_id', 'in', projectIds)
          .orderBy('project_id', 'asc')
          .orderBy('name', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? args.db
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
          .where('project_id', 'in', projectIds)
          .orderBy('project_id', 'asc')
          .orderBy('created_at', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? (async () => {
          let query = args.db
            .selectFrom('txns as t')
            .leftJoin('txn_reversals as tr', txnReversalJoin())
            .select([
              't.id as id',
              't.public_id as public_id',
              't.external_id as external_id',
              't.company_id as company_id',
              't.project_id as project_id',
              't.txn_date as txn_date',
              't.item as item',
              't.description as description',
              't.amount_cents as amount_cents',
              't.txn_type as txn_type',
              't.parent_public_id as parent_public_id',
              't.source_public_id as source_public_id',
              't.transfer_project_id as transfer_project_id',
              't.budget_impact as budget_impact',
              't.categorisable as categorisable',
              't.import_batch_id as import_batch_id',
              't.import_source_type as import_source_type',
              't.import_source_meta as import_source_meta',
              't.category_id as category_id',
              't.sub_category_id as sub_category_id',
              't.company_default_mapping_rule_id as company_default_mapping_rule_id',
              't.coding_source as coding_source',
              't.coding_pending_approval as coding_pending_approval',
              't.reviewed_at as reviewed_at',
              't.reviewed_by_user_id as reviewed_by_user_id',
              't.locked_at as locked_at',
              't.locked_by_user_id as locked_by_user_id',
              ...txnReversalSelectExpressions({}),
              't.created_at as created_at',
              't.updated_at as updated_at',
            ])
            .where('t.project_id', 'in', projectIds);
          if (args.options.fromDate) {
            query = query.where('t.txn_date', '>=', args.options.fromDate);
          }
          if (args.options.toDate) {
            query = query.where('t.txn_date', '<=', args.options.toDate);
          }
          return query
            .orderBy('t.project_id', 'asc')
            .orderBy('t.txn_date', 'asc')
            .orderBy('t.id', 'asc')
            .execute();
        })()
      : Promise.resolve([]),
    args.db
      .selectFrom('company_default_categories')
      .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .where('company_id', '=', args.companyId)
      .orderBy('name', 'asc')
      .execute(),
    args.db
      .selectFrom('company_default_sub_categories')
      .select([
        'id',
        'company_id',
        'company_default_category_id',
        'name',
        'created_at',
        'updated_at',
      ])
      .where('company_id', '=', args.companyId)
      .orderBy('name', 'asc')
      .execute(),
    args.db
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
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute(),
    args.db
      .selectFrom('import_rules')
      .select([
        'id',
        'company_id',
        'project_id',
        'name',
        'action',
        'field',
        'operator',
        'value',
        'sort_order',
        'enabled',
        'created_at',
        'updated_at',
      ])
      .where('company_id', '=', args.companyId)
      .orderBy('project_id', 'asc')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute(),
  ]);

  return {
    company,
    options: args.options,
    isSuperadmin,
    projectRows,
    companyMembers,
    projectMemberships,
    categories,
    subCategories,
    budgetLines,
    txns,
    companyDefaultCategories,
    companyDefaultSubCategories,
    companyDefaultMappingRules,
    importRules,
  };
}

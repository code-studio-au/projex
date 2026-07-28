import type { Transaction } from 'kysely';
import { AppError } from '../../../api/errors';
import type {
  ApplyCompanyStandardsResult,
  ApplyCompanyTaxonomyResult,
  BulkRecodeProjectTransactionsInput,
  BulkRecodeProjectTransactionsResult,
} from '../../../api/types';
import type {
  Category,
  CompanyId,
  ProjectId,
  SubCategory,
  UserId,
} from '../../../types';
import { asCategoryId, asSubCategoryId } from '../../../types';
import { uid } from '../../../utils/id';
import { ensureBudgetLinesForProjectSubCategories } from '../budgets';
import { getDb } from '../../db/db';
import { recordAuditEvent } from '../../audit/auditEvents';
import type { DB } from '../../db/schema';
import {
  buildDetachedProjectStandardMetadata,
  buildInheritedProjectStandardMetadata,
  listSyncedProjectIdsForCompany,
  planProjectStandardReconciliation,
} from '../../sync/projectStandards';
import { syncCompanyAutoCodingRulesToProject } from '../projectAutoCodingRules/sync';
import { syncCompanyImportRulesToProject } from '../importRules';

type ProjectCategorySyncRow = {
  id: string;
  project_id?: string;
  name: string;
  origin_scope: 'company' | 'project' | null;
  origin_company_item_id: string | null;
  sync_status: 'local' | 'inherited' | 'overridden' | 'detached' | null;
  source_updated_at_snapshot: string | null;
};

type ProjectSubCategorySyncRow = {
  id: string;
  project_id?: string;
  category_id: string;
  name: string;
  origin_scope: 'company' | 'project' | null;
  origin_company_item_id: string | null;
  sync_status: 'local' | 'inherited' | 'overridden' | 'detached' | null;
  source_updated_at_snapshot: string | null;
};

function taxonomyNameKey(value: string): string {
  return value.trim().toLowerCase();
}

type CompanyDefaultCategoryRow = {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type CompanyDefaultSubCategoryRow = {
  id: string;
  company_id: string;
  company_default_category_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

function groupProjectCategoryRows(rows: ProjectCategorySyncRow[]) {
  const grouped = new Map<ProjectId, ProjectCategorySyncRow[]>();
  for (const row of rows) {
    const projectId = row.project_id as ProjectId;
    const existing = grouped.get(projectId);
    if (existing) {
      existing.push(row);
      continue;
    }
    grouped.set(projectId, [row]);
  }
  return grouped;
}

function groupProjectSubCategoryRows(rows: ProjectSubCategorySyncRow[]) {
  const grouped = new Map<ProjectId, ProjectSubCategorySyncRow[]>();
  for (const row of rows) {
    const projectId = row.project_id as ProjectId;
    const existing = grouped.get(projectId);
    if (existing) {
      existing.push(row);
      continue;
    }
    grouped.set(projectId, [row]);
  }
  return grouped;
}

async function applyCompanyTaxonomyWithPreloadedState(args: {
  db: Transaction<DB> | ReturnType<typeof getDb>;
  companyId: CompanyId;
  projectId: ProjectId;
  defaultCategories: CompanyDefaultCategoryRow[];
  defaultSubCategories: CompanyDefaultSubCategoryRow[];
  projectCategories: ProjectCategorySyncRow[];
  projectSubCategories: ProjectSubCategorySyncRow[];
}): Promise<ApplyCompanyTaxonomyResult> {
  const {
    db,
    companyId,
    projectId,
    defaultCategories,
    defaultSubCategories,
    projectCategories,
    projectSubCategories,
  } = args;
  const now = new Date().toISOString();
  let categoriesAdded = 0;
  let subCategoriesAdded = 0;

  const projectCategoryRows = projectCategories;
  const projectSubCategoryRows = projectSubCategories;
  const defaultCategoryIdToProjectCategoryId = new Map<string, string>();

  const categoryActions = planProjectStandardReconciliation({
    sources: defaultCategories,
    projectItems: projectCategoryRows,
    sourceId: (category) => category.id,
    originCompanyItemId: (category) => category.origin_company_item_id,
    syncStatus: (category) => category.sync_status,
    isExactLocalDuplicate: (source, target) =>
      taxonomyNameKey(source.name) === taxonomyNameKey(target.name),
  });

  for (const action of categoryActions) {
    if (action.kind === 'detach') {
      await db
        .updateTable('categories')
        .set({
          ...buildDetachedProjectStandardMetadata({
            companyItemId: action.target.origin_company_item_id!,
            previousSourceUpdatedAt: action.target.source_updated_at_snapshot,
            nowIso: now,
          }),
          updated_at: now,
        })
        .where('project_id', '=', projectId)
        .where('id', '=', action.target.id)
        .execute();
      continue;
    }

    if (action.kind === 'preserve') {
      defaultCategoryIdToProjectCategoryId.set(
        action.source.id,
        action.target.id
      );
      continue;
    }

    const metadata = buildInheritedProjectStandardMetadata({
      companyItemId: action.source.id,
      sourceUpdatedAt: action.source.updated_at,
      nowIso: now,
    });
    if (action.kind === 'create') {
      const createdId = asCategoryId(uid('cat'));
      await db
        .insertInto('categories')
        .values({
          id: createdId,
          company_id: companyId,
          project_id: projectId,
          name: action.source.name,
          ...metadata,
          created_at: now,
          updated_at: now,
        })
        .execute();
      defaultCategoryIdToProjectCategoryId.set(action.source.id, createdId);
      categoriesAdded += 1;
      continue;
    }

    await db
      .updateTable('categories')
      .set({ name: action.source.name, ...metadata, updated_at: now })
      .where('project_id', '=', projectId)
      .where('id', '=', action.target.id)
      .execute();
    defaultCategoryIdToProjectCategoryId.set(
      action.source.id,
      action.target.id
    );
  }

  const createdBudgetTargets: Array<{
    categoryId: Category['id'];
    subCategoryId: SubCategory['id'];
  }> = [];

  const resolvedDefaultSubCategories = defaultSubCategories.flatMap(
    (subCategory) => {
      const projectCategoryId = defaultCategoryIdToProjectCategoryId.get(
        subCategory.company_default_category_id
      );
      return projectCategoryId ? [{ subCategory, projectCategoryId }] : [];
    }
  );
  const subCategoryActions = planProjectStandardReconciliation({
    sources: resolvedDefaultSubCategories,
    projectItems: projectSubCategoryRows,
    sourceId: (source) => source.subCategory.id,
    originCompanyItemId: (subCategory) => subCategory.origin_company_item_id,
    syncStatus: (subCategory) => subCategory.sync_status,
    isExactLocalDuplicate: (source, target) =>
      target.category_id === source.projectCategoryId &&
      taxonomyNameKey(target.name) === taxonomyNameKey(source.subCategory.name),
  });

  for (const action of subCategoryActions) {
    if (action.kind === 'preserve') continue;
    if (action.kind === 'detach') {
      await db
        .updateTable('sub_categories')
        .set({
          ...buildDetachedProjectStandardMetadata({
            companyItemId: action.target.origin_company_item_id!,
            previousSourceUpdatedAt: action.target.source_updated_at_snapshot,
            nowIso: now,
          }),
          updated_at: now,
        })
        .where('project_id', '=', projectId)
        .where('id', '=', action.target.id)
        .execute();
      continue;
    }

    const { subCategory: source, projectCategoryId } = action.source;
    const metadata = buildInheritedProjectStandardMetadata({
      companyItemId: source.id,
      sourceUpdatedAt: source.updated_at,
      nowIso: now,
    });
    if (action.kind === 'create') {
      const createdId = asSubCategoryId(uid('sub'));
      await db
        .insertInto('sub_categories')
        .values({
          id: createdId,
          company_id: companyId,
          project_id: projectId,
          category_id: projectCategoryId,
          name: source.name,
          ...metadata,
          created_at: now,
          updated_at: now,
        })
        .execute();
      createdBudgetTargets.push({
        categoryId: asCategoryId(projectCategoryId),
        subCategoryId: createdId,
      });
      subCategoriesAdded += 1;
      continue;
    }

    const categoryChanged = action.target.category_id !== projectCategoryId;
    await db
      .updateTable('sub_categories')
      .set({
        category_id: projectCategoryId,
        name: source.name,
        ...metadata,
        updated_at: now,
      })
      .where('project_id', '=', projectId)
      .where('id', '=', action.target.id)
      .execute();
    if (categoryChanged) {
      await db
        .updateTable('budget_lines')
        .set({ category_id: projectCategoryId, updated_at: now })
        .where('project_id', '=', projectId)
        .where('sub_category_id', '=', action.target.id)
        .execute();
      await db
        .updateTable('txns')
        .set({ category_id: projectCategoryId, updated_at: now })
        .where('project_id', '=', projectId)
        .where('sub_category_id', '=', action.target.id)
        .where('locked_at', 'is', null)
        .execute();
    }
  }

  if (createdBudgetTargets.length) {
    await ensureBudgetLinesForProjectSubCategories({
      db,
      companyId,
      projectId,
      targets: createdBudgetTargets,
    });
  }

  return {
    companyDefaultsConfigured: defaultCategories.length > 0,
    categoriesAdded,
    subCategoriesAdded,
  };
}

export async function syncCompanyTaxonomyToProjects(args: {
  db: Transaction<DB> | ReturnType<typeof getDb>;
  companyId: CompanyId;
  projectIds: ProjectId[];
}) {
  if (!args.projectIds.length) return;

  const [
    defaultCategories,
    defaultSubCategories,
    projectCategories,
    projectSubCategories,
  ] = await Promise.all([
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
      .selectFrom('categories')
      .select([
        'id',
        'project_id',
        'name',
        'origin_scope',
        'origin_company_item_id',
        'sync_status',
        'source_updated_at_snapshot',
      ])
      .where('project_id', 'in', args.projectIds)
      .execute() as Promise<ProjectCategorySyncRow[]>,
    args.db
      .selectFrom('sub_categories')
      .select([
        'id',
        'project_id',
        'category_id',
        'name',
        'origin_scope',
        'origin_company_item_id',
        'sync_status',
        'source_updated_at_snapshot',
      ])
      .where('project_id', 'in', args.projectIds)
      .execute() as Promise<ProjectSubCategorySyncRow[]>,
  ]);

  const projectCategoriesByProjectId =
    groupProjectCategoryRows(projectCategories);
  const projectSubCategoriesByProjectId =
    groupProjectSubCategoryRows(projectSubCategories);

  for (const projectId of args.projectIds) {
    await applyCompanyTaxonomyWithPreloadedState({
      db: args.db,
      companyId: args.companyId,
      projectId,
      defaultCategories,
      defaultSubCategories,
      projectCategories: projectCategoriesByProjectId.get(projectId) ?? [],
      projectSubCategories:
        projectSubCategoriesByProjectId.get(projectId) ?? [],
    });
  }
}

export async function syncCompanyTaxonomyToSyncedProjects(args: {
  db: Transaction<DB> | ReturnType<typeof getDb>;
  companyId: CompanyId;
}) {
  const syncedProjectIds = await listSyncedProjectIdsForCompany({
    db: args.db,
    companyId: args.companyId,
  });
  await syncCompanyTaxonomyToProjects({
    db: args.db,
    companyId: args.companyId,
    projectIds: syncedProjectIds,
  });
}

export async function applyCompanyStandardsToProject(args: {
  db: Transaction<DB> | ReturnType<typeof getDb>;
  companyId: CompanyId;
  projectId: ProjectId;
  actorUserId: UserId;
}): Promise<ApplyCompanyStandardsResult> {
  const result = await applyCompanyTaxonomyToProject({
    db: args.db,
    companyId: args.companyId,
    projectId: args.projectId,
  });
  await syncCompanyImportRulesToProject({
    db: args.db,
    companyId: args.companyId,
    projectId: args.projectId,
  });
  await syncCompanyAutoCodingRulesToProject({
    db: args.db,
    companyId: args.companyId,
    projectId: args.projectId,
    actorUserId: args.actorUserId,
  });
  await recordAuditEvent({
    db: args.db,
    companyId: args.companyId,
    projectId: args.projectId,
    actorUserId: args.actorUserId,
    eventClass: 'inheritance',
    eventType: 'company_standards.reconciled',
    entityType: 'project',
    entityId: args.projectId,
    reason: 'Applied company standards to project',
    resultingState: {
      categoriesAdded: result.categoriesAdded,
      subCategoriesAdded: result.subCategoriesAdded,
      importRulesSynced: true,
      autoCodingRulesSynced: true,
    },
  });
  return {
    ...result,
    importRulesSynced: true,
    autoCodingRulesSynced: true,
  };
}

export async function applyCompanyTaxonomyToProject(args: {
  db: Transaction<DB> | ReturnType<typeof getDb>;
  companyId: CompanyId;
  projectId: ProjectId;
}): Promise<ApplyCompanyTaxonomyResult> {
  const { db, companyId, projectId } = args;
  const [
    defaultCategories,
    defaultSubCategories,
    projectCategories,
    projectSubCategories,
  ] = await Promise.all([
    db
      .selectFrom('company_default_categories')
      .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .where('company_id', '=', companyId)
      .orderBy('name', 'asc')
      .execute(),
    db
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
      .execute(),
    db
      .selectFrom('categories')
      .select([
        'id',
        'name',
        'origin_scope',
        'origin_company_item_id',
        'sync_status',
        'source_updated_at_snapshot',
      ])
      .where('project_id', '=', projectId)
      .execute() as Promise<ProjectCategorySyncRow[]>,
    db
      .selectFrom('sub_categories')
      .select([
        'id',
        'category_id',
        'name',
        'origin_scope',
        'origin_company_item_id',
        'sync_status',
        'source_updated_at_snapshot',
      ])
      .where('project_id', '=', projectId)
      .execute() as Promise<ProjectSubCategorySyncRow[]>,
  ]);

  return applyCompanyTaxonomyWithPreloadedState({
    db,
    companyId,
    projectId,
    defaultCategories,
    defaultSubCategories,
    projectCategories,
    projectSubCategories,
  });
}

export async function bulkRecodeProjectTransactions(args: {
  db: ReturnType<typeof getDb>;
  companyId: CompanyId;
  projectId: ProjectId;
  input: BulkRecodeProjectTransactionsInput;
}): Promise<BulkRecodeProjectTransactionsResult> {
  const { db, companyId, projectId, input } = args;
  const [fromSubCategory, targetCategory, targetSubCategory] =
    await Promise.all([
      db
        .selectFrom('sub_categories')
        .select(['id', 'category_id'])
        .where('project_id', '=', projectId)
        .where('id', '=', input.fromSubCategoryId)
        .executeTakeFirst(),
      db
        .selectFrom('categories')
        .select('id')
        .where('project_id', '=', projectId)
        .where('id', '=', input.toCategoryId)
        .executeTakeFirst(),
      db
        .selectFrom('sub_categories')
        .select(['id', 'category_id'])
        .where('project_id', '=', projectId)
        .where('id', '=', input.toSubCategoryId)
        .executeTakeFirst(),
    ]);

  if (!fromSubCategory) {
    throw new AppError('NOT_FOUND', 'Unknown source project subcategory');
  }
  if (!targetCategory) {
    throw new AppError('NOT_FOUND', 'Unknown target project category');
  }
  if (!targetSubCategory) {
    throw new AppError('NOT_FOUND', 'Unknown target project subcategory');
  }
  if (targetSubCategory.category_id !== input.toCategoryId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Target subcategory does not belong to the target category'
    );
  }

  const now = new Date().toISOString();
  await ensureBudgetLinesForProjectSubCategories({
    db,
    companyId,
    projectId,
    targets: [
      {
        categoryId: input.toCategoryId,
        subCategoryId: input.toSubCategoryId,
      },
    ],
  });
  const updatedRows = await db
    .updateTable('txns')
    .set({
      category_id: input.toCategoryId,
      sub_category_id: input.toSubCategoryId,
      company_default_mapping_rule_id: null,
      coding_source: 'manual',
      coding_pending_approval: false,
      updated_at: now,
    })
    .where('company_id', '=', companyId)
    .where('project_id', '=', projectId)
    .where('categorisable', '=', true)
    .where('sub_category_id', '=', input.fromSubCategoryId)
    .where('locked_at', 'is', null)
    .returning('public_id')
    .execute();

  return { updatedCount: updatedRows.length };
}

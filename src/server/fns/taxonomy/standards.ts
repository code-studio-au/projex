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
import type { DB } from '../../db/schema';
import {
  buildDetachedProjectStandardMetadata,
  buildInheritedProjectStandardMetadata,
  listSyncedProjectIdsForCompany,
  shouldApplyInheritedUpdate,
} from '../../sync/projectStandards';
import { syncCompanyAutoCodingRulesToProject } from '../projectAutoCodingRules';
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

  for (const defaultCategory of defaultCategories) {
    const inheritedCategory = projectCategoryRows.find(
      (category) => category.origin_company_item_id === defaultCategory.id
    );
    const localNameMatch = projectCategoryRows.find(
      (category) =>
        !category.origin_company_item_id &&
        taxonomyNameKey(category.name) === taxonomyNameKey(defaultCategory.name)
    );

    if (inheritedCategory) {
      defaultCategoryIdToProjectCategoryId.set(
        defaultCategory.id,
        inheritedCategory.id
      );
      if (!shouldApplyInheritedUpdate(inheritedCategory.sync_status)) continue;
      await db
        .updateTable('categories')
        .set({
          name: defaultCategory.name,
          ...buildInheritedProjectStandardMetadata({
            companyItemId: defaultCategory.id,
            sourceUpdatedAt: defaultCategory.updated_at,
            nowIso: now,
          }),
          updated_at: now,
        })
        .where('project_id', '=', projectId)
        .where('id', '=', inheritedCategory.id)
        .execute();
      continue;
    }

    if (localNameMatch) {
      if (!localNameMatch.origin_scope) {
        await db
          .updateTable('categories')
          .set({
            ...buildInheritedProjectStandardMetadata({
              companyItemId: defaultCategory.id,
              sourceUpdatedAt: defaultCategory.updated_at,
              nowIso: now,
            }),
            updated_at: now,
          })
          .where('project_id', '=', projectId)
          .where('id', '=', localNameMatch.id)
          .execute();
      }
      defaultCategoryIdToProjectCategoryId.set(
        defaultCategory.id,
        localNameMatch.id
      );
      continue;
    }

    const createdId = asCategoryId(uid('cat'));
    await db
      .insertInto('categories')
      .values({
        id: createdId,
        company_id: companyId,
        project_id: projectId,
        name: defaultCategory.name,
        ...buildInheritedProjectStandardMetadata({
          companyItemId: defaultCategory.id,
          sourceUpdatedAt: defaultCategory.updated_at,
          nowIso: now,
        }),
        created_at: now,
        updated_at: now,
      })
      .execute();
    defaultCategoryIdToProjectCategoryId.set(defaultCategory.id, createdId);
    categoriesAdded += 1;
  }

  const liveDefaultCategoryIds = new Set(
    defaultCategories.map((category) => category.id)
  );
  for (const staleCategory of projectCategoryRows.filter(
    (category) =>
      category.origin_company_item_id &&
      !liveDefaultCategoryIds.has(category.origin_company_item_id) &&
      category.sync_status !== 'detached'
  )) {
    await db
      .updateTable('categories')
      .set({
        ...buildDetachedProjectStandardMetadata({
          companyItemId: staleCategory.origin_company_item_id!,
          previousSourceUpdatedAt: staleCategory.source_updated_at_snapshot,
          nowIso: now,
        }),
        updated_at: now,
      })
      .where('project_id', '=', projectId)
      .where('id', '=', staleCategory.id)
      .execute();
  }

  const createdBudgetTargets: Array<{
    categoryId: Category['id'];
    subCategoryId: SubCategory['id'];
  }> = [];

  for (const defaultSubCategory of defaultSubCategories) {
    const projectCategoryId = defaultCategoryIdToProjectCategoryId.get(
      defaultSubCategory.company_default_category_id
    );
    if (!projectCategoryId) continue;

    const inheritedSubCategory = projectSubCategoryRows.find(
      (subCategory) =>
        subCategory.origin_company_item_id === defaultSubCategory.id
    );
    const localNameMatch = projectSubCategoryRows.find(
      (subCategory) =>
        !subCategory.origin_company_item_id &&
        subCategory.category_id === projectCategoryId &&
        taxonomyNameKey(subCategory.name) ===
          taxonomyNameKey(defaultSubCategory.name)
    );

    if (inheritedSubCategory) {
      if (!shouldApplyInheritedUpdate(inheritedSubCategory.sync_status)) {
        continue;
      }
      const categoryChanged =
        inheritedSubCategory.category_id !== projectCategoryId;
      await db
        .updateTable('sub_categories')
        .set({
          category_id: projectCategoryId,
          name: defaultSubCategory.name,
          ...buildInheritedProjectStandardMetadata({
            companyItemId: defaultSubCategory.id,
            sourceUpdatedAt: defaultSubCategory.updated_at,
            nowIso: now,
          }),
          updated_at: now,
        })
        .where('project_id', '=', projectId)
        .where('id', '=', inheritedSubCategory.id)
        .execute();
      if (categoryChanged) {
        await db
          .updateTable('budget_lines')
          .set({ category_id: projectCategoryId, updated_at: now })
          .where('project_id', '=', projectId)
          .where('sub_category_id', '=', inheritedSubCategory.id)
          .execute();
        await db
          .updateTable('txns')
          .set({ category_id: projectCategoryId, updated_at: now })
          .where('project_id', '=', projectId)
          .where('sub_category_id', '=', inheritedSubCategory.id)
          .where('locked_at', 'is', null)
          .execute();
      }
      continue;
    }

    if (localNameMatch) {
      if (!localNameMatch.origin_scope) {
        await db
          .updateTable('sub_categories')
          .set({
            category_id: projectCategoryId,
            ...buildInheritedProjectStandardMetadata({
              companyItemId: defaultSubCategory.id,
              sourceUpdatedAt: defaultSubCategory.updated_at,
              nowIso: now,
            }),
            updated_at: now,
          })
          .where('project_id', '=', projectId)
          .where('id', '=', localNameMatch.id)
          .execute();
      }
      continue;
    }

    const createdId = asSubCategoryId(uid('sub'));
    await db
      .insertInto('sub_categories')
      .values({
        id: createdId,
        company_id: companyId,
        project_id: projectId,
        category_id: projectCategoryId,
        name: defaultSubCategory.name,
        ...buildInheritedProjectStandardMetadata({
          companyItemId: defaultSubCategory.id,
          sourceUpdatedAt: defaultSubCategory.updated_at,
          nowIso: now,
        }),
        created_at: now,
        updated_at: now,
      })
      .execute();
    createdBudgetTargets.push({
      categoryId: asCategoryId(projectCategoryId),
      subCategoryId: createdId,
    });
    subCategoriesAdded += 1;
  }

  const liveDefaultSubCategoryIds = new Set(
    defaultSubCategories.map((subCategory) => subCategory.id)
  );
  for (const staleSubCategory of projectSubCategoryRows.filter(
    (subCategory) =>
      subCategory.origin_company_item_id &&
      !liveDefaultSubCategoryIds.has(subCategory.origin_company_item_id) &&
      subCategory.sync_status !== 'detached'
  )) {
    await db
      .updateTable('sub_categories')
      .set({
        ...buildDetachedProjectStandardMetadata({
          companyItemId: staleSubCategory.origin_company_item_id!,
          previousSourceUpdatedAt: staleSubCategory.source_updated_at_snapshot,
          nowIso: now,
        }),
        updated_at: now,
      })
      .where('project_id', '=', projectId)
      .where('id', '=', staleSubCategory.id)
      .execute();
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

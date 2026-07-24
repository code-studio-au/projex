import { AppError } from '../../../api/errors';
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  PromoteProjectSubCategoryToCompanyDefaultResult,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
} from '../../../api/types';
import type {
  Category,
  CompanyDefaultCategory,
  CompanyId,
  ProjectId,
  SubCategory,
  UserId,
} from '../../../types';
import {
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asSubCategoryId,
} from '../../../types';
import { uid } from '../../../utils/id';
import {
  categoryNameSchema,
  subCategoryNameSchema,
} from '../../../validation/schemas';
import { validateOrThrow } from '../../../validation/validate';
import { ensureBudgetLinesForProjectSubCategories } from '../budgets';
import { getDb } from '../../db/db';
import {
  buildInheritedProjectStandardMetadata,
  buildLocalProjectStandardMetadata,
} from '../../sync/projectStandards';
import { toCategory, toSubCategory } from '../../mappers/taxonomyRows';
import {
  companyDefaultCategorySelectColumns,
  companyDefaultSubCategorySelectColumns,
  syncCompanyDefaultTaxonomyChange,
} from './companyDefaults';

function taxonomyNameKey(value: string): string {
  return value.trim().toLowerCase();
}

export function categorySelectColumns() {
  return [
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
  ] as const;
}

export function subCategorySelectColumns() {
  return [
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
  ] as const;
}

export async function listProjectCategories(projectId: ProjectId) {
  const rows = await getDb()
    .selectFrom('categories')
    .select(categorySelectColumns())
    .where('project_id', '=', projectId)
    .orderBy('name', 'asc')
    .execute();
  return rows.map(toCategory);
}

export async function createProjectCategory(args: {
  companyId: CompanyId;
  projectId: ProjectId;
  input: CategoryCreateInput;
}) {
  validateOrThrow(categoryNameSchema, args.input.name);
  const db = getDb();
  const name = args.input.name.trim();

  const existing = await db
    .selectFrom('categories')
    .select([
      'id',
      'company_id',
      'project_id',
      'name',
      'created_at',
      'updated_at',
    ])
    .where('project_id', '=', args.projectId)
    .where(({ fn, eb }) => eb(fn('lower', ['name']), '=', name.toLowerCase()))
    .executeTakeFirst();
  if (existing) return toCategory(existing);

  const id = args.input.id ?? asCategoryId(uid('cat'));
  const now = new Date().toISOString();
  const row = await db
    .insertInto('categories')
    .values({
      id,
      company_id: args.companyId,
      project_id: args.projectId,
      name,
      ...buildLocalProjectStandardMetadata(now),
      created_at: now,
      updated_at: now,
    })
    .returning(categorySelectColumns())
    .executeTakeFirstOrThrow();

  return toCategory(row);
}

export async function updateProjectCategory(args: {
  projectId: ProjectId;
  input: CategoryUpdateInput;
}) {
  const db = getDb();
  const existing = await db
    .selectFrom('categories')
    .select([
      'id',
      'company_id',
      'project_id',
      'name',
      'origin_scope',
      'origin_company_item_id',
      'sync_status',
      'created_at',
      'updated_at',
    ])
    .where('project_id', '=', args.projectId)
    .where('id', '=', args.input.id)
    .executeTakeFirst();
  if (!existing) throw new AppError('NOT_FOUND', 'Unknown category');

  if (typeof args.input.name === 'string') {
    validateOrThrow(categoryNameSchema, args.input.name);
  }

  const nextName =
    typeof args.input.name === 'string'
      ? args.input.name.trim()
      : existing.name.trim();
  const patch: Record<string, unknown> = {};
  if (typeof args.input.name === 'string') patch.name = nextName;
  if (existing.origin_scope === 'company' && existing.origin_company_item_id) {
    const companyDefaultCategory = await db
      .selectFrom('company_default_categories')
      .select(['id', 'name', 'updated_at'])
      .where('company_id', '=', asCompanyId(existing.company_id))
      .where('id', '=', existing.origin_company_item_id)
      .executeTakeFirst();

    if (
      companyDefaultCategory &&
      taxonomyNameKey(nextName) === taxonomyNameKey(companyDefaultCategory.name)
    ) {
      Object.assign(
        patch,
        buildInheritedProjectStandardMetadata({
          companyItemId: companyDefaultCategory.id,
          sourceUpdatedAt: companyDefaultCategory.updated_at,
          nowIso: new Date().toISOString(),
        })
      );
    } else if (existing.sync_status === 'inherited') {
      patch.sync_status = 'overridden';
      patch.last_synced_at = new Date().toISOString();
    }
  }
  patch.updated_at = new Date().toISOString();

  const updated = await db
    .updateTable('categories')
    .set(patch)
    .where('project_id', '=', args.projectId)
    .where('id', '=', args.input.id)
    .returning(categorySelectColumns())
    .executeTakeFirstOrThrow();

  return toCategory(updated);
}

export async function deleteProjectCategory(args: {
  projectId: ProjectId;
  categoryId: Category['id'];
}) {
  const db = getDb();
  const existing = await db
    .selectFrom('categories')
    .select([
      'id',
      'company_id',
      'origin_scope',
      'origin_company_item_id',
      'sync_status',
    ])
    .where('project_id', '=', args.projectId)
    .where('id', '=', args.categoryId)
    .executeTakeFirst();
  if (!existing) return;
  if (existing.origin_scope === 'company' && existing.origin_company_item_id) {
    const companySource = await db
      .selectFrom('company_default_categories')
      .select('id')
      .where('company_id', '=', asCompanyId(existing.company_id))
      .where('id', '=', existing.origin_company_item_id)
      .executeTakeFirst();
    if (companySource) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Company-linked categories cannot be deleted while their company default still exists.'
      );
    }
  }

  await db.transaction().execute(async (trx) => {
    const subs = await trx
      .selectFrom('sub_categories')
      .select('id')
      .where('project_id', '=', args.projectId)
      .where('category_id', '=', args.categoryId)
      .execute();
    const subIds = subs.map((s) => s.id);

    const lockedTransaction = await trx
      .selectFrom('txns')
      .select('public_id')
      .where('project_id', '=', args.projectId)
      .where('locked_at', 'is not', null)
      .where((eb) =>
        subIds.length
          ? eb.or([
              eb('category_id', '=', args.categoryId),
              eb('sub_category_id', 'in', subIds),
            ])
          : eb('category_id', '=', args.categoryId)
      )
      .executeTakeFirst();
    if (lockedTransaction) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Category cannot be deleted while locked transactions use it'
      );
    }

    await trx
      .deleteFrom('sub_categories')
      .where('project_id', '=', args.projectId)
      .where('category_id', '=', args.categoryId)
      .execute();

    await trx
      .updateTable('budget_lines')
      .set({
        category_id: null,
        sub_category_id: null,
        updated_at: new Date().toISOString(),
      })
      .where('project_id', '=', args.projectId)
      .where('category_id', '=', args.categoryId)
      .execute();

    if (subIds.length) {
      await trx
        .updateTable('budget_lines')
        .set({ sub_category_id: null, updated_at: new Date().toISOString() })
        .where('project_id', '=', args.projectId)
        .where('sub_category_id', 'in', subIds)
        .execute();
    }

    await trx
      .updateTable('txns')
      .set({
        category_id: null,
        sub_category_id: null,
        company_default_mapping_rule_id: null,
        coding_source: null,
        coding_pending_approval: false,
        updated_at: new Date().toISOString(),
      })
      .where('project_id', '=', args.projectId)
      .where('category_id', '=', args.categoryId)
      .execute();

    if (subIds.length) {
      await trx
        .updateTable('txns')
        .set({
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          updated_at: new Date().toISOString(),
        })
        .where('project_id', '=', args.projectId)
        .where('sub_category_id', 'in', subIds)
        .execute();
    }

    await trx
      .deleteFrom('categories')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.categoryId)
      .execute();
  });
}

export async function listProjectSubCategories(projectId: ProjectId) {
  const rows = await getDb()
    .selectFrom('sub_categories')
    .select(subCategorySelectColumns())
    .where('project_id', '=', projectId)
    .orderBy('name', 'asc')
    .execute();
  return rows.map(toSubCategory);
}

export async function createProjectSubCategory(args: {
  companyId: CompanyId;
  projectId: ProjectId;
  input: SubCategoryCreateInput;
}) {
  validateOrThrow(subCategoryNameSchema, args.input.name);
  const db = getDb();
  const name = args.input.name.trim();

  const category = await db
    .selectFrom('categories')
    .select('id')
    .where('project_id', '=', args.projectId)
    .where('id', '=', args.input.categoryId)
    .executeTakeFirst();
  if (!category) throw new AppError('NOT_FOUND', 'Unknown category');

  const existing = await db
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
    .where('project_id', '=', args.projectId)
    .where('category_id', '=', args.input.categoryId)
    .where(({ fn, eb }) => eb(fn('lower', ['name']), '=', name.toLowerCase()))
    .executeTakeFirst();
  if (existing) return toSubCategory(existing);

  const id = args.input.id ?? asSubCategoryId(uid('sub'));
  const now = new Date().toISOString();
  const row = await db
    .insertInto('sub_categories')
    .values({
      id,
      company_id: args.companyId,
      project_id: args.projectId,
      category_id: args.input.categoryId,
      name,
      ...buildLocalProjectStandardMetadata(now),
      created_at: now,
      updated_at: now,
    })
    .returning(subCategorySelectColumns())
    .executeTakeFirstOrThrow();

  await ensureBudgetLinesForProjectSubCategories({
    db,
    companyId: args.companyId,
    projectId: args.projectId,
    targets: [
      {
        categoryId: args.input.categoryId,
        subCategoryId: id,
      },
    ],
  });

  return toSubCategory(row);
}

export async function updateProjectSubCategory(args: {
  projectId: ProjectId;
  input: SubCategoryUpdateInput;
}) {
  const db = getDb();
  const existing = await db
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
      'created_at',
      'updated_at',
    ])
    .where('project_id', '=', args.projectId)
    .where('id', '=', args.input.id)
    .executeTakeFirst();
  if (!existing) throw new AppError('NOT_FOUND', 'Unknown subcategory');

  if (typeof args.input.name === 'string') {
    validateOrThrow(subCategoryNameSchema, args.input.name);
  }

  if (typeof args.input.categoryId !== 'undefined') {
    const cat = await db
      .selectFrom('categories')
      .select('id')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.categoryId)
      .executeTakeFirst();
    if (!cat) throw new AppError('NOT_FOUND', 'Unknown category');
  }

  const nextName =
    typeof args.input.name === 'string'
      ? args.input.name.trim()
      : existing.name.trim();
  const nextCategoryId =
    typeof args.input.categoryId !== 'undefined'
      ? args.input.categoryId
      : asCategoryId(existing.category_id);
  if (nextCategoryId !== asCategoryId(existing.category_id)) {
    const lockedTransaction = await db
      .selectFrom('txns')
      .select('public_id')
      .where('project_id', '=', args.projectId)
      .where('sub_category_id', '=', args.input.id)
      .where('locked_at', 'is not', null)
      .executeTakeFirst();
    if (lockedTransaction) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Subcategory cannot be moved while locked transactions use it'
      );
    }

    const duplicate = await db
      .selectFrom('sub_categories')
      .select('id')
      .where('project_id', '=', args.projectId)
      .where('id', '!=', args.input.id)
      .where('category_id', '=', nextCategoryId)
      .where(({ fn, eb }) =>
        eb(fn('lower', ['name']), '=', nextName.toLowerCase())
      )
      .executeTakeFirst();
    if (duplicate) {
      throw new AppError(
        'CONFLICT',
        `Subcategory "${nextName}" already exists in the destination category`
      );
    }
  }
  const patch: Record<string, unknown> = {};
  if (typeof args.input.name === 'string') patch.name = nextName;
  if (typeof args.input.categoryId !== 'undefined') {
    patch.category_id = nextCategoryId;
  }
  if (existing.origin_scope === 'company' && existing.origin_company_item_id) {
    const companyDefaultSubCategory = await db
      .selectFrom('company_default_sub_categories')
      .select(['id', 'name', 'updated_at', 'company_default_category_id'])
      .where('company_id', '=', asCompanyId(existing.company_id))
      .where('id', '=', existing.origin_company_item_id)
      .executeTakeFirst();
    const mappedProjectCategory = companyDefaultSubCategory
      ? await db
          .selectFrom('categories')
          .select('id')
          .where('project_id', '=', args.projectId)
          .where(
            'origin_company_item_id',
            '=',
            companyDefaultSubCategory.company_default_category_id
          )
          .executeTakeFirst()
      : null;

    if (
      companyDefaultSubCategory &&
      mappedProjectCategory &&
      taxonomyNameKey(nextName) ===
        taxonomyNameKey(companyDefaultSubCategory.name) &&
      nextCategoryId === asCategoryId(mappedProjectCategory.id)
    ) {
      Object.assign(
        patch,
        buildInheritedProjectStandardMetadata({
          companyItemId: companyDefaultSubCategory.id,
          sourceUpdatedAt: companyDefaultSubCategory.updated_at,
          nowIso: new Date().toISOString(),
        })
      );
    } else if (existing.sync_status === 'inherited') {
      patch.sync_status = 'overridden';
      patch.last_synced_at = new Date().toISOString();
    }
  }
  const now = new Date().toISOString();
  patch.updated_at = now;

  const updated = await db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom('sub_categories')
      .select(['id', 'category_id', 'updated_at'])
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .forUpdate()
      .executeTakeFirst();
    if (
      !current ||
      current.updated_at.valueOf() !== existing.updated_at.valueOf()
    ) {
      throw new AppError(
        'CONFLICT',
        'Subcategory changed while it was being updated. Refresh and try again.'
      );
    }

    if (nextCategoryId !== asCategoryId(current.category_id)) {
      const targetCategory = await trx
        .selectFrom('categories')
        .select('id')
        .where('project_id', '=', args.projectId)
        .where('id', '=', nextCategoryId)
        .forUpdate()
        .executeTakeFirst();
      if (!targetCategory) {
        throw new AppError('NOT_FOUND', 'Unknown category');
      }
      const duplicate = await trx
        .selectFrom('sub_categories')
        .select('id')
        .where('project_id', '=', args.projectId)
        .where('id', '!=', args.input.id)
        .where('category_id', '=', nextCategoryId)
        .where(({ fn, eb }) =>
          eb(fn('lower', ['name']), '=', nextName.toLowerCase())
        )
        .executeTakeFirst();
      if (duplicate) {
        throw new AppError(
          'CONFLICT',
          `Subcategory "${nextName}" already exists in the destination category`
        );
      }
      const dependentTransactions = await trx
        .selectFrom('txns')
        .select(['public_id', 'locked_at'])
        .where('project_id', '=', args.projectId)
        .where('sub_category_id', '=', args.input.id)
        .orderBy('public_id', 'asc')
        .forUpdate()
        .execute();
      if (dependentTransactions.some((txn) => txn.locked_at)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Subcategory cannot be moved while locked transactions use it'
        );
      }
    }

    const row = await trx
      .updateTable('sub_categories')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .returning(subCategorySelectColumns())
      .executeTakeFirstOrThrow();

    return row;
  });
  return toSubCategory(updated);
}

export async function deleteProjectSubCategory(args: {
  projectId: ProjectId;
  subCategoryId: SubCategory['id'];
  replacementSubCategoryId?: SubCategory['id'];
}) {
  const db = getDb();
  const existing = await db
    .selectFrom('sub_categories')
    .select([
      'id',
      'company_id',
      'origin_scope',
      'origin_company_item_id',
      'sync_status',
    ])
    .where('project_id', '=', args.projectId)
    .where('id', '=', args.subCategoryId)
    .executeTakeFirst();
  if (!existing) return;
  if (existing.origin_scope === 'company' && existing.origin_company_item_id) {
    const companySource = await db
      .selectFrom('company_default_sub_categories')
      .select('id')
      .where('company_id', '=', asCompanyId(existing.company_id))
      .where('id', '=', existing.origin_company_item_id)
      .executeTakeFirst();
    if (companySource) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Company-linked subcategories cannot be deleted while their company default still exists.'
      );
    }
  }

  const lockedTransaction = await db
    .selectFrom('txns')
    .select('public_id')
    .where('project_id', '=', args.projectId)
    .where('sub_category_id', '=', args.subCategoryId)
    .where('locked_at', 'is not', null)
    .executeTakeFirst();
  if (lockedTransaction) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Subcategory cannot be deleted while locked transactions use it'
    );
  }

  const now = new Date().toISOString();
  const replacement = args.replacementSubCategoryId
    ? await db
        .selectFrom('sub_categories')
        .select(['id', 'category_id'])
        .where('project_id', '=', args.projectId)
        .where('id', '=', args.replacementSubCategoryId)
        .executeTakeFirst()
    : null;
  if (args.replacementSubCategoryId && !replacement) {
    throw new AppError('NOT_FOUND', 'Unknown replacement subcategory');
  }
  if (replacement?.id === args.subCategoryId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Replacement subcategory must be different from the deleted subcategory'
    );
  }

  const affectedRules = replacement
    ? await db
        .selectFrom('project_auto_coding_rules')
        .select([
          'id',
          'match_text',
          'origin_scope',
          'origin_company_item_id',
          'sync_status',
        ])
        .where('project_id', '=', args.projectId)
        .where('sub_category_id', '=', args.subCategoryId)
        .execute()
    : [];
  if (replacement && affectedRules.length > 0) {
    const replacementRules = await db
      .selectFrom('project_auto_coding_rules')
      .select('match_text')
      .where('project_id', '=', args.projectId)
      .where('sub_category_id', '=', replacement.id)
      .execute();
    const replacementMatches = new Set(
      replacementRules.map((rule) => rule.match_text.trim().toLowerCase())
    );
    const conflict = affectedRules.find((rule) =>
      replacementMatches.has(rule.match_text.trim().toLowerCase())
    );
    if (conflict) {
      throw new AppError(
        'CONFLICT',
        `Auto-coding rule "${conflict.match_text}" already targets the replacement subcategory`
      );
    }
  }

  await db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom('sub_categories')
      .select('id')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.subCategoryId)
      .forUpdate()
      .executeTakeFirst();
    if (!current) return;

    const dependentTransactions = await trx
      .selectFrom('txns')
      .select(['public_id', 'locked_at'])
      .where('project_id', '=', args.projectId)
      .where('sub_category_id', '=', args.subCategoryId)
      .orderBy('public_id', 'asc')
      .forUpdate()
      .execute();
    if (dependentTransactions.some((txn) => txn.locked_at)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Subcategory cannot be deleted while locked transactions use it'
      );
    }

    if (replacement) {
      for (const rule of affectedRules) {
        const patch: Record<string, unknown> = {
          category_id: replacement.category_id,
          sub_category_id: replacement.id,
          updated_at: now,
        };
        if (
          rule.origin_scope === 'company' &&
          rule.origin_company_item_id &&
          rule.sync_status === 'inherited'
        ) {
          patch.sync_status = 'overridden';
          patch.last_synced_at = now;
        }
        await trx
          .updateTable('project_auto_coding_rules')
          .set(patch)
          .where('project_id', '=', args.projectId)
          .where('id', '=', rule.id)
          .execute();
      }
    }

    await trx
      .updateTable('budget_lines')
      .set({ sub_category_id: null, updated_at: now })
      .where('project_id', '=', args.projectId)
      .where('sub_category_id', '=', args.subCategoryId)
      .execute();

    await trx
      .updateTable('txns')
      .set({
        category_id: null,
        sub_category_id: null,
        company_default_mapping_rule_id: null,
        coding_source: null,
        coding_pending_approval: false,
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('sub_category_id', '=', args.subCategoryId)
      .execute();

    await trx
      .deleteFrom('sub_categories')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.subCategoryId)
      .execute();
  });
}

export async function promoteProjectSubCategoryToCompanyDefault(args: {
  companyId: CompanyId;
  projectId: ProjectId;
  subCategoryId: SubCategory['id'];
  actorUserId: UserId;
}): Promise<PromoteProjectSubCategoryToCompanyDefaultResult> {
  const db = getDb();
  const subCategory = await db
    .selectFrom('sub_categories')
    .innerJoin('categories', 'categories.id', 'sub_categories.category_id')
    .select([
      'sub_categories.id as sub_id',
      'sub_categories.name as sub_name',
      'categories.id as cat_id',
      'categories.name as cat_name',
    ])
    .where('sub_categories.project_id', '=', args.projectId)
    .where('sub_categories.id', '=', args.subCategoryId)
    .executeTakeFirst();
  if (!subCategory) {
    throw new AppError('NOT_FOUND', 'Unknown project subcategory');
  }

  const normalizedCategoryName = subCategory.cat_name.trim();
  const normalizedSubCategoryName = subCategory.sub_name.trim();
  const now = new Date().toISOString();

  return db.transaction().execute(async (trx) => {
    let categoryCreated = false;
    let subCategoryCreated = false;

    let companyDefaultCategory = await trx
      .selectFrom('company_default_categories')
      .select(companyDefaultCategorySelectColumns())
      .where('company_id', '=', args.companyId)
      .where(({ fn, eb }) =>
        eb(fn('lower', ['name']), '=', normalizedCategoryName.toLowerCase())
      )
      .executeTakeFirst();
    if (!companyDefaultCategory) {
      categoryCreated = true;
      companyDefaultCategory = await trx
        .insertInto('company_default_categories')
        .values({
          id: asCompanyDefaultCategoryId(uid('ccat')),
          company_id: args.companyId,
          name: normalizedCategoryName,
          created_at: now,
          updated_at: now,
        })
        .returning(companyDefaultCategorySelectColumns())
        .executeTakeFirstOrThrow();
    }

    let companyDefaultSubCategory = await trx
      .selectFrom('company_default_sub_categories')
      .select(companyDefaultSubCategorySelectColumns())
      .where('company_id', '=', args.companyId)
      .where(
        'company_default_category_id',
        '=',
        companyDefaultCategory.id as CompanyDefaultCategory['id']
      )
      .where(({ fn, eb }) =>
        eb(fn('lower', ['name']), '=', normalizedSubCategoryName.toLowerCase())
      )
      .executeTakeFirst();
    if (!companyDefaultSubCategory) {
      subCategoryCreated = true;
      companyDefaultSubCategory = await trx
        .insertInto('company_default_sub_categories')
        .values({
          id: asCompanyDefaultSubCategoryId(uid('csub')),
          company_id: args.companyId,
          company_default_category_id:
            companyDefaultCategory.id as CompanyDefaultCategory['id'],
          name: normalizedSubCategoryName,
          created_at: now,
          updated_at: now,
        })
        .returning(companyDefaultSubCategorySelectColumns())
        .executeTakeFirstOrThrow();
    }

    await trx
      .updateTable('categories')
      .set({
        name: normalizedCategoryName,
        ...buildInheritedProjectStandardMetadata({
          companyItemId: companyDefaultCategory.id,
          sourceUpdatedAt: companyDefaultCategory.updated_at,
          nowIso: now,
        }),
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('id', '=', subCategory.cat_id)
      .execute();

    await trx
      .updateTable('sub_categories')
      .set({
        category_id: subCategory.cat_id,
        name: normalizedSubCategoryName,
        ...buildInheritedProjectStandardMetadata({
          companyItemId: companyDefaultSubCategory.id,
          sourceUpdatedAt: companyDefaultSubCategory.updated_at,
          nowIso: now,
        }),
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('id', '=', subCategory.sub_id)
      .execute();

    await syncCompanyDefaultTaxonomyChange({
      trx,
      companyId: args.companyId,
      actorUserId: args.actorUserId,
      includeTaxonomy: true,
    });

    return {
      companyDefaultCategoryId: asCompanyDefaultCategoryId(
        companyDefaultCategory.id
      ),
      companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
        companyDefaultSubCategory.id
      ),
      categoryCreated,
      subCategoryCreated,
    };
  });
}

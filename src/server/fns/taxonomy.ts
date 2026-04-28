import { AppError } from '../../api/errors';
import type {
  ApplyCompanyDefaultsResult,
  CompanyDefaultCategoryCreateInput,
  CompanyDefaultMappingRuleCreateInput,
  CompanyDefaultMappingRuleUpdateInput,
  CompanyDefaultCategoryUpdateInput,
  CompanyDefaultSubCategoryCreateInput,
  CompanyDefaultSubCategoryUpdateInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
} from '../../api/types';
import type {
  Category,
  CompanyDefaults,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyId,
  ProjectId,
  SubCategory,
} from '../../types';
import {
  asCategoryId,
  asCompanyId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asSubCategoryId,
} from '../../types';
import { uid } from '../../utils/id';
import {
  categoryNameSchema,
  subCategoryNameSchema,
} from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { defaultCategoryIdForRule } from '../../utils/companyDefaultMappings';
import { planApplyCompanyDefaultTaxonomy } from '../../utils/companyDefaultTaxonomy';
import { requireAuthorized } from '../auth/authorize';
import { getDb } from '../db/db';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import {
  toCategory,
  toCompanyDefaultCategory,
  toCompanyDefaultMappingRule,
  toCompanyDefaultSubCategory,
  toSubCategory,
} from '../mappers/taxonomyRows';

async function requireProjectContext(
  context: ServerFnContextInput,
  projectId: ProjectId,
  action: 'project:view' | 'taxonomy:edit'
): Promise<{ companyId: CompanyId }> {
  const db = getDb();
  const userId = await requireServerUserId(context);
  const project = await db
    .selectFrom('projects')
    .select(['id', 'company_id'])
    .where('id', '=', projectId)
    .executeTakeFirst();
  if (!project) throw new AppError('NOT_FOUND', 'Unknown project');
  const companyId = asCompanyId(project.company_id);
  await requireAuthorized({ db, userId, action, companyId, projectId });
  return { companyId };
}

async function requireCompanyContext(
  context: ServerFnContextInput,
  companyId: CompanyId,
  action: 'company:view' | 'company:edit'
) {
  const db = getDb();
  const userId = await requireServerUserId(context);
  const company = await db
    .selectFrom('companies')
    .select('id')
    .where('id', '=', companyId)
    .executeTakeFirst();
  if (!company) throw new AppError('NOT_FOUND', 'Unknown company');
  await requireAuthorized({ db, userId, action, companyId });
}

export async function listCategoriesServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<Category[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectContext(args.context, args.projectId, 'project:view');
    const db = getDb();
    const rows = await db
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
      .orderBy('name', 'asc')
      .execute();
    return rows.map(toCategory);
  });
}

export async function createCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: CategoryCreateInput;
}): Promise<Category> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { companyId } = await requireProjectContext(
      args.context,
      args.projectId,
      'taxonomy:edit'
    );
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
        company_id: companyId,
        project_id: args.projectId,
        name,
        created_at: now,
        updated_at: now,
      })
      .returning([
        'id',
        'company_id',
        'project_id',
        'name',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toCategory(row);
  });
}

export async function updateCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: CategoryUpdateInput;
}): Promise<Category> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectContext(args.context, args.projectId, 'taxonomy:edit');
    const db = getDb();
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
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown category');

    if (typeof args.input.name === 'string') {
      validateOrThrow(categoryNameSchema, args.input.name);
    }

    const patch: Record<string, unknown> = {};
    if (typeof args.input.name === 'string')
      patch.name = args.input.name.trim();
    patch.updated_at = new Date().toISOString();

    const updated = await db
      .updateTable('categories')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .returning([
        'id',
        'company_id',
        'project_id',
        'name',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toCategory(updated);
  });
}

export async function deleteCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  categoryId: Category['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectContext(args.context, args.projectId, 'taxonomy:edit');
    const db = getDb();

    const existing = await db
      .selectFrom('categories')
      .select('id')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.categoryId)
      .executeTakeFirst();
    if (!existing) return;

    await db.transaction().execute(async (trx) => {
      const subs = await trx
        .selectFrom('sub_categories')
        .select('id')
        .where('project_id', '=', args.projectId)
        .where('category_id', '=', args.categoryId)
        .execute();
      const subIds = subs.map((s) => s.id);

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
          coding_source: 'manual',
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
            coding_source: 'manual',
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
  });
}

export async function listSubCategoriesServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<SubCategory[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectContext(args.context, args.projectId, 'project:view');
    const db = getDb();
    const rows = await db
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
      .orderBy('name', 'asc')
      .execute();
    return rows.map(toSubCategory);
  });
}

export async function createSubCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: SubCategoryCreateInput;
}): Promise<SubCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { companyId } = await requireProjectContext(
      args.context,
      args.projectId,
      'taxonomy:edit'
    );
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
        company_id: companyId,
        project_id: args.projectId,
        category_id: args.input.categoryId,
        name,
        created_at: now,
        updated_at: now,
      })
      .returning([
        'id',
        'company_id',
        'project_id',
        'category_id',
        'name',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();
    return toSubCategory(row);
  });
}

export async function updateSubCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: SubCategoryUpdateInput;
}): Promise<SubCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectContext(args.context, args.projectId, 'taxonomy:edit');
    const db = getDb();
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

    const patch: Record<string, unknown> = {};
    if (typeof args.input.name === 'string')
      patch.name = args.input.name.trim();
    if (typeof args.input.categoryId !== 'undefined')
      patch.category_id = args.input.categoryId;
    patch.updated_at = new Date().toISOString();

    const updated = await db
      .updateTable('sub_categories')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .returning([
        'id',
        'company_id',
        'project_id',
        'category_id',
        'name',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();
    return toSubCategory(updated);
  });
}

export async function deleteSubCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  subCategoryId: SubCategory['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectContext(args.context, args.projectId, 'taxonomy:edit');
    const db = getDb();
    const existing = await db
      .selectFrom('sub_categories')
      .select('id')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.subCategoryId)
      .executeTakeFirst();
    if (!existing) return;

    const now = new Date().toISOString();
    await db.transaction().execute(async (trx) => {
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
          coding_source: 'manual',
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
  });
}

export async function listCompanyDefaultCategoriesServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanyDefaultCategory[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:view');
    const db = getDb();
    const rows = await db
      .selectFrom('company_default_categories')
      .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .where('company_id', '=', args.companyId)
      .orderBy('name', 'asc')
      .execute();
    return rows.map(toCompanyDefaultCategory);
  });
}

export async function getCompanyDefaultsServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanyDefaults> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:view');
    const db = getDb();
    const [categories, subCategories, mappingRules] = await Promise.all([
      db
        .selectFrom('company_default_categories')
        .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
        .where('company_id', '=', args.companyId)
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
        .where('company_id', '=', args.companyId)
        .orderBy('name', 'asc')
        .execute(),
      db
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
    ]);

    return {
      categories: categories.map(toCompanyDefaultCategory),
      subCategories: subCategories.map(toCompanyDefaultSubCategory),
      mappingRules: mappingRules.map(toCompanyDefaultMappingRule),
    };
  });
}

export async function listCompanyDefaultSubCategoriesServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanyDefaultSubCategory[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:view');
    const db = getDb();
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
      .where('company_id', '=', args.companyId)
      .orderBy('name', 'asc')
      .execute();
    return rows.map(toCompanyDefaultSubCategory);
  });
}

export async function listCompanyDefaultMappingRulesServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanyDefaultMappingRule[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:view');
    const db = getDb();
    const rows = await db
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
      .execute();
    return rows.map(toCompanyDefaultMappingRule);
  });
}

export async function createCompanyDefaultCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultCategoryCreateInput;
}): Promise<CompanyDefaultCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:edit');
    validateOrThrow(categoryNameSchema, args.input.name);
    const db = getDb();
    const name = args.input.name.trim();

    const existing = await db
      .selectFrom('company_default_categories')
      .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .where('company_id', '=', args.companyId)
      .where(({ fn, eb }) => eb(fn('lower', ['name']), '=', name.toLowerCase()))
      .executeTakeFirst();
    if (existing) return toCompanyDefaultCategory(existing);

    const id = args.input.id ?? asCompanyDefaultCategoryId(uid('ccat'));
    const now = new Date().toISOString();
    const row = await db
      .insertInto('company_default_categories')
      .values({
        id,
        company_id: args.companyId,
        name,
        created_at: now,
        updated_at: now,
      })
      .returning(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();
    return toCompanyDefaultCategory(row);
  });
}

export async function updateCompanyDefaultCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultCategoryUpdateInput;
}): Promise<CompanyDefaultCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:edit');
    const db = getDb();
    const existing = await db
      .selectFrom('company_default_categories')
      .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing)
      throw new AppError('NOT_FOUND', 'Unknown company default category');
    if (typeof args.input.name === 'string') {
      const nextName = args.input.name.trim();
      validateOrThrow(categoryNameSchema, nextName);
      const duplicate = await db
        .selectFrom('company_default_categories')
        .select('id')
        .where('company_id', '=', args.companyId)
        .where('id', '!=', args.input.id)
        .where(({ fn, eb }) =>
          eb(fn('lower', ['name']), '=', nextName.toLowerCase())
        )
        .executeTakeFirst();
      if (duplicate) {
        throw new AppError(
          'CONFLICT',
          `Company default category "${nextName}" already exists`
        );
      }
    }
    const patch: Record<string, unknown> = {};
    if (typeof args.input.name === 'string')
      patch.name = args.input.name.trim();
    patch.updated_at = new Date().toISOString();
    const updated = await db
      .updateTable('company_default_categories')
      .set(patch)
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.id)
      .returning(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();
    return toCompanyDefaultCategory(updated);
  });
}

export async function deleteCompanyDefaultCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  categoryId: CompanyDefaultCategory['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:edit');
    const db = getDb();
    await db
      .deleteFrom('company_default_categories')
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.categoryId)
      .execute();
  });
}

export async function createCompanyDefaultSubCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultSubCategoryCreateInput;
}): Promise<CompanyDefaultSubCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:edit');
    validateOrThrow(subCategoryNameSchema, args.input.name);
    const db = getDb();
    const name = args.input.name.trim();

    const category = await db
      .selectFrom('company_default_categories')
      .select('id')
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.companyDefaultCategoryId)
      .executeTakeFirst();
    if (!category)
      throw new AppError('NOT_FOUND', 'Unknown company default category');

    const existing = await db
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
      .where(
        'company_default_category_id',
        '=',
        args.input.companyDefaultCategoryId
      )
      .where(({ fn, eb }) => eb(fn('lower', ['name']), '=', name.toLowerCase()))
      .executeTakeFirst();
    if (existing) return toCompanyDefaultSubCategory(existing);

    const id = args.input.id ?? asCompanyDefaultSubCategoryId(uid('csub'));
    const now = new Date().toISOString();
    const row = await db
      .insertInto('company_default_sub_categories')
      .values({
        id,
        company_id: args.companyId,
        company_default_category_id: args.input.companyDefaultCategoryId,
        name,
        created_at: now,
        updated_at: now,
      })
      .returning([
        'id',
        'company_id',
        'company_default_category_id',
        'name',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();
    return toCompanyDefaultSubCategory(row);
  });
}

export async function updateCompanyDefaultSubCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultSubCategoryUpdateInput;
}): Promise<CompanyDefaultSubCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:edit');
    const db = getDb();
    const existing = await db
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
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing)
      throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    if (typeof args.input.name === 'string') {
      validateOrThrow(subCategoryNameSchema, args.input.name);
    }
    if (typeof args.input.companyDefaultCategoryId !== 'undefined') {
      const category = await db
        .selectFrom('company_default_categories')
        .select('id')
        .where('company_id', '=', args.companyId)
        .where('id', '=', args.input.companyDefaultCategoryId)
        .executeTakeFirst();
      if (!category)
        throw new AppError('NOT_FOUND', 'Unknown company default category');
    }
    const nextCategoryId =
      args.input.companyDefaultCategoryId ??
      asCompanyDefaultCategoryId(existing.company_default_category_id);
    const nextName = (
      typeof args.input.name === 'string' ? args.input.name : existing.name
    ).trim();
    const duplicate = await db
      .selectFrom('company_default_sub_categories')
      .select('id')
      .where('company_id', '=', args.companyId)
      .where('id', '!=', args.input.id)
      .where('company_default_category_id', '=', nextCategoryId)
      .where(({ fn, eb }) =>
        eb(fn('lower', ['name']), '=', nextName.toLowerCase())
      )
      .executeTakeFirst();
    if (duplicate) {
      throw new AppError(
        'CONFLICT',
        `Company default subcategory "${nextName}" already exists in this category`
      );
    }
    const patch: Record<string, unknown> = {};
    if (typeof args.input.name === 'string') patch.name = nextName;
    if (typeof args.input.companyDefaultCategoryId !== 'undefined') {
      patch.company_default_category_id = args.input.companyDefaultCategoryId;
    }
    patch.updated_at = new Date().toISOString();
    const updated = await db
      .updateTable('company_default_sub_categories')
      .set(patch)
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.id)
      .returning([
        'id',
        'company_id',
        'company_default_category_id',
        'name',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();
    return toCompanyDefaultSubCategory(updated);
  });
}

export async function deleteCompanyDefaultSubCategoryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  subCategoryId: CompanyDefaultSubCategory['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:edit');
    const db = getDb();
    await db
      .deleteFrom('company_default_sub_categories')
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.subCategoryId)
      .execute();
  });
}

export async function createCompanyDefaultMappingRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultMappingRuleCreateInput;
}): Promise<CompanyDefaultMappingRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:edit');
    validateOrThrow(subCategoryNameSchema, args.input.matchText);
    const db = getDb();
    const matchText = args.input.matchText.trim();

    const category = await db
      .selectFrom('company_default_categories')
      .select('id')
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.companyDefaultCategoryId)
      .executeTakeFirst();
    if (!category)
      throw new AppError('NOT_FOUND', 'Unknown company default category');

    const subCategory = await db
      .selectFrom('company_default_sub_categories')
      .select(['id', 'company_default_category_id'])
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.companyDefaultSubCategoryId)
      .executeTakeFirst();
    if (!subCategory)
      throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    if (
      subCategory.company_default_category_id !==
      args.input.companyDefaultCategoryId
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Subcategory does not belong to the selected company default category'
      );
    }

    const existing = await db
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
      .where(({ fn, eb }) =>
        eb(fn('lower', ['match_text']), '=', matchText.toLowerCase())
      )
      .where(
        'company_default_sub_category_id',
        '=',
        args.input.companyDefaultSubCategoryId
      )
      .executeTakeFirst();
    if (existing) return toCompanyDefaultMappingRule(existing);

    const maxSort = await db
      .selectFrom('company_default_mapping_rules')
      .select(({ fn }) => fn.max<number>('sort_order').as('max_sort_order'))
      .where('company_id', '=', args.companyId)
      .executeTakeFirst();
    const nextSortOrder =
      typeof args.input.sortOrder === 'number'
        ? args.input.sortOrder
        : Number(maxSort?.max_sort_order ?? -1) + 1;
    const now = new Date().toISOString();
    const row = await db
      .insertInto('company_default_mapping_rules')
      .values({
        id: args.input.id ?? asCompanyDefaultMappingRuleId(uid('cmap')),
        company_id: args.companyId,
        match_text: matchText,
        company_default_category_id: args.input.companyDefaultCategoryId,
        company_default_sub_category_id: args.input.companyDefaultSubCategoryId,
        sort_order: nextSortOrder,
        created_at: now,
        updated_at: now,
      })
      .returning([
        'id',
        'company_id',
        'match_text',
        'company_default_category_id',
        'company_default_sub_category_id',
        'sort_order',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();
    return toCompanyDefaultMappingRule(row);
  });
}

export async function updateCompanyDefaultMappingRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  input: CompanyDefaultMappingRuleUpdateInput;
}): Promise<CompanyDefaultMappingRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:edit');
    const db = getDb();
    const existing = await db
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
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing)
      throw new AppError('NOT_FOUND', 'Unknown company default mapping rule');

    if (typeof args.input.matchText === 'string') {
      validateOrThrow(subCategoryNameSchema, args.input.matchText);
    }

    const subCategories = await db
      .selectFrom('company_default_sub_categories')
      .select(['id', 'company_default_category_id'])
      .where('company_id', '=', args.companyId)
      .execute();
    const nextSubCategoryId =
      args.input.companyDefaultSubCategoryId ??
      asCompanyDefaultSubCategoryId(existing.company_default_sub_category_id);
    const nextCategoryId =
      args.input.companyDefaultCategoryId ??
      defaultCategoryIdForRule(
        nextSubCategoryId,
        subCategories.map((row) => ({
          id: asCompanyDefaultSubCategoryId(row.id),
          companyId: args.companyId,
          companyDefaultCategoryId: asCompanyDefaultCategoryId(
            row.company_default_category_id
          ),
          name: '',
        }))
      ) ??
      asCompanyDefaultCategoryId(existing.company_default_category_id);

    const category = await db
      .selectFrom('company_default_categories')
      .select('id')
      .where('company_id', '=', args.companyId)
      .where('id', '=', nextCategoryId)
      .executeTakeFirst();
    if (!category)
      throw new AppError('NOT_FOUND', 'Unknown company default category');

    const subCategory = subCategories.find(
      (row) => row.id === nextSubCategoryId
    );
    if (!subCategory)
      throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    if (subCategory.company_default_category_id !== nextCategoryId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Subcategory does not belong to the selected company default category'
      );
    }

    const nextMatchText =
      typeof args.input.matchText === 'string'
        ? args.input.matchText.trim()
        : existing.match_text;
    const duplicate = await db
      .selectFrom('company_default_mapping_rules')
      .select('id')
      .where('company_id', '=', args.companyId)
      .where('id', '!=', args.input.id)
      .where(({ fn, eb }) =>
        eb(fn('lower', ['match_text']), '=', nextMatchText.toLowerCase())
      )
      .where('company_default_sub_category_id', '=', nextSubCategoryId)
      .executeTakeFirst();
    if (duplicate) {
      throw new AppError(
        'CONFLICT',
        `Default mapping "${nextMatchText}" already points to this subcategory`
      );
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof args.input.matchText === 'string')
      patch.match_text = nextMatchText;
    if (typeof args.input.companyDefaultCategoryId !== 'undefined') {
      patch.company_default_category_id = nextCategoryId;
    }
    if (typeof args.input.companyDefaultSubCategoryId !== 'undefined') {
      patch.company_default_sub_category_id = nextSubCategoryId;
    }
    if (typeof args.input.sortOrder === 'number')
      patch.sort_order = args.input.sortOrder;

    const updated = await db
      .updateTable('company_default_mapping_rules')
      .set(patch)
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.id)
      .returning([
        'id',
        'company_id',
        'match_text',
        'company_default_category_id',
        'company_default_sub_category_id',
        'sort_order',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();
    return toCompanyDefaultMappingRule(updated);
  });
}

export async function deleteCompanyDefaultMappingRuleServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  ruleId: CompanyDefaultMappingRule['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireCompanyContext(args.context, args.companyId, 'company:edit');
    const db = getDb();
    await db
      .deleteFrom('company_default_mapping_rules')
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.ruleId)
      .execute();
  });
}

export async function applyCompanyDefaultTaxonomyServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<ApplyCompanyDefaultsResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { companyId } = await requireProjectContext(
      args.context,
      args.projectId,
      'taxonomy:edit'
    );
    const db = getDb();

    const defaultCategories = await db
      .selectFrom('company_default_categories')
      .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .where('company_id', '=', companyId)
      .orderBy('name', 'asc')
      .execute();
    const defaultSubCategories = await db
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
    const projectCategories = await db
      .selectFrom('categories')
      .select(['id', 'name'])
      .where('project_id', '=', args.projectId)
      .execute();
    const projectSubCategories = await db
      .selectFrom('sub_categories')
      .select(['id', 'category_id', 'name'])
      .where('project_id', '=', args.projectId)
      .execute();

    const now = new Date().toISOString();
    const plan = planApplyCompanyDefaultTaxonomy({
      companyId,
      projectId: args.projectId,
      defaultCategories: defaultCategories.map(toCompanyDefaultCategory),
      defaultSubCategories: defaultSubCategories.map(
        toCompanyDefaultSubCategory
      ),
      projectCategories: projectCategories.map((row) => ({
        id: asCategoryId(row.id),
        name: row.name,
      })),
      projectSubCategories: projectSubCategories.map((row) => ({
        categoryId: asCategoryId(row.category_id),
        name: row.name,
      })),
      createCategoryId: () => asCategoryId(uid('cat')),
      createSubCategoryId: () => asSubCategoryId(uid('sub')),
      nowIso: now,
    });

    await db.transaction().execute(async (trx) => {
      if (plan.categoriesToCreate.length) {
        await trx
          .insertInto('categories')
          .values(
            plan.categoriesToCreate.map((category) => ({
              id: category.id,
              company_id: category.companyId,
              project_id: category.projectId,
              name: category.name,
              created_at: category.createdAt ?? now,
              updated_at: category.updatedAt ?? now,
            }))
          )
          .execute();
      }

      if (plan.subCategoriesToCreate.length) {
        await trx
          .insertInto('sub_categories')
          .values(
            plan.subCategoriesToCreate.map((subCategory) => ({
              id: subCategory.id,
              company_id: subCategory.companyId,
              project_id: subCategory.projectId,
              category_id: subCategory.categoryId,
              name: subCategory.name,
              created_at: subCategory.createdAt ?? now,
              updated_at: subCategory.updatedAt ?? now,
            }))
          )
          .execute();
      }
    });

    return plan.result;
  });
}

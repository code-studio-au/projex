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
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyId,
  ProjectId,
  SubCategory,
} from '../../types';
import {
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asSubCategoryId,
} from '../../types';
import { uid } from '../../utils/id';
import { categoryNameSchema, subCategoryNameSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { defaultCategoryIdForRule } from '../../utils/companyDefaultMappings';
import { requireAuthorized } from '../auth/authorize';
import { getDb } from '../db/db';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

type CategoryRow = {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type SubCategoryRow = {
  id: string;
  company_id: string;
  project_id: string;
  category_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

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

type CompanyDefaultMappingRuleRow = {
  id: string;
  company_id: string;
  match_text: string;
  company_default_category_id: string;
  company_default_sub_category_id: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function toCategory(row: CategoryRow): Category {
  return {
    id: asCategoryId(row.id),
    companyId: row.company_id as CompanyId,
    projectId: row.project_id as ProjectId,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSubCategory(row: SubCategoryRow): SubCategory {
  return {
    id: asSubCategoryId(row.id),
    companyId: row.company_id as CompanyId,
    projectId: row.project_id as ProjectId,
    categoryId: asCategoryId(row.category_id),
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCompanyDefaultCategory(row: CompanyDefaultCategoryRow): CompanyDefaultCategory {
  return {
    id: asCompanyDefaultCategoryId(row.id),
    companyId: row.company_id as CompanyId,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCompanyDefaultSubCategory(
  row: CompanyDefaultSubCategoryRow
): CompanyDefaultSubCategory {
  return {
    id: asCompanyDefaultSubCategoryId(row.id),
    companyId: row.company_id as CompanyId,
    companyDefaultCategoryId: asCompanyDefaultCategoryId(row.company_default_category_id),
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCompanyDefaultMappingRule(
  row: CompanyDefaultMappingRuleRow
): CompanyDefaultMappingRule {
  return {
    id: asCompanyDefaultMappingRuleId(row.id),
    companyId: row.company_id as CompanyId,
    matchText: row.match_text,
    companyDefaultCategoryId: asCompanyDefaultCategoryId(row.company_default_category_id),
    companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(row.company_default_sub_category_id),
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
  const companyId = project.company_id as CompanyId;
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
  const company = await db.selectFrom('companies').select('id').where('id', '=', companyId).executeTakeFirst();
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
      .select(['id', 'company_id', 'project_id', 'name', 'created_at', 'updated_at'])
      .where('project_id', '=', args.projectId)
      .orderBy('name', 'asc')
      .execute();
    return rows.map((r) => toCategory(r as CategoryRow));
  });
}

export async function createCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: CategoryCreateInput;
}): Promise<Category> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { companyId } = await requireProjectContext(args.context, args.projectId, 'taxonomy:edit');
    validateOrThrow(categoryNameSchema, args.input.name);
    const db = getDb();
    const name = args.input.name.trim();

    const existing = await db
      .selectFrom('categories')
      .select(['id', 'company_id', 'project_id', 'name', 'created_at', 'updated_at'])
      .where('project_id', '=', args.projectId)
      .where(({ fn, eb }) => eb(fn('lower', ['name']), '=', name.toLowerCase()))
      .executeTakeFirst();
    if (existing) return toCategory(existing as CategoryRow);

    const id = args.input.id ?? asCategoryId(uid('cat'));
    const now = new Date().toISOString();
    const row = await db
      .insertInto('categories')
      .values({
        id,
        company_id: companyId,
        project_id: args.projectId,
        name,
        created_at: args.input.createdAt ?? now,
        updated_at: now,
      })
      .returning(['id', 'company_id', 'project_id', 'name', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();

    return toCategory(row as CategoryRow);
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
      .select(['id', 'company_id', 'project_id', 'name', 'created_at', 'updated_at'])
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown category');

    if (typeof args.input.name === 'string') {
      validateOrThrow(categoryNameSchema, args.input.name);
    }

    const patch: Record<string, unknown> = {};
    if (typeof args.input.name === 'string') patch.name = args.input.name.trim();
    if ('createdAt' in args.input) patch.created_at = args.input.createdAt ?? null;
    if ('updatedAt' in args.input) patch.updated_at = args.input.updatedAt ?? null;
    patch.updated_at = new Date().toISOString();

    const updated = await db
      .updateTable('categories')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .returning(['id', 'company_id', 'project_id', 'name', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();

    return toCategory(updated as CategoryRow);
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
        .set({ category_id: null, sub_category_id: null, updated_at: new Date().toISOString() })
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
      .select(['id', 'company_id', 'project_id', 'category_id', 'name', 'created_at', 'updated_at'])
      .where('project_id', '=', args.projectId)
      .orderBy('name', 'asc')
      .execute();
    return rows.map((r) => toSubCategory(r as SubCategoryRow));
  });
}

export async function createSubCategoryServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: SubCategoryCreateInput;
}): Promise<SubCategory> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { companyId } = await requireProjectContext(args.context, args.projectId, 'taxonomy:edit');
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
      .select(['id', 'company_id', 'project_id', 'category_id', 'name', 'created_at', 'updated_at'])
      .where('project_id', '=', args.projectId)
      .where('category_id', '=', args.input.categoryId)
      .where(({ fn, eb }) => eb(fn('lower', ['name']), '=', name.toLowerCase()))
      .executeTakeFirst();
    if (existing) return toSubCategory(existing as SubCategoryRow);

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
        created_at: args.input.createdAt ?? now,
        updated_at: now,
      })
      .returning(['id', 'company_id', 'project_id', 'category_id', 'name', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();
    return toSubCategory(row as SubCategoryRow);
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
      .select(['id', 'company_id', 'project_id', 'category_id', 'name', 'created_at', 'updated_at'])
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
    if (typeof args.input.name === 'string') patch.name = args.input.name.trim();
    if (typeof args.input.categoryId !== 'undefined') patch.category_id = args.input.categoryId;
    if ('createdAt' in args.input) patch.created_at = args.input.createdAt ?? null;
    if ('updatedAt' in args.input) patch.updated_at = args.input.updatedAt ?? null;
    patch.updated_at = new Date().toISOString();

    const updated = await db
      .updateTable('sub_categories')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .returning(['id', 'company_id', 'project_id', 'category_id', 'name', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();
    return toSubCategory(updated as SubCategoryRow);
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
    return rows.map((row) => toCompanyDefaultCategory(row as CompanyDefaultCategoryRow));
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
    return rows.map((row) => toCompanyDefaultSubCategory(row as CompanyDefaultSubCategoryRow));
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
    return rows.map((row) => toCompanyDefaultMappingRule(row as CompanyDefaultMappingRuleRow));
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
    if (existing) return toCompanyDefaultCategory(existing as CompanyDefaultCategoryRow);

    const id = args.input.id ?? asCompanyDefaultCategoryId(uid('ccat'));
    const now = new Date().toISOString();
    const row = await db
      .insertInto('company_default_categories')
      .values({
        id,
        company_id: args.companyId,
        name,
        created_at: args.input.createdAt ?? now,
        updated_at: now,
      })
      .returning(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();
    return toCompanyDefaultCategory(row as CompanyDefaultCategoryRow);
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
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown company default category');
    if (typeof args.input.name === 'string') {
      const nextName = args.input.name.trim();
      validateOrThrow(categoryNameSchema, nextName);
      const duplicate = await db
        .selectFrom('company_default_categories')
        .select('id')
        .where('company_id', '=', args.companyId)
        .where('id', '!=', args.input.id)
        .where(({ fn, eb }) => eb(fn('lower', ['name']), '=', nextName.toLowerCase()))
        .executeTakeFirst();
      if (duplicate) {
        throw new AppError(
          'CONFLICT',
          `Company default category "${nextName}" already exists`
        );
      }
    }
    const patch: Record<string, unknown> = {};
    if (typeof args.input.name === 'string') patch.name = args.input.name.trim();
    patch.updated_at = new Date().toISOString();
    const updated = await db
      .updateTable('company_default_categories')
      .set(patch)
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.id)
      .returning(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();
    return toCompanyDefaultCategory(updated as CompanyDefaultCategoryRow);
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
    if (!category) throw new AppError('NOT_FOUND', 'Unknown company default category');

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
      .where('company_default_category_id', '=', args.input.companyDefaultCategoryId)
      .where(({ fn, eb }) => eb(fn('lower', ['name']), '=', name.toLowerCase()))
      .executeTakeFirst();
    if (existing) return toCompanyDefaultSubCategory(existing as CompanyDefaultSubCategoryRow);

    const id = args.input.id ?? asCompanyDefaultSubCategoryId(uid('csub'));
    const now = new Date().toISOString();
    const row = await db
      .insertInto('company_default_sub_categories')
      .values({
        id,
        company_id: args.companyId,
        company_default_category_id: args.input.companyDefaultCategoryId,
        name,
        created_at: args.input.createdAt ?? now,
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
    return toCompanyDefaultSubCategory(row as CompanyDefaultSubCategoryRow);
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
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
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
      if (!category) throw new AppError('NOT_FOUND', 'Unknown company default category');
    }
    const nextCategoryId = args.input.companyDefaultCategoryId ?? asCompanyDefaultCategoryId(existing.company_default_category_id);
    const nextName = (typeof args.input.name === 'string' ? args.input.name : existing.name).trim();
    const duplicate = await db
      .selectFrom('company_default_sub_categories')
      .select('id')
      .where('company_id', '=', args.companyId)
      .where('id', '!=', args.input.id)
      .where('company_default_category_id', '=', nextCategoryId)
      .where(({ fn, eb }) => eb(fn('lower', ['name']), '=', nextName.toLowerCase()))
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
    return toCompanyDefaultSubCategory(updated as CompanyDefaultSubCategoryRow);
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
    if (!category) throw new AppError('NOT_FOUND', 'Unknown company default category');

    const subCategory = await db
      .selectFrom('company_default_sub_categories')
      .select(['id', 'company_default_category_id'])
      .where('company_id', '=', args.companyId)
      .where('id', '=', args.input.companyDefaultSubCategoryId)
      .executeTakeFirst();
    if (!subCategory) throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    if (subCategory.company_default_category_id !== args.input.companyDefaultCategoryId) {
      throw new AppError('VALIDATION_ERROR', 'Subcategory does not belong to the selected company default category');
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
      .where(({ fn, eb }) => eb(fn('lower', ['match_text']), '=', matchText.toLowerCase()))
      .where('company_default_sub_category_id', '=', args.input.companyDefaultSubCategoryId)
      .executeTakeFirst();
    if (existing) return toCompanyDefaultMappingRule(existing as CompanyDefaultMappingRuleRow);

    const maxSort = await db
      .selectFrom('company_default_mapping_rules')
      .select(({ fn }) => fn.max<number>('sort_order').as('max_sort_order'))
      .where('company_id', '=', args.companyId)
      .executeTakeFirst();
    const nextSortOrder =
      typeof args.input.sortOrder === 'number'
        ? args.input.sortOrder
        : (Number(maxSort?.max_sort_order ?? -1) + 1);
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
        created_at: args.input.createdAt ?? now,
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
    return toCompanyDefaultMappingRule(row as CompanyDefaultMappingRuleRow);
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
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown company default mapping rule');

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
          companyDefaultCategoryId: asCompanyDefaultCategoryId(row.company_default_category_id),
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
    if (!category) throw new AppError('NOT_FOUND', 'Unknown company default category');

    const subCategory = subCategories.find((row) => row.id === nextSubCategoryId);
    if (!subCategory) throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    if (subCategory.company_default_category_id !== nextCategoryId) {
      throw new AppError('VALIDATION_ERROR', 'Subcategory does not belong to the selected company default category');
    }

    const nextMatchText =
      typeof args.input.matchText === 'string' ? args.input.matchText.trim() : existing.match_text;
    const duplicate = await db
      .selectFrom('company_default_mapping_rules')
      .select('id')
      .where('company_id', '=', args.companyId)
      .where('id', '!=', args.input.id)
      .where(({ fn, eb }) => eb(fn('lower', ['match_text']), '=', nextMatchText.toLowerCase()))
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
    if (typeof args.input.matchText === 'string') patch.match_text = nextMatchText;
    if (typeof args.input.companyDefaultCategoryId !== 'undefined') {
      patch.company_default_category_id = nextCategoryId;
    }
    if (typeof args.input.companyDefaultSubCategoryId !== 'undefined') {
      patch.company_default_sub_category_id = nextSubCategoryId;
    }
    if (typeof args.input.sortOrder === 'number') patch.sort_order = args.input.sortOrder;

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
    return toCompanyDefaultMappingRule(updated as CompanyDefaultMappingRuleRow);
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
    const { companyId } = await requireProjectContext(args.context, args.projectId, 'taxonomy:edit');
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

    const companyDefaultsConfigured = defaultCategories.length > 0;
    let categoriesAdded = 0;
    let subCategoriesAdded = 0;
    const now = new Date().toISOString();
    const categoryIdByName = new Map(
      projectCategories.map((row) => [row.name.trim().toLowerCase(), asCategoryId(row.id)])
    );
    const subCategoryNamesByCategoryId = new Map<string, Set<string>>();
    for (const subCategory of projectSubCategories) {
      const set = subCategoryNamesByCategoryId.get(subCategory.category_id) ?? new Set<string>();
      set.add(subCategory.name.trim().toLowerCase());
      subCategoryNamesByCategoryId.set(subCategory.category_id, set);
    }

    await db.transaction().execute(async (trx) => {
      for (const defaultCategory of defaultCategories) {
        const categoryKey = defaultCategory.name.trim().toLowerCase();
        let projectCategoryId = categoryIdByName.get(categoryKey);
        if (!projectCategoryId) {
          projectCategoryId = asCategoryId(uid('cat'));
          await trx
            .insertInto('categories')
            .values({
              id: projectCategoryId,
              company_id: companyId,
              project_id: args.projectId,
              name: defaultCategory.name,
              created_at: now,
              updated_at: now,
            })
            .execute();
          categoryIdByName.set(categoryKey, projectCategoryId);
          subCategoryNamesByCategoryId.set(projectCategoryId, new Set<string>());
          categoriesAdded += 1;
        }

        const existingSubNames = subCategoryNamesByCategoryId.get(projectCategoryId) ?? new Set<string>();
        for (const defaultSubCategory of defaultSubCategories) {
          if (defaultSubCategory.company_default_category_id !== defaultCategory.id) continue;
          const subCategoryKey = defaultSubCategory.name.trim().toLowerCase();
          if (existingSubNames.has(subCategoryKey)) continue;
          await trx
            .insertInto('sub_categories')
            .values({
              id: asSubCategoryId(uid('sub')),
              company_id: companyId,
              project_id: args.projectId,
              category_id: projectCategoryId,
              name: defaultSubCategory.name,
              created_at: now,
              updated_at: now,
            })
            .execute();
          existingSubNames.add(subCategoryKey);
          subCategoriesAdded += 1;
        }
        subCategoryNamesByCategoryId.set(projectCategoryId, existingSubNames);
      }
    });

    return { companyDefaultsConfigured, categoriesAdded, subCategoriesAdded };
  });
}

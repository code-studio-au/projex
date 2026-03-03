import { AppError } from '../../api/errors';
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
} from '../../api/types';
import type { Category, CompanyId, ProjectId, SubCategory } from '../../types';
import { asCategoryId, asSubCategoryId } from '../../types';
import { uid } from '../../utils/id';
import { categoryNameSchema, subCategoryNameSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
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
        .set({ category_id: null, sub_category_id: null, updated_at: new Date().toISOString() })
        .where('project_id', '=', args.projectId)
        .where('category_id', '=', args.categoryId)
        .execute();

      if (subIds.length) {
        await trx
          .updateTable('txns')
          .set({ sub_category_id: null, updated_at: new Date().toISOString() })
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
        .set({ sub_category_id: null, updated_at: now })
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

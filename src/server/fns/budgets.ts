import { AppError } from '../../api/errors';
import type { BudgetCreateInput, BudgetUpdateInput } from '../../api/types';
import type { BudgetLine, CompanyId, ProjectId } from '../../types';
import { asBudgetLineId, asCategoryId, asSubCategoryId } from '../../types';
import { uid } from '../../utils/id';
import { budgetAllocatedCentsSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { requireAuthorized } from '../auth/authorize';
import { getDb } from '../db/db';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

type BudgetRow = {
  id: string;
  company_id: string;
  project_id: string;
  category_id: string | null;
  sub_category_id: string | null;
  allocated_cents: number;
  created_at: string;
  updated_at: string;
};

function toBudget(row: BudgetRow): BudgetLine {
  return {
    id: asBudgetLineId(row.id),
    companyId: row.company_id as CompanyId,
    projectId: row.project_id as ProjectId,
    categoryId: row.category_id ? asCategoryId(row.category_id) : undefined,
    subCategoryId: row.sub_category_id ? asSubCategoryId(row.sub_category_id) : undefined,
    allocatedCents: Number(row.allocated_cents),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireProjectContext(
  context: ServerFnContextInput,
  projectId: ProjectId,
  action: 'project:view' | 'budget:edit'
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

export async function listBudgetsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<BudgetLine[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectContext(args.context, args.projectId, 'project:view');
    const db = getDb();
    const rows = await db
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
      .where('project_id', '=', args.projectId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map((r) => toBudget(r as BudgetRow));
  });
}

export async function createBudgetServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: BudgetCreateInput;
}): Promise<BudgetLine> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { companyId } = await requireProjectContext(args.context, args.projectId, 'budget:edit');
    validateOrThrow(budgetAllocatedCentsSchema, args.input.allocatedCents);
    const db = getDb();

    if (args.input.categoryId) {
      const category = await db
        .selectFrom('categories')
        .select('id')
        .where('project_id', '=', args.projectId)
        .where('id', '=', args.input.categoryId)
        .executeTakeFirst();
      if (!category) throw new AppError('NOT_FOUND', 'Unknown category');
    }
    if (args.input.subCategoryId) {
      const sub = await db
        .selectFrom('sub_categories')
        .select(['id', 'category_id'])
        .where('project_id', '=', args.projectId)
        .where('id', '=', args.input.subCategoryId)
        .executeTakeFirst();
      if (!sub) throw new AppError('NOT_FOUND', 'Unknown subcategory');
      if (args.input.categoryId && sub.category_id !== args.input.categoryId) {
        throw new AppError('VALIDATION_ERROR', 'Subcategory does not belong to category');
      }
    }

    const existingRows = await db
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
      .where('project_id', '=', args.projectId)
      .execute();
    const existing = existingRows.find((b) => b.sub_category_id === (args.input.subCategoryId ?? null));
    if (existing) {
      if (existing.category_id !== (args.input.categoryId ?? null)) {
        const updated = await db
          .updateTable('budget_lines')
          .set({
            category_id: args.input.categoryId ?? null,
            updated_at: new Date().toISOString(),
          })
          .where('project_id', '=', args.projectId)
          .where('id', '=', existing.id)
          .returning([
            'id',
            'company_id',
            'project_id',
            'category_id',
            'sub_category_id',
            'allocated_cents',
            'created_at',
            'updated_at',
          ])
          .executeTakeFirstOrThrow();
        return toBudget(updated as BudgetRow);
      }
      return toBudget(existing as BudgetRow);
    }

    const id = args.input.id ?? asBudgetLineId(uid('bud'));
    const now = new Date().toISOString();
    const row = await db
      .insertInto('budget_lines')
      .values({
        id,
        company_id: companyId,
        project_id: args.projectId,
        category_id: args.input.categoryId ?? null,
        sub_category_id: args.input.subCategoryId ?? null,
        allocated_cents: args.input.allocatedCents,
        created_at: now,
        updated_at: now,
      })
      .returning([
        'id',
        'company_id',
        'project_id',
        'category_id',
        'sub_category_id',
        'allocated_cents',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();
    return toBudget(row as BudgetRow);
  });
}

export async function updateBudgetServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: BudgetUpdateInput;
}): Promise<BudgetLine> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectContext(args.context, args.projectId, 'budget:edit');
    const db = getDb();
    const existing = await db
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
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown budget');

    if (typeof args.input.allocatedCents !== 'undefined') {
      validateOrThrow(budgetAllocatedCentsSchema, args.input.allocatedCents);
    }
    const nextCategoryId = Object.prototype.hasOwnProperty.call(args.input, 'categoryId')
      ? args.input.categoryId
      : (existing.category_id ?? undefined);
    const nextSubCategoryId = Object.prototype.hasOwnProperty.call(args.input, 'subCategoryId')
      ? args.input.subCategoryId
      : (existing.sub_category_id ?? undefined);

    if (nextCategoryId) {
      const category = await db
        .selectFrom('categories')
        .select('id')
        .where('project_id', '=', args.projectId)
        .where('id', '=', nextCategoryId)
        .executeTakeFirst();
      if (!category) throw new AppError('NOT_FOUND', 'Unknown category');
    }
    if (nextSubCategoryId) {
      const sub = await db
        .selectFrom('sub_categories')
        .select(['id', 'category_id'])
        .where('project_id', '=', args.projectId)
        .where('id', '=', nextSubCategoryId)
        .executeTakeFirst();
      if (!sub) throw new AppError('NOT_FOUND', 'Unknown subcategory');
      if (nextCategoryId && sub.category_id !== nextCategoryId) {
        throw new AppError('VALIDATION_ERROR', 'Subcategory does not belong to category');
      }
    }

    const patch: Record<string, unknown> = {};
    if (typeof args.input.allocatedCents !== 'undefined') patch.allocated_cents = args.input.allocatedCents;
    if (Object.prototype.hasOwnProperty.call(args.input, 'categoryId')) {
      patch.category_id = args.input.categoryId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(args.input, 'subCategoryId')) {
      patch.sub_category_id = args.input.subCategoryId ?? null;
    }
    patch.updated_at = new Date().toISOString();

    const updated = await db
      .updateTable('budget_lines')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .returning([
        'id',
        'company_id',
        'project_id',
        'category_id',
        'sub_category_id',
        'allocated_cents',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();
    return toBudget(updated as BudgetRow);
  });
}

export async function deleteBudgetServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  budgetId: BudgetLine['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    await requireProjectContext(args.context, args.projectId, 'budget:edit');
    const db = getDb();
    await db
      .deleteFrom('budget_lines')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.budgetId)
      .execute();
  });
}

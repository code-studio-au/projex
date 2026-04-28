import type { Selectable } from 'kysely';

import { AppError } from '../../api/errors';
import type { BudgetCreateInput, BudgetUpdateInput } from '../../api/types';
import type { BudgetLine, ProjectId } from '../../types';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
} from '../../types';
import { uid } from '../../utils/id';
import { budgetAllocatedCentsSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import type { BudgetLineTable } from '../db/schema';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import {
  assertCategoryInProject,
  assertSubCategoryInProject,
  requireProjectForAction,
} from './resourceGuards';

type BudgetRow = Selectable<BudgetLineTable>;

function toBudget(row: BudgetRow): BudgetLine {
  return {
    id: asBudgetLineId(row.id),
    companyId: asCompanyId(row.company_id),
    projectId: asProjectId(row.project_id),
    categoryId: row.category_id ? asCategoryId(row.category_id) : undefined,
    subCategoryId: row.sub_category_id
      ? asSubCategoryId(row.sub_category_id)
      : undefined,
    allocatedCents: Number(row.allocated_cents),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBudgetsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<BudgetLine[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );
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
    return rows.map(toBudget);
  });
}

export async function createBudgetServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: BudgetCreateInput;
}): Promise<BudgetLine> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, companyId } = await requireProjectForAction(
      args.context,
      args.projectId,
      'budget:edit'
    );
    validateOrThrow(budgetAllocatedCentsSchema, args.input.allocatedCents);

    if (args.input.categoryId) {
      await assertCategoryInProject({
        db,
        projectId: args.projectId,
        categoryId: args.input.categoryId,
      });
    }
    if (args.input.subCategoryId) {
      await assertSubCategoryInProject({
        db,
        projectId: args.projectId,
        subCategoryId: args.input.subCategoryId,
        categoryId: args.input.categoryId,
      });
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
    const existing = existingRows.find(
      (b) => b.sub_category_id === (args.input.subCategoryId ?? null)
    );
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
        return toBudget(updated);
      }
      return toBudget(existing);
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
    return toBudget(row);
  });
}

export async function updateBudgetServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: BudgetUpdateInput;
}): Promise<BudgetLine> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireProjectForAction(
      args.context,
      args.projectId,
      'budget:edit'
    );
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
    const nextCategoryId = Object.prototype.hasOwnProperty.call(
      args.input,
      'categoryId'
    )
      ? args.input.categoryId
      : existing.category_id
        ? asCategoryId(existing.category_id)
        : undefined;
    const nextSubCategoryId = Object.prototype.hasOwnProperty.call(
      args.input,
      'subCategoryId'
    )
      ? args.input.subCategoryId
      : existing.sub_category_id
        ? asSubCategoryId(existing.sub_category_id)
        : undefined;

    if (nextCategoryId) {
      await assertCategoryInProject({
        db,
        projectId: args.projectId,
        categoryId: nextCategoryId,
      });
    }
    if (nextSubCategoryId) {
      await assertSubCategoryInProject({
        db,
        projectId: args.projectId,
        subCategoryId: nextSubCategoryId,
        categoryId: nextCategoryId,
      });
    }

    const patch: Record<string, unknown> = {};
    if (typeof args.input.allocatedCents !== 'undefined')
      patch.allocated_cents = args.input.allocatedCents;
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
    return toBudget(updated);
  });
}

export async function deleteBudgetServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  budgetId: BudgetLine['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireProjectForAction(
      args.context,
      args.projectId,
      'budget:edit'
    );
    await db
      .deleteFrom('budget_lines')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.budgetId)
      .execute();
  });
}

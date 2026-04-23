import type {
  CompanyId,
  ProjectId,
  Txn,
  TxnId,
  ImportPreviewRow,
} from '../../types';
import { asBudgetLineId, asTxnId } from '../../types';
import { AppError } from '../../api/errors';
import type {
  TxnCreateInput,
  TxnImportTxnInput,
  TxnUpdateInput,
} from '../../api/types';
import { uid } from '../../utils/id';
import { txnInputSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { getDb } from '../db/db';
import { isAuthorized, requireAuthorized } from '../auth/authorize';
import { planImportPreview } from '../../utils/importPreviewPlan';
import { planTransactionImportCommit } from '../../utils/transactionImportCommitPlan';
import {
  assertUniqueTransactionKeysInProject,
  normalizeExternalId,
  normalizeTxnPatch,
} from '../../utils/transactions';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import { type TxnRow, toBudgetLines, toTxn } from '../mappers/transactionRows';
import {
  type CategoryRow,
  type CompanyDefaultCategoryRow,
  type CompanyDefaultMappingRuleRow,
  type CompanyDefaultSubCategoryRow,
  type SubCategoryRow,
  toCategory,
  toCompanyDefaultCategory,
  toCompanyDefaultMappingRule,
  toCompanyDefaultSubCategory,
  toSubCategory,
} from '../mappers/taxonomyRows';

/**
 * Example command-style server function.
 *
 * In TanStack Start, export this from a `server/` route or server function file
 * and call it from the client adapter.
 */

export async function listTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<Txn[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');
    await requireAuthorized({
      db,
      userId,
      action: 'project:view',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });
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
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return rows.map((r) => toTxn(r as TxnRow));
  });
}

export async function createTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnCreateInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');
    await requireAuthorized({
      db,
      userId,
      action: 'txns:edit',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });

    if (args.input.projectId !== args.projectId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction projectId does not match target project'
      );
    }
    if (args.input.companyId !== (project.company_id as CompanyId)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction companyId does not match project company'
      );
    }

    validateOrThrow(txnInputSchema, args.input);

    const next: Txn = {
      ...args.input,
      id: args.input.id ?? asTxnId(uid('txn')),
      externalId: normalizeExternalId(args.input.externalId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const existingRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.projectId)
      .execute();
    const existingForCheck = existingRows.map((r) => ({
      id: r.public_id as TxnId,
      externalId: normalizeExternalId(r.external_id),
    }));
    assertUniqueTransactionKeysInProject([...existingForCheck, next]);

    const row = await db
      .insertInto('txns')
      .values({
        public_id: next.id,
        external_id: next.externalId ?? null,
        company_id: next.companyId,
        project_id: next.projectId,
        txn_date: next.date,
        item: next.item,
        description: next.description,
        amount_cents: next.amountCents,
        category_id: next.categoryId ?? null,
        sub_category_id: next.subCategoryId ?? null,
        company_default_mapping_rule_id:
          next.companyDefaultMappingRuleId ?? null,
        coding_source: next.codingSource ?? null,
        coding_pending_approval: !!next.codingPendingApproval,
        created_at: next.createdAt,
        updated_at: next.updatedAt,
      })
      .returning([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toTxn(row as TxnRow);
  });
}

export async function updateTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnUpdateInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');
    await requireAuthorized({
      db,
      userId,
      action: 'txns:edit',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });

    const existing = await db
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
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');

    if (
      typeof args.input.projectId !== 'undefined' &&
      args.input.projectId !== (existing.project_id as ProjectId)
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction projectId cannot be changed'
      );
    }
    if (
      typeof args.input.companyId !== 'undefined' &&
      args.input.companyId !== (existing.company_id as CompanyId)
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction companyId cannot be changed'
      );
    }

    const prev = toTxn(existing as TxnRow);
    const normalizedInput = normalizeTxnPatch(args.input);
    const nextExternalId = Object.prototype.hasOwnProperty.call(
      normalizedInput,
      'externalId'
    )
      ? normalizeExternalId(normalizedInput.externalId ?? undefined)
      : normalizeExternalId(prev.externalId);
    const now = new Date().toISOString();
    const next: Txn = {
      ...prev,
      ...normalizedInput,
      externalId: nextExternalId,
      updatedAt: now,
    };

    validateOrThrow(txnInputSchema, next);

    const existingRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.projectId)
      .execute();
    const forCheck = existingRows.map((r) => ({
      id: r.public_id as TxnId,
      externalId: normalizeExternalId(r.external_id),
    }));
    const idx = forCheck.findIndex((r) => r.id === next.id);
    if (idx >= 0) forCheck[idx] = { id: next.id, externalId: next.externalId };
    assertUniqueTransactionKeysInProject(forCheck);

    const patch = {
      external_id: nextExternalId ?? null,
      item: next.item,
      description: next.description,
      amount_cents: next.amountCents,
      category_id: next.categoryId ?? null,
      sub_category_id: next.subCategoryId ?? null,
      company_default_mapping_rule_id: next.companyDefaultMappingRuleId ?? null,
      coding_source: next.codingSource ?? null,
      coding_pending_approval: !!next.codingPendingApproval,
      created_at: prev.createdAt,
      updated_at: now,
      ...(typeof args.input.date !== 'undefined'
        ? { txn_date: next.date }
        : {}),
    };

    const updated = await db
      .updateTable('txns')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.id)
      .returning([
        'id',
        'public_id',
        'external_id',
        'company_id',
        'project_id',
        'txn_date',
        'item',
        'description',
        'amount_cents',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toTxn(updated as TxnRow);
  });
}

export async function deleteTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');
    await requireAuthorized({
      db,
      userId,
      action: 'txns:edit',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });
    await db
      .deleteFrom('txns')
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.txnId)
      .execute();
  });
}

export async function importTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txns: TxnImportTxnInput[];
  mode: 'append' | 'replaceAll';
  autoCreateBudgets?: boolean;
}): Promise<{ count: number }> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');
    await requireAuthorized({
      db,
      userId,
      action: 'project:import',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });
    if (args.autoCreateBudgets) {
      await requireAuthorized({
        db,
        userId,
        action: 'budget:edit',
        companyId: project.company_id as CompanyId,
        projectId: args.projectId,
      });
    }
    const [
      defaultCategoriesRows,
      defaultSubCategoriesRows,
      mappingRuleRows,
      projectCategoryRows,
      projectSubCategoryRows,
      existingTxnRows,
      budgetRows,
    ] = await Promise.all([
      db
        .selectFrom('company_default_categories')
        .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
        .where('company_id', '=', project.company_id as CompanyId)
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
        .where('company_id', '=', project.company_id as CompanyId)
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
        .where('company_id', '=', project.company_id as CompanyId)
        .orderBy('sort_order', 'asc')
        .orderBy('created_at', 'asc')
        .execute(),
      db
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
        .execute(),
      db
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
        .execute(),
      db
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
          'category_id',
          'sub_category_id',
          'company_default_mapping_rule_id',
          'coding_source',
          'coding_pending_approval',
          'created_at',
          'updated_at',
        ])
        .where('project_id', '=', args.projectId)
        .execute(),
      db
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
        .execute(),
    ]);

    const defaultCategories = defaultCategoriesRows.map((row) =>
      toCompanyDefaultCategory(row as CompanyDefaultCategoryRow)
    );
    const defaultSubCategories = defaultSubCategoriesRows.map((row) =>
      toCompanyDefaultSubCategory(row as CompanyDefaultSubCategoryRow)
    );
    const mappingRules = mappingRuleRows.map((row) =>
      toCompanyDefaultMappingRule(row as CompanyDefaultMappingRuleRow)
    );
    const projectCategories = projectCategoryRows.map((row) =>
      toCategory(row as CategoryRow)
    );
    const projectSubCategories = projectSubCategoryRows.map((row) =>
      toSubCategory(row as SubCategoryRow)
    );
    const existingTransactions = existingTxnRows.map((row) =>
      toTxn(row as TxnRow)
    );
    const budgets = toBudgetLines(budgetRows);

    const plan = planTransactionImportCommit({
      projectId: args.projectId,
      companyId: project.company_id as CompanyId,
      incomingTransactions: args.txns,
      existingTransactions,
      existingBudgets: budgets,
      defaultCategories,
      defaultSubCategories,
      mappingRules,
      projectCategories,
      projectSubCategories,
      mode: args.mode,
      autoCreateBudgets: Boolean(args.autoCreateBudgets),
    });

    if (args.mode === 'replaceAll') {
      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom('txns')
          .where('project_id', '=', args.projectId)
          .execute();
        if (plan.budgetTargetsToCreate.length) {
          await trx
            .insertInto('budget_lines')
            .values(
              plan.budgetTargetsToCreate.map((target) => ({
                id: asBudgetLineId(uid('bud')),
                company_id: project.company_id as CompanyId,
                project_id: args.projectId,
                category_id: target.categoryId,
                sub_category_id: target.subCategoryId,
                allocated_cents: 0,
                created_at: now,
                updated_at: now,
              }))
            )
            .execute();
        }
        if (!plan.importedTransactions.length) return;
        await trx
          .insertInto('txns')
          .values(
            plan.importedTransactions.map((t) => ({
              public_id: t.id,
              external_id: t.externalId ?? null,
              company_id: t.companyId,
              project_id: t.projectId,
              txn_date: t.date,
              item: t.item,
              description: t.description,
              amount_cents: t.amountCents,
              category_id: t.categoryId ?? null,
              sub_category_id: t.subCategoryId ?? null,
              company_default_mapping_rule_id:
                t.companyDefaultMappingRuleId ?? null,
              coding_source: t.codingSource ?? null,
              coding_pending_approval: !!t.codingPendingApproval,
              created_at: now,
              updated_at: now,
            }))
          )
          .execute();
      });
      return { count: plan.importedTransactions.length };
    }

    if (plan.importedTransactions.length) {
      const now = new Date().toISOString();
      if (plan.budgetTargetsToCreate.length) {
        await db
          .insertInto('budget_lines')
          .values(
            plan.budgetTargetsToCreate.map((target) => ({
              id: asBudgetLineId(uid('bud')),
              company_id: project.company_id as CompanyId,
              project_id: args.projectId,
              category_id: target.categoryId,
              sub_category_id: target.subCategoryId,
              allocated_cents: 0,
              created_at: now,
              updated_at: now,
            }))
          )
          .execute();
      }
      await db
        .insertInto('txns')
        .values(
          plan.importedTransactions.map((t) => ({
            public_id: t.id,
            external_id: t.externalId ?? null,
            company_id: t.companyId,
            project_id: t.projectId,
            txn_date: t.date,
            item: t.item,
            description: t.description,
            amount_cents: t.amountCents,
            category_id: t.categoryId ?? null,
            sub_category_id: t.subCategoryId ?? null,
            company_default_mapping_rule_id:
              t.companyDefaultMappingRuleId ?? null,
            coding_source: t.codingSource ?? null,
            coding_pending_approval: !!t.codingPendingApproval,
            created_at: now,
            updated_at: now,
          }))
        )
        .execute();
    }
    return { count: plan.importedTransactions.length };
  });
}

export async function previewImportTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  csvText: string;
  autoCreateStructures?: boolean;
}): Promise<{ rows: ImportPreviewRow[] }> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const userId = await requireServerUserId(args.context);
    const db = getDb();
    const project = await db
      .selectFrom('projects')
      .select(['id', 'company_id'])
      .where('id', '=', args.projectId)
      .executeTakeFirst();
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');

    await requireAuthorized({
      db,
      userId,
      action: 'project:import',
      companyId: project.company_id as CompanyId,
      projectId: args.projectId,
    });

    const [
      existingRows,
      defaultCategoriesRows,
      defaultSubCategoriesRows,
      mappingRuleRows,
      projectCategoryRows,
      projectSubCategoryRows,
      budgetRows,
      canEditTaxonomy,
      canEditBudgets,
    ] = await Promise.all([
      db
        .selectFrom('txns')
        .select(['public_id', 'external_id'])
        .where('project_id', '=', args.projectId)
        .execute(),
      db
        .selectFrom('company_default_categories')
        .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
        .where('company_id', '=', project.company_id as CompanyId)
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
        .where('company_id', '=', project.company_id as CompanyId)
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
        .where('company_id', '=', project.company_id as CompanyId)
        .orderBy('sort_order', 'asc')
        .orderBy('created_at', 'asc')
        .execute(),
      db
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
        .execute(),
      db
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
        .execute(),
      db
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
        .execute(),
      isAuthorized({
        db,
        userId,
        action: 'taxonomy:edit',
        companyId: project.company_id as CompanyId,
        projectId: args.projectId,
      }),
      isAuthorized({
        db,
        userId,
        action: 'budget:edit',
        companyId: project.company_id as CompanyId,
        projectId: args.projectId,
      }),
    ]);

    const defaultCategories = defaultCategoriesRows.map((row) =>
      toCompanyDefaultCategory(row as CompanyDefaultCategoryRow)
    );
    const defaultSubCategories = defaultSubCategoriesRows.map((row) =>
      toCompanyDefaultSubCategory(row as CompanyDefaultSubCategoryRow)
    );
    const mappingRules = mappingRuleRows.map((row) =>
      toCompanyDefaultMappingRule(row as CompanyDefaultMappingRuleRow)
    );
    const projectCategories = projectCategoryRows.map((row) =>
      toCategory(row as CategoryRow)
    );
    const projectSubCategories = projectSubCategoryRows.map((row) =>
      toSubCategory(row as SubCategoryRow)
    );
    const budgets = toBudgetLines(budgetRows);

    return planImportPreview({
      csvText: args.csvText,
      existingTransactions: existingRows.map((txn) => ({
        id: asTxnId(txn.public_id),
        externalId: normalizeExternalId(txn.external_id),
      })),
      categories: projectCategories,
      subCategories: projectSubCategories,
      budgets,
      defaultCategories,
      defaultSubCategories,
      mappingRules,
      autoCreateStructures: Boolean(args.autoCreateStructures),
      canEditTaxonomy,
      canEditBudgets,
    });
  });
}

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
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import {
  assertCategoryInProject,
  assertCompanyDefaultMappingRuleInCompany,
  assertSubCategoryInProject,
  requireProjectForAction,
  type ProjectActionContext,
} from './resourceGuards';
import { type TxnRow, toTxn } from '../mappers/transactionRows';
import {
  loadTransactionImportCommitContext,
  loadTransactionImportPreviewContext,
} from '../loaders/importContext';

async function assertTransactionResourceOwnership(
  context: ProjectActionContext,
  txn: Txn
): Promise<void> {
  if (txn.subCategoryId && !txn.categoryId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Category is required when subcategory is set'
    );
  }

  if (txn.categoryId) {
    await assertCategoryInProject({
      db: context.db,
      projectId: context.projectId,
      categoryId: txn.categoryId,
    });
  }

  if (txn.subCategoryId) {
    await assertSubCategoryInProject({
      db: context.db,
      projectId: context.projectId,
      subCategoryId: txn.subCategoryId,
      categoryId: txn.categoryId,
    });
  }

  if (txn.companyDefaultMappingRuleId) {
    await assertCompanyDefaultMappingRuleInCompany({
      db: context.db,
      companyId: context.companyId,
      ruleId: txn.companyDefaultMappingRuleId,
    });
  }
}

export async function listTransactionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<Txn[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );
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
    const context = await requireProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const { db } = context;

    if (args.input.projectId !== args.projectId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction projectId does not match target project'
      );
    }
    if (args.input.companyId !== context.companyId) {
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
    await assertTransactionResourceOwnership(context, next);

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
    const context = await requireProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const { db } = context;

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
    await assertTransactionResourceOwnership(context, next);

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
    const { db } = await requireProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
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
    const context = await requireProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );
    const { db, userId, companyId } = context;
    if (args.autoCreateBudgets) {
      await requireAuthorized({
        db,
        userId,
        action: 'budget:edit',
        companyId,
        projectId: args.projectId,
      });
    }
    const importContext = await loadTransactionImportCommitContext(db, {
      companyId,
      projectId: args.projectId,
    });

    const plan = planTransactionImportCommit({
      projectId: args.projectId,
      companyId,
      incomingTransactions: args.txns,
      existingTransactions: importContext.existingTransactions,
      existingBudgets: importContext.budgets,
      defaultCategories: importContext.defaultCategories,
      defaultSubCategories: importContext.defaultSubCategories,
      mappingRules: importContext.mappingRules,
      projectCategories: importContext.projectCategories,
      projectSubCategories: importContext.projectSubCategories,
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
                company_id: companyId,
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
              company_id: companyId,
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
    const context = await requireProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );
    const { db, userId, companyId } = context;

    const [importContext, canEditTaxonomy, canEditBudgets] = await Promise.all([
      loadTransactionImportPreviewContext(db, {
        companyId,
        projectId: args.projectId,
      }),
      isAuthorized({
        db,
        userId,
        action: 'taxonomy:edit',
        companyId,
        projectId: args.projectId,
      }),
      isAuthorized({
        db,
        userId,
        action: 'budget:edit',
        companyId,
        projectId: args.projectId,
      }),
    ]);

    return planImportPreview({
      csvText: args.csvText,
      existingTransactions: importContext.existingTransactions,
      categories: importContext.projectCategories,
      subCategories: importContext.projectSubCategories,
      budgets: importContext.budgets,
      defaultCategories: importContext.defaultCategories,
      defaultSubCategories: importContext.defaultSubCategories,
      mappingRules: importContext.mappingRules,
      autoCreateStructures: Boolean(args.autoCreateStructures),
      canEditTaxonomy,
      canEditBudgets,
    });
  });
}

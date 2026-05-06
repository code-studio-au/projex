import type { ProjectId, Txn, TxnId, ImportPreviewRow } from '../../types';
import {
  asBudgetLineId,
  asCompanyId,
  asProjectId,
  asTxnId,
  asUserId,
} from '../../types';
import { AppError } from '../../api/errors';
import type {
  TxnCreateInput,
  TxnImportTxnInput,
  TxnSplitInput,
  TxnSplitResult,
  TxnTransferInput,
  TxnTransferResult,
  TxnUpdateInput,
  TxnWorkflowStateInput,
} from '../../api/types';
import { uid } from '../../utils/id';
import { txnInputSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { isAuthorized, requireAuthorized } from '../auth/authorize';
import { planImportPreview } from '../../utils/importPreviewPlan';
import { planTransactionImportCommit } from '../../utils/transactionImportCommitPlan';
import { planTransactionSplit } from '../../utils/transactionSplitPlan';
import { planTransactionTransfer } from '../../utils/transactionTransferPlan';
import { planTxnWorkflowState } from '../../utils/transactionWorkflow';
import {
  assertTxnCodingAllowed,
  assertUniqueTransactionKeysInProject,
  normalizeExternalId,
  normalizeTxnPatch,
  withStandardTxnAccountingMetadata,
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
  requireOperationalProjectForAction,
  type ProjectActionContext,
} from './resourceGuards';
import { toTxn } from '../mappers/transactionRows';
import {
  loadTransactionImportCommitContext,
  loadTransactionImportPreviewContext,
} from '../loaders/importContext';

function assertTxnUnlocked(txn: Txn): void {
  if (txn.lockedAt) {
    throw new AppError(
      'CONFLICT',
      'Transaction is locked and cannot be changed'
    );
  }
}

async function assertTransactionResourceOwnership(
  context: ProjectActionContext,
  txn: Txn
): Promise<void> {
  assertTxnCodingAllowed(txn);

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
    const { db } = await requireOperationalProjectForAction(
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
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return rows.map(toTxn);
  });
}

export async function createTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnCreateInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
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

    const next: Txn = withStandardTxnAccountingMetadata({
      ...args.input,
      id: args.input.id ?? asTxnId(uid('txn')),
      externalId: normalizeExternalId(args.input.externalId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await assertTransactionResourceOwnership(context, next);

    const existingRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.projectId)
      .execute();
    const existingForCheck = existingRows.map((r) => ({
      id: asTxnId(r.public_id),
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
        txn_type: next.txnType,
        parent_public_id: next.parentTxnId ?? null,
        source_public_id: next.sourceTxnId ?? null,
        transfer_project_id: next.transferProjectId ?? null,
        budget_impact: next.budgetImpact,
        categorisable: next.categorisable,
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
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toTxn(row);
  });
}

export async function updateTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnUpdateInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
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
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');

    if (
      typeof args.input.projectId !== 'undefined' &&
      args.input.projectId !== asProjectId(existing.project_id)
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction projectId cannot be changed'
      );
    }
    if (
      typeof args.input.companyId !== 'undefined' &&
      args.input.companyId !== asCompanyId(existing.company_id)
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction companyId cannot be changed'
      );
    }

    const prev = toTxn(existing);
    assertTxnUnlocked(prev);
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
      id: asTxnId(r.public_id),
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
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toTxn(updated);
  });
}

export async function deleteTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const existing = await db
      .selectFrom('txns')
      .select('locked_at')
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.txnId)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');
    if (existing.locked_at) {
      throw new AppError(
        'CONFLICT',
        'Transaction is locked and cannot be deleted'
      );
    }
    await db
      .deleteFrom('txns')
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.txnId)
      .execute();
  });
}

export async function splitTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnSplitInput;
}): Promise<TxnSplitResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
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
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.txnId)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');

    const parentTxn = toTxn(existing);
    assertTxnUnlocked(parentTxn);
    const now = new Date().toISOString();
    const split = planTransactionSplit({
      parent: parentTxn,
      children: args.input.children,
      now,
      createTxnId: () => asTxnId(uid('txn')),
    });

    for (const child of split.children) {
      validateOrThrow(txnInputSchema, child);
      await assertTransactionResourceOwnership(context, child);
    }

    const existingRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.projectId)
      .execute();
    assertUniqueTransactionKeysInProject([
      ...existingRows.map((row) => ({
        id: asTxnId(row.public_id),
        externalId: normalizeExternalId(row.external_id),
      })),
      ...split.children,
    ]);

    const result = await db.transaction().execute(async (trx) => {
      const parent = await trx
        .updateTable('txns')
        .set({
          txn_type: split.parent.txnType,
          parent_public_id: split.parent.parentTxnId ?? null,
          source_public_id: split.parent.sourceTxnId ?? null,
          transfer_project_id: split.parent.transferProjectId ?? null,
          budget_impact: split.parent.budgetImpact,
          categorisable: split.parent.categorisable,
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.input.txnId)
        .where('txn_type', 'in', ['standard', 'transfer_child'])
        .where('budget_impact', '=', true)
        .where('categorisable', '=', true)
        .where('locked_at', 'is', null)
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
          'txn_type',
          'parent_public_id',
          'source_public_id',
          'transfer_project_id',
          'budget_impact',
          'categorisable',
          'category_id',
          'sub_category_id',
          'company_default_mapping_rule_id',
          'coding_source',
          'coding_pending_approval',
          'reviewed_at',
          'reviewed_by_user_id',
          'locked_at',
          'locked_by_user_id',
          'created_at',
          'updated_at',
        ])
        .executeTakeFirst();

      if (!parent) {
        throw new AppError(
          'CONFLICT',
          'Transaction was already split or changed'
        );
      }

      const children = await trx
        .insertInto('txns')
        .values(
          split.children.map((child) => ({
            public_id: child.id,
            external_id: null,
            company_id: child.companyId,
            project_id: child.projectId,
            txn_date: child.date,
            item: child.item,
            description: child.description,
            amount_cents: child.amountCents,
            txn_type: child.txnType,
            parent_public_id: child.parentTxnId ?? null,
            source_public_id: child.sourceTxnId ?? null,
            transfer_project_id: child.transferProjectId ?? null,
            budget_impact: child.budgetImpact,
            categorisable: child.categorisable,
            category_id: child.categoryId ?? null,
            sub_category_id: child.subCategoryId ?? null,
            company_default_mapping_rule_id: null,
            coding_source: child.codingSource ?? null,
            coding_pending_approval: false,
            created_at: now,
            updated_at: now,
          }))
        )
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
          'txn_type',
          'parent_public_id',
          'source_public_id',
          'transfer_project_id',
          'budget_impact',
          'categorisable',
          'category_id',
          'sub_category_id',
          'company_default_mapping_rule_id',
          'coding_source',
          'coding_pending_approval',
          'reviewed_at',
          'reviewed_by_user_id',
          'locked_at',
          'locked_by_user_id',
          'created_at',
          'updated_at',
        ])
        .execute();

      return { parent: toTxn(parent), children: children.map(toTxn) };
    });

    return result;
  });
}

export async function transferTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnTransferInput;
}): Promise<TxnTransferResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const sourceContext = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const destinationContext = await requireOperationalProjectForAction(
      args.context,
      args.input.destinationProjectId,
      'txns:edit',
      sourceContext.db
    );
    const { db } = sourceContext;

    if (sourceContext.companyId !== destinationContext.companyId) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transactions can only be moved within the same company'
      );
    }

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
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.txnId)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');

    const sourceTxn = toTxn(existing);
    assertTxnUnlocked(sourceTxn);
    const now = new Date().toISOString();
    const transfer = planTransactionTransfer({
      source: sourceTxn,
      input: args.input,
      destinationCompanyId: destinationContext.companyId,
      now,
      createTxnId: () => asTxnId(uid('txn')),
    });

    validateOrThrow(txnInputSchema, transfer.destination);
    await assertTransactionResourceOwnership(
      destinationContext,
      transfer.destination
    );

    const destinationRows = await db
      .selectFrom('txns')
      .select(['public_id', 'external_id'])
      .where('project_id', '=', args.input.destinationProjectId)
      .execute();
    assertUniqueTransactionKeysInProject([
      ...destinationRows.map((row) => ({
        id: asTxnId(row.public_id),
        externalId: normalizeExternalId(row.external_id),
      })),
      transfer.destination,
    ]);

    const result = await db.transaction().execute(async (trx) => {
      const source = await trx
        .updateTable('txns')
        .set({
          txn_type: transfer.source.txnType,
          parent_public_id: transfer.source.parentTxnId ?? null,
          source_public_id: transfer.source.sourceTxnId ?? null,
          transfer_project_id: transfer.source.transferProjectId ?? null,
          budget_impact: transfer.source.budgetImpact,
          categorisable: transfer.source.categorisable,
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.input.txnId)
        .where('txn_type', 'in', ['standard', 'split_child'])
        .where('budget_impact', '=', true)
        .where('categorisable', '=', true)
        .where('locked_at', 'is', null)
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
          'txn_type',
          'parent_public_id',
          'source_public_id',
          'transfer_project_id',
          'budget_impact',
          'categorisable',
          'category_id',
          'sub_category_id',
          'company_default_mapping_rule_id',
          'coding_source',
          'coding_pending_approval',
          'reviewed_at',
          'reviewed_by_user_id',
          'locked_at',
          'locked_by_user_id',
          'created_at',
          'updated_at',
        ])
        .executeTakeFirst();

      if (!source) {
        throw new AppError(
          'CONFLICT',
          'Transaction was already moved, split, or changed'
        );
      }

      const destination = await trx
        .insertInto('txns')
        .values({
          public_id: transfer.destination.id,
          external_id: null,
          company_id: transfer.destination.companyId,
          project_id: transfer.destination.projectId,
          txn_date: transfer.destination.date,
          item: transfer.destination.item,
          description: transfer.destination.description,
          amount_cents: transfer.destination.amountCents,
          txn_type: transfer.destination.txnType,
          parent_public_id: null,
          source_public_id: transfer.destination.sourceTxnId ?? null,
          transfer_project_id: transfer.destination.transferProjectId ?? null,
          budget_impact: transfer.destination.budgetImpact,
          categorisable: transfer.destination.categorisable,
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          created_at: now,
          updated_at: now,
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
          'txn_type',
          'parent_public_id',
          'source_public_id',
          'transfer_project_id',
          'budget_impact',
          'categorisable',
          'category_id',
          'sub_category_id',
          'company_default_mapping_rule_id',
          'coding_source',
          'coding_pending_approval',
          'reviewed_at',
          'reviewed_by_user_id',
          'locked_at',
          'locked_by_user_id',
          'created_at',
          'updated_at',
        ])
        .executeTakeFirstOrThrow();

      return { source: toTxn(source), destination: toTxn(destination) };
    });

    return result;
  });
}

export async function updateTxnWorkflowStateServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnWorkflowStateInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const now = new Date().toISOString();

    const existing = await context.db
      .selectFrom('txns')
      .select([
        'public_id',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
      ])
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.txnId)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');

    const patch = {
      ...planTxnWorkflowState({
        current: {
          reviewedAt: existing.reviewed_at ?? undefined,
          reviewedByUserId: existing.reviewed_by_user_id
            ? asUserId(existing.reviewed_by_user_id)
            : undefined,
          lockedAt: existing.locked_at ?? undefined,
          lockedByUserId: existing.locked_by_user_id
            ? asUserId(existing.locked_by_user_id)
            : undefined,
        },
        reviewed: args.input.reviewed,
        locked: args.input.locked,
        actorUserId: context.userId,
        now,
      }),
      updated_at: now,
    };

    const updated = await context.db
      .updateTable('txns')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('public_id', '=', args.input.txnId)
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
        'txn_type',
        'parent_public_id',
        'source_public_id',
        'transfer_project_id',
        'budget_impact',
        'categorisable',
        'category_id',
        'sub_category_id',
        'company_default_mapping_rule_id',
        'coding_source',
        'coding_pending_approval',
        'reviewed_at',
        'reviewed_by_user_id',
        'locked_at',
        'locked_by_user_id',
        'created_at',
        'updated_at',
      ])
      .executeTakeFirstOrThrow();

    return toTxn(updated);
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
    const context = await requireOperationalProjectForAction(
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
              txn_type: 'standard',
              parent_public_id: null,
              source_public_id: null,
              transfer_project_id: null,
              budget_impact: true,
              categorisable: true,
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
            txn_type: 'standard',
            parent_public_id: null,
            source_public_id: null,
            transfer_project_id: null,
            budget_impact: true,
            categorisable: true,
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
    const context = await requireOperationalProjectForAction(
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

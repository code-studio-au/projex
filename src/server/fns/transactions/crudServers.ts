import type { ProjectId, Txn, TxnId } from '../../../types';
import { asCompanyId, asProjectId, asTxnId } from '../../../types';
import { AppError } from '../../../api/errors';
import type {
  TxnCreateInput,
  TxnUpdateInput,
  TxnUpdateResult,
} from '../../../api/types';
import { uid } from '../../../utils/id';
import { txnInputSchema } from '../../../validation/schemas';
import { validateOrThrow } from '../../../validation/validate';
import {
  assertUniqueTransactionKeysInProject,
  normalizeExternalId,
  normalizeTxnPatch,
  withStandardTxnAccountingMetadata,
} from '../../../utils/transactions';
import { toTxn } from '../../mappers/transactionRows';
import { ensureBudgetLinesForProjectSubCategories } from '../budgets';
import { getProjectRuleSuggestionPromptServer } from '../projectAutoCodingRules';
import { requireOperationalProjectForAction } from '../resourceGuards';
import { recordManualRuleSuggestionSignal } from '../ruleSuggestions';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import {
  assertTransactionResourceOwnership,
  assertTxnUnlocked,
  txnSelectColumns,
} from './shared';
import { lockProjectReversalWorkflow } from './reversalConcurrency';
import { assertTxnNotInReversalWorkflow } from './reversalDomain';

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
    const existingForCheck = existingRows.map((row) => ({
      id: asTxnId(row.public_id),
      externalId: normalizeExternalId(row.external_id),
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
        import_batch_id: next.importBatchId ?? null,
        import_source_type: next.importSourceType ?? null,
        import_source_meta: next.importSourceMeta ?? null,
        category_id: next.categoryId ?? null,
        sub_category_id: next.subCategoryId ?? null,
        company_default_mapping_rule_id:
          next.companyDefaultMappingRuleId ?? null,
        coding_source: next.codingSource ?? null,
        coding_pending_approval: !!next.codingPendingApproval,
        created_at: next.createdAt,
        updated_at: next.updatedAt,
      })
      .returning(txnSelectColumns())
      .executeTakeFirstOrThrow();

    if (next.categoryId && next.subCategoryId) {
      await ensureBudgetLinesForProjectSubCategories({
        db,
        companyId: context.companyId,
        projectId: args.projectId,
        targets: [
          {
            categoryId: next.categoryId,
            subCategoryId: next.subCategoryId,
          },
        ],
      });
    }

    return toTxn(row);
  });
}

export async function updateTxnServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnUpdateInput;
}): Promise<TxnUpdateResult> {
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
      .select(txnSelectColumns())
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
    if (
      (prev.txnType === 'split_parent' ||
        prev.txnType === 'transfer_source' ||
        prev.txnType === 'transfer_child') &&
      typeof normalizedInput.amountCents !== 'undefined' &&
      normalizedInput.amountCents !== prev.amountCents
    ) {
      throw new AppError(
        'CONFLICT',
        prev.txnType === 'split_parent'
          ? 'Split parent amount cannot be edited directly. Update the split children instead.'
          : prev.txnType === 'transfer_source'
            ? 'Transferred-out source amount cannot be edited directly. Update the transfer destination instead.'
            : 'Transferred-in amount cannot be edited directly. Split it if you need to reallocate it.'
      );
    }
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
    const forCheck = existingRows.map((row) => ({
      id: asTxnId(row.public_id),
      externalId: normalizeExternalId(row.external_id),
    }));
    const idx = forCheck.findIndex((row) => row.id === next.id);
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

    const changesReversalIdentity =
      prev.date !== next.date ||
      prev.item !== next.item ||
      prev.description !== next.description ||
      prev.amountCents !== next.amountCents ||
      prev.externalId !== next.externalId;
    const updated = await db.transaction().execute(async (trx) => {
      await lockProjectReversalWorkflow({
        db: trx,
        projectId: args.projectId,
      });
      if (changesReversalIdentity) {
        await assertTxnNotInReversalWorkflow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.id,
          operation: 'edit',
        });
      }
      return trx
        .updateTable('txns')
        .set(patch)
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.input.id)
        .returning(txnSelectColumns())
        .executeTakeFirstOrThrow();
    });

    const updatedTxn = toTxn(updated);
    if (updatedTxn.categoryId && updatedTxn.subCategoryId) {
      await ensureBudgetLinesForProjectSubCategories({
        db,
        companyId: context.companyId,
        projectId: args.projectId,
        targets: [
          {
            categoryId: updatedTxn.categoryId,
            subCategoryId: updatedTxn.subCategoryId,
          },
        ],
      });
    }
    await recordManualRuleSuggestionSignal({
      db,
      userId: context.userId,
      prev,
      next: updatedTxn,
    });

    const shouldCheckProjectRulePrompt =
      updatedTxn.codingSource === 'manual' &&
      Boolean(updatedTxn.categoryId) &&
      Boolean(updatedTxn.subCategoryId) &&
      (prev.categoryId !== updatedTxn.categoryId ||
        prev.subCategoryId !== updatedTxn.subCategoryId);

    const projectRulePrompt = shouldCheckProjectRulePrompt
      ? await getProjectRuleSuggestionPromptServer({
          context: args.context,
          projectId: args.projectId,
          txnId: updatedTxn.id,
        })
      : null;

    return {
      txn: updatedTxn,
      projectRulePrompt,
    };
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
    await db.transaction().execute(async (trx) => {
      await lockProjectReversalWorkflow({
        db: trx,
        projectId: args.projectId,
      });
      const existing = await trx
        .selectFrom('txns')
        .select('locked_at')
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.txnId)
        .forUpdate()
        .executeTakeFirst();
      if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');
      if (existing.locked_at) {
        throw new AppError(
          'CONFLICT',
          'Transaction is locked and cannot be deleted'
        );
      }
      await assertTxnNotInReversalWorkflow({
        db: trx,
        projectId: args.projectId,
        txnId: args.txnId,
        operation: 'delete',
      });
      const structuralLink = await trx
        .selectFrom('txn_links')
        .select('id')
        .where(({ eb, or, and }) =>
          or([
            and([
              eb('source_project_id', '=', args.projectId),
              eb('source_txn_public_id', '=', args.txnId),
            ]),
            and([
              eb('target_project_id', '=', args.projectId),
              eb('target_txn_public_id', '=', args.txnId),
            ]),
          ])
        )
        .executeTakeFirst();
      if (structuralLink) {
        throw new AppError(
          'CONFLICT',
          'Transaction belongs to a split or transfer and cannot be deleted independently'
        );
      }
      await trx
        .deleteFrom('txns')
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.txnId)
        .execute();
    });
  });
}

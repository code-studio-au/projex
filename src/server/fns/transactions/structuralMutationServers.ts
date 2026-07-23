import type { ProjectId } from '../../../types';
import { asTxnId } from '../../../types';
import { AppError } from '../../../api/errors';
import type {
  TxnSplitInput,
  TxnSplitResult,
  TxnTransferInput,
  TxnTransferResult,
} from '../../../api/types';
import { uid } from '../../../utils/id';
import { txnInputSchema } from '../../../validation/schemas';
import { validateOrThrow } from '../../../validation/validate';
import { planTransactionSplit } from '../../../utils/transactionSplitPlan';
import { planTransactionTransfer } from '../../../utils/transactionTransferPlan';
import {
  assertUniqueTransactionKeysInProject,
  normalizeExternalId,
} from '../../../utils/transactions';
import { toTxn } from '../../mappers/transactionRows';
import { recordAuditEvent } from '../../audit/auditEvents';
import { ensureBudgetLinesForProjectSubCategories } from '../budgets';
import { requireOperationalProjectForAction } from '../resourceGuards';
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
      .select(txnSelectColumns())
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

    return db.transaction().execute(async (trx) => {
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
        .returning(txnSelectColumns())
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
        .returning(txnSelectColumns())
        .execute();

      await trx
        .insertInto('txn_links')
        .values(
          split.children.map((child) => ({
            id: uid('txnl'),
            company_id: context.companyId,
            link_type: 'split' as const,
            source_project_id: args.projectId,
            source_txn_public_id: split.parent.id,
            target_project_id: args.projectId,
            target_txn_public_id: child.id,
            amount_cents: child.amountCents,
            created_by_user_id: context.userId,
            created_at: now,
          }))
        )
        .execute();

      await ensureBudgetLinesForProjectSubCategories({
        db: trx,
        companyId: context.companyId,
        projectId: args.projectId,
        targets: split.children
          .filter(
            (
              child
            ): child is typeof child & {
              categoryId: NonNullable<typeof child.categoryId>;
              subCategoryId: NonNullable<typeof child.subCategoryId>;
            } => Boolean(child.categoryId && child.subCategoryId)
          )
          .map((child) => ({
            categoryId: child.categoryId,
            subCategoryId: child.subCategoryId,
          })),
      });

      await recordAuditEvent({
        db: trx,
        companyId: context.companyId,
        projectId: args.projectId,
        actorUserId: context.userId,
        eventClass: 'structural',
        eventType: 'transaction.split',
        entityType: 'transaction',
        entityId: split.parent.id,
        reason: 'Split transaction into balanced child transactions',
        previousState: {
          txnType: parentTxn.txnType,
          amountCents: parentTxn.amountCents,
          budgetImpact: parentTxn.budgetImpact,
        },
        resultingState: {
          txnType: split.parent.txnType,
          childTxnIds: split.children.map((child) => child.id),
          childAmountCents: split.children.map((child) => child.amountCents),
        },
        nowIso: now,
      });

      return { parent: toTxn(parent), children: children.map(toTxn) };
    });
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
    if (!sourceContext.allowTxnTransfers) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Transaction transfers are not enabled for this project'
      );
    }
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
      .select(txnSelectColumns())
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

    return db.transaction().execute(async (trx) => {
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
        .returning(txnSelectColumns())
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
        .returning(txnSelectColumns())
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('txn_links')
        .values({
          id: uid('txnl'),
          company_id: sourceContext.companyId,
          link_type: 'transfer',
          source_project_id: args.projectId,
          source_txn_public_id: transfer.source.id,
          target_project_id: args.input.destinationProjectId,
          target_txn_public_id: transfer.destination.id,
          amount_cents: transfer.destination.amountCents,
          created_by_user_id: sourceContext.userId,
          created_at: now,
        })
        .execute();

      await recordAuditEvent({
        db: trx,
        companyId: sourceContext.companyId,
        projectId: args.projectId,
        actorUserId: sourceContext.userId,
        eventClass: 'structural',
        eventType: 'transaction.transferred',
        entityType: 'transaction',
        entityId: transfer.source.id,
        reason: 'Transferred transaction to another project',
        previousState: {
          projectId: args.projectId,
          txnType: sourceTxn.txnType,
          amountCents: sourceTxn.amountCents,
        },
        resultingState: {
          sourceTxnType: transfer.source.txnType,
          destinationProjectId: args.input.destinationProjectId,
          destinationTxnId: transfer.destination.id,
          amountCents: transfer.destination.amountCents,
        },
        nowIso: now,
      });

      return { source: toTxn(source), destination: toTxn(destination) };
    });
  });
}

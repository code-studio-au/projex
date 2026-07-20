import { sql } from 'kysely';
import type { ProjectId, Txn } from '../../../types';
import { asUserId } from '../../../types';
import { AppError } from '../../../api/errors';
import type {
  TxnBulkActionInput,
  TxnBulkActionResult,
  TxnWorkflowStateInput,
} from '../../../api/types';
import { planTxnWorkflowState } from '../../../utils/transactionWorkflow';
import { toTxn } from '../../mappers/transactionRows';
import { ensureBudgetLinesForProjectSubCategories } from '../budgets';
import {
  assertCategoryInProject,
  assertSubCategoryInProject,
  requireOperationalProjectForAction,
} from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import {
  type BulkTxnActionRow,
  txnSelectColumns,
  workflowPatchIsNoop,
} from './shared';
import { approveSuggestedTxnReversalsBulkServer } from './reversalServers';

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
      .returning(txnSelectColumns())
      .executeTakeFirstOrThrow();

    return toTxn(updated);
  });
}

export async function bulkTxnActionServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnBulkActionInput;
}): Promise<TxnBulkActionResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    if (args.input.action === 'approveSuggestedReversals') {
      return approveSuggestedTxnReversalsBulkServer({
        context: args.context,
        projectId: args.projectId,
        txnIds: args.input.txnIds,
      });
    }
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const now = new Date().toISOString();

    if (args.input.action === 'recode') {
      await assertCategoryInProject({
        db: context.db,
        projectId: args.projectId,
        categoryId: args.input.categoryId,
      });
      await assertSubCategoryInProject({
        db: context.db,
        projectId: args.projectId,
        subCategoryId: args.input.subCategoryId,
        categoryId: args.input.categoryId,
      });
    }

    const rows = await context.db
      .selectFrom('txns')
      .select([
        'public_id',
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
        sql<boolean>`exists (
          select 1
          from txn_reversals tr
          where tr.project_id = txns.project_id
            and (
              tr.source_txn_public_id = txns.public_id
              or tr.matched_reversal_txn_public_id = txns.public_id
            )
        )`.as('in_reversal_workflow'),
      ])
      .where('project_id', '=', args.projectId)
      .where('public_id', 'in', args.input.txnIds)
      .execute();

    let updatedCount = 0;
    let unchangedCount = 0;
    let lockedCount = 0;
    let ineligibleCount = 0;

    await context.db.transaction().execute(async (trx) => {
      for (const row of rows as BulkTxnActionRow[]) {
        if (args.input.action === 'approveAutoMappings') {
          if (row.locked_at) {
            lockedCount += 1;
            continue;
          }
          if (!row.categorisable) {
            ineligibleCount += 1;
            continue;
          }
          if (!row.coding_pending_approval) {
            unchangedCount += 1;
            continue;
          }
          await trx
            .updateTable('txns')
            .set({
              coding_pending_approval: false,
              updated_at: now,
            })
            .where('project_id', '=', args.projectId)
            .where('public_id', '=', row.public_id)
            .executeTakeFirst();
          updatedCount += 1;
          continue;
        }

        if (args.input.action === 'delete') {
          if (row.locked_at) {
            lockedCount += 1;
            continue;
          }
          if (row.in_reversal_workflow) {
            ineligibleCount += 1;
            continue;
          }
          await trx
            .deleteFrom('txns')
            .where('project_id', '=', args.projectId)
            .where('public_id', '=', row.public_id)
            .executeTakeFirst();
          updatedCount += 1;
          continue;
        }

        if (args.input.action === 'clearCoding') {
          if (row.locked_at) {
            lockedCount += 1;
            continue;
          }
          if (!row.categorisable) {
            ineligibleCount += 1;
            continue;
          }
          const alreadyClear =
            !row.category_id &&
            !row.sub_category_id &&
            !row.company_default_mapping_rule_id &&
            row.coding_source === 'manual' &&
            row.coding_pending_approval === false;
          if (alreadyClear) {
            unchangedCount += 1;
            continue;
          }
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
            .where('public_id', '=', row.public_id)
            .executeTakeFirst();
          updatedCount += 1;
          continue;
        }

        if (args.input.action === 'recode') {
          if (row.locked_at) {
            lockedCount += 1;
            continue;
          }
          if (!row.categorisable) {
            ineligibleCount += 1;
            continue;
          }
          const alreadyRecoded =
            row.category_id === args.input.categoryId &&
            row.sub_category_id === args.input.subCategoryId &&
            row.company_default_mapping_rule_id === null &&
            row.coding_source === 'manual' &&
            row.coding_pending_approval === false;
          if (alreadyRecoded) {
            unchangedCount += 1;
            continue;
          }
          await trx
            .updateTable('txns')
            .set({
              category_id: args.input.categoryId,
              sub_category_id: args.input.subCategoryId,
              company_default_mapping_rule_id: null,
              coding_source: 'manual',
              coding_pending_approval: false,
              updated_at: now,
            })
            .where('project_id', '=', args.projectId)
            .where('public_id', '=', row.public_id)
            .executeTakeFirst();
          updatedCount += 1;
          continue;
        }

        if (args.input.action === 'setReviewed') {
          const patch = planTxnWorkflowState({
            current: {
              reviewedAt: row.reviewed_at ?? undefined,
              reviewedByUserId: row.reviewed_by_user_id
                ? asUserId(row.reviewed_by_user_id)
                : undefined,
              lockedAt: row.locked_at ?? undefined,
              lockedByUserId: row.locked_by_user_id
                ? asUserId(row.locked_by_user_id)
                : undefined,
            },
            reviewed: args.input.reviewed,
            actorUserId: context.userId,
            now,
          });
          if (workflowPatchIsNoop({ row, patch })) {
            unchangedCount += 1;
            continue;
          }
          await trx
            .updateTable('txns')
            .set({
              ...patch,
              updated_at: now,
            })
            .where('project_id', '=', args.projectId)
            .where('public_id', '=', row.public_id)
            .executeTakeFirst();
          updatedCount += 1;
          continue;
        }

        if (args.input.action === 'setLocked') {
          const patch = planTxnWorkflowState({
            current: {
              reviewedAt: row.reviewed_at ?? undefined,
              reviewedByUserId: row.reviewed_by_user_id
                ? asUserId(row.reviewed_by_user_id)
                : undefined,
              lockedAt: row.locked_at ?? undefined,
              lockedByUserId: row.locked_by_user_id
                ? asUserId(row.locked_by_user_id)
                : undefined,
            },
            locked: args.input.locked,
            actorUserId: context.userId,
            now,
          });
          if (workflowPatchIsNoop({ row, patch })) {
            unchangedCount += 1;
            continue;
          }
          await trx
            .updateTable('txns')
            .set({
              ...patch,
              updated_at: now,
            })
            .where('project_id', '=', args.projectId)
            .where('public_id', '=', row.public_id)
            .executeTakeFirst();
          updatedCount += 1;
        }
      }

      if (args.input.action === 'recode' && updatedCount > 0) {
        await ensureBudgetLinesForProjectSubCategories({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          targets: [
            {
              categoryId: args.input.categoryId,
              subCategoryId: args.input.subCategoryId,
            },
          ],
        });
      }
    });

    return {
      action: args.input.action,
      requestedCount: args.input.txnIds.length,
      foundCount: rows.length,
      updatedCount,
      unchangedCount,
      lockedCount,
      ineligibleCount,
    };
  });
}

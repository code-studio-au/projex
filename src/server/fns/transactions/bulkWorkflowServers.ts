import { sql } from 'kysely';

import { AppError } from '../../../api/errors';
import type {
  TxnBulkActionInput,
  TxnBulkActionResult,
} from '../../../api/types';
import type { ProjectId } from '../../../types';
import { asUserId } from '../../../types';
import { planTxnWorkflowState } from '../../../utils/transactionWorkflow';
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
  approveSuggestedTxnReversalsBulkServer,
  reconcilePendingTxnReversalsServer,
} from './reversalBulkServers';
import { lockProjectReversalWorkflow } from './reversalConcurrency';
import {
  type BulkTxnActionRow,
  txnValidSubCategorySql,
  workflowPatchIsNoop,
} from './shared';

type LockedBulkTxnActionRow = BulkTxnActionRow & {
  valid_sub_category: boolean;
};

function assertSingleRowChanged(count: bigint, action: string) {
  if (count === 1n) return;
  throw new AppError(
    'CONFLICT',
    `Transaction eligibility changed while attempting to ${action}`
  );
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
    if (args.input.action === 'reconcilePendingReversals') {
      return reconcilePendingTxnReversalsServer({
        context: args.context,
        projectId: args.projectId,
      });
    }

    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );

    return context.db.transaction().execute(async (trx) => {
      const now = new Date().toISOString();
      await lockProjectReversalWorkflow({ db: trx, projectId: args.projectId });

      if (args.input.action === 'approveAllAutoMappings') {
        const validSubCategory = txnValidSubCategorySql('txns');
        const updatedRows = await trx
          .updateTable('txns')
          .set({
            coding_pending_approval: false,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('locked_at', 'is', null)
          .where('categorisable', '=', true)
          .where('coding_pending_approval', '=', true)
          .where('sub_category_id', 'is not', null)
          .where(validSubCategory)
          .returning('public_id')
          .execute();

        return {
          action: args.input.action,
          requestedCount: updatedRows.length,
          foundCount: updatedRows.length,
          updatedCount: updatedRows.length,
          unchangedCount: 0,
          lockedCount: 0,
          ineligibleCount: 0,
        };
      }

      if (!('txnIds' in args.input)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Selected transaction IDs are required for this bulk action'
        );
      }

      if (args.input.action === 'recode') {
        await assertCategoryInProject({
          db: trx,
          projectId: args.projectId,
          categoryId: args.input.categoryId,
        });
        await assertSubCategoryInProject({
          db: trx,
          projectId: args.projectId,
          subCategoryId: args.input.subCategoryId,
          categoryId: args.input.categoryId,
        });
      }

      const rows = (await trx
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
          txnValidSubCategorySql('txns').as('valid_sub_category'),
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
        .orderBy('public_id', 'asc')
        .forUpdate()
        .execute()) as LockedBulkTxnActionRow[];

      let updatedCount = 0;
      let unchangedCount = 0;
      let lockedCount = 0;
      let ineligibleCount = 0;

      for (const row of rows) {
        if (args.input.action === 'approveAutoMappings') {
          if (row.locked_at) {
            lockedCount += 1;
            continue;
          }
          if (
            !row.categorisable ||
            !row.sub_category_id ||
            !row.valid_sub_category
          ) {
            ineligibleCount += 1;
            continue;
          }
          if (!row.coding_pending_approval) {
            unchangedCount += 1;
            continue;
          }
          const result = await trx
            .updateTable('txns')
            .set({ coding_pending_approval: false, updated_at: now })
            .where('project_id', '=', args.projectId)
            .where('public_id', '=', row.public_id)
            .where('locked_at', 'is', null)
            .where('categorisable', '=', true)
            .where('coding_pending_approval', '=', true)
            .where('sub_category_id', 'is not', null)
            .where(txnValidSubCategorySql('txns'))
            .executeTakeFirst();
          assertSingleRowChanged(result.numUpdatedRows, 'approve auto-mapping');
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
          const result = await trx
            .deleteFrom('txns')
            .where('project_id', '=', args.projectId)
            .where('public_id', '=', row.public_id)
            .where('locked_at', 'is', null)
            .where(
              sql<boolean>`not exists (
                select 1
                from txn_reversals tr
                where tr.project_id = txns.project_id
                  and (
                    tr.source_txn_public_id = txns.public_id
                    or tr.matched_reversal_txn_public_id = txns.public_id
                  )
              )`
            )
            .executeTakeFirst();
          assertSingleRowChanged(result.numDeletedRows, 'delete transaction');
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
          const result = await trx
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
            .where('locked_at', 'is', null)
            .where('categorisable', '=', true)
            .executeTakeFirst();
          assertSingleRowChanged(result.numUpdatedRows, 'clear coding');
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
          const result = await trx
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
            .where('locked_at', 'is', null)
            .where('categorisable', '=', true)
            .executeTakeFirst();
          assertSingleRowChanged(result.numUpdatedRows, 'recode transaction');
          updatedCount += 1;
          continue;
        }

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
          reviewed:
            args.input.action === 'setReviewed'
              ? args.input.reviewed
              : undefined,
          locked:
            args.input.action === 'setLocked' ? args.input.locked : undefined,
          actorUserId: context.userId,
          now,
        });
        if (workflowPatchIsNoop({ row, patch })) {
          unchangedCount += 1;
          continue;
        }
        const result = await trx
          .updateTable('txns')
          .set({ ...patch, updated_at: now })
          .where('project_id', '=', args.projectId)
          .where('public_id', '=', row.public_id)
          .executeTakeFirst();
        assertSingleRowChanged(result.numUpdatedRows, 'update workflow state');
        updatedCount += 1;
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
  });
}

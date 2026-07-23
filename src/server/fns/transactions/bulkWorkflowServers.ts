import { sql } from 'kysely';

import { AppError } from '../../../api/errors';
import type {
  TxnBulkActionInput,
  TxnBulkActionResult,
} from '../../../api/types';
import type { ProjectId } from '../../../types';
import { asUserId } from '../../../types';
import { planTxnWorkflowState } from '../../../utils/transactionWorkflow';
import { requireAuthorized } from '../../auth/authorize';
import { recordAuditEvent } from '../../audit/auditEvents';
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
    if (args.input.action === 'setLocked' && args.input.locked === false) {
      await requireAuthorized({
        db: context.db,
        userId: context.userId,
        companyId: context.companyId,
        projectId: args.projectId,
        action: 'txns:admin_unlock',
      });
      if (!args.input.reason?.trim()) {
        throw new AppError(
          'VALIDATION_ERROR',
          'A reason is required for an administrative unlock'
        );
      }
    }

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

        if (updatedRows.length) {
          await recordAuditEvent({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            actorUserId: context.userId,
            eventClass: 'coding',
            eventType: 'transaction_coding.bulk_approved',
            entityType: 'project',
            entityId: args.projectId,
            reason: 'Approved all eligible automatic coding',
            resultingState: {
              updatedTxnIds: updatedRows.map((row) => row.public_id),
            },
            nowIso: now,
          });
        }

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
          'workflow_version',
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
          sql<boolean>`exists (
            select 1
            from txn_links link
            where (
              link.source_project_id = txns.project_id
              and link.source_txn_public_id = txns.public_id
            ) or (
              link.target_project_id = txns.project_id
              and link.target_txn_public_id = txns.public_id
            )
          )`.as('in_structural_operation'),
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
      const expectedWorkflowVersionByTxnId =
        args.input.action === 'setReviewed' || args.input.action === 'setLocked'
          ? new Map<string, number>(
              args.input.workflowVersions.map((entry) => [
                entry.txnId,
                entry.version,
              ])
            )
          : null;

      if (
        expectedWorkflowVersionByTxnId &&
        (expectedWorkflowVersionByTxnId.size !== args.input.txnIds.length ||
          args.input.txnIds.some(
            (txnId) => !expectedWorkflowVersionByTxnId.has(txnId)
          ))
      ) {
        throw new AppError(
          'VALIDATION_ERROR',
          'A workflow version is required for every selected transaction'
        );
      }

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
          if (row.in_structural_operation) {
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
            .where(
              sql<boolean>`not exists (
                select 1
                from txn_links link
                where (
                  link.source_project_id = txns.project_id
                  and link.source_txn_public_id = txns.public_id
                ) or (
                  link.target_project_id = txns.project_id
                  and link.target_txn_public_id = txns.public_id
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

        if (
          args.input.action !== 'setReviewed' &&
          args.input.action !== 'setLocked'
        ) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Unsupported transaction workflow action'
          );
        }
        const workflowInput = args.input;
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
            workflowInput.action === 'setReviewed'
              ? workflowInput.reviewed
              : undefined,
          locked:
            workflowInput.action === 'setLocked'
              ? workflowInput.locked
              : undefined,
          actorUserId: context.userId,
          now,
        });
        const expectedWorkflowVersion = expectedWorkflowVersionByTxnId?.get(
          row.public_id
        );
        if (
          expectedWorkflowVersion == null ||
          expectedWorkflowVersion !== row.workflow_version
        ) {
          throw new AppError(
            'CONFLICT',
            'A selected transaction workflow changed. Refresh and try again.'
          );
        }
        if (
          workflowInput.action === 'setReviewed' &&
          workflowInput.reviewed === false &&
          row.locked_at
        ) {
          lockedCount += 1;
          continue;
        }
        if (workflowPatchIsNoop({ row, patch })) {
          unchangedCount += 1;
          continue;
        }
        if (
          workflowInput.action === 'setLocked' &&
          workflowInput.locked === false
        ) {
          await trx
            .updateTable('txn_unlock_requests')
            .set({
              status: 'approved',
              resolved_by_user_id: context.userId,
              resolved_at: now,
              resolution_reason: workflowInput.reason!.trim(),
              version: sql<number>`version + 1`,
              updated_at: now,
            })
            .where('project_id', '=', args.projectId)
            .where('txn_public_id', '=', row.public_id)
            .where('status', '=', 'pending')
            .execute();
        }
        const result = await trx
          .updateTable('txns')
          .set({
            ...patch,
            workflow_version: row.workflow_version + 1,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('public_id', '=', row.public_id)
          .where('workflow_version', '=', expectedWorkflowVersion)
          .executeTakeFirst();
        assertSingleRowChanged(result.numUpdatedRows, 'update workflow state');
        const eventType =
          workflowInput.action === 'setReviewed'
            ? workflowInput.reviewed
              ? 'transaction.reviewed'
              : 'transaction.reopened'
            : workflowInput.locked
              ? 'transaction.locked'
              : 'transaction.admin_unlocked';
        const reason =
          workflowInput.reason?.trim() ||
          (eventType === 'transaction.reviewed'
            ? 'Bulk transaction review'
            : eventType === 'transaction.reopened'
              ? 'Bulk reopen for further review'
              : 'Bulk transaction lock');
        await recordAuditEvent({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          actorUserId: context.userId,
          eventClass: 'workflow',
          eventType,
          entityType: 'transaction',
          entityId: row.public_id,
          reason,
          previousState: {
            reviewedAt: row.reviewed_at,
            reviewedByUserId: row.reviewed_by_user_id,
            lockedAt: row.locked_at,
            lockedByUserId: row.locked_by_user_id,
            workflowVersion: row.workflow_version,
          },
          resultingState: {
            reviewedAt: patch.reviewed_at,
            reviewedByUserId: patch.reviewed_by_user_id,
            lockedAt: patch.locked_at,
            lockedByUserId: patch.locked_by_user_id,
            workflowVersion: row.workflow_version + 1,
          },
          nowIso: now,
        });
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

      if (
        updatedCount > 0 &&
        (args.input.action === 'approveAutoMappings' ||
          args.input.action === 'clearCoding' ||
          args.input.action === 'recode')
      ) {
        await recordAuditEvent({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          actorUserId: context.userId,
          eventClass: 'coding',
          eventType: `transaction_coding.${args.input.action}`,
          entityType: 'project',
          entityId: args.projectId,
          reason:
            args.input.action === 'recode'
              ? 'Bulk recoded selected transactions'
              : args.input.action === 'clearCoding'
                ? 'Cleared coding from selected transactions'
                : 'Approved automatic coding for selected transactions',
          previousState: { requestedTxnIds: args.input.txnIds },
          resultingState: { updatedCount },
          nowIso: now,
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

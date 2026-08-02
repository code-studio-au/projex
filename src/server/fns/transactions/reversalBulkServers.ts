import { AppError } from '../../../api/errors';
import type { TxnBulkActionResult } from '../../../api/types';
import type { ProjectId, TxnId } from '../../../types';
import { asTxnId } from '../../../types';
import { executeAuditedTransaction } from '../../db/auditedTransaction';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import { lockProjectReversalWorkflow } from './reversalConcurrency';
import {
  isSuggestedReversalStatus,
  type TxnReversalRow,
} from './reversalDomain';
import { reconcilePendingReversalMatches } from './reversalReconciliation';
import { approveSuggestedTxnReversalMatch } from './reversalMatchDecisionServers';

export async function reconcilePendingTxnReversalsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<TxnBulkActionResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:manage_reversals'
    );
    const result = await executeAuditedTransaction(context.db, (trx) =>
      reconcilePendingReversalMatches({
        db: trx,
        companyId: context.companyId,
        projectId: args.projectId,
        userId: context.userId,
      })
    );
    return {
      action: 'reconcilePendingReversals',
      requestedCount: result.pendingSourceCount,
      foundCount: result.pendingSourceCount,
      updatedCount: result.suggestedCount,
      unchangedCount: result.eligibleSourceCount - result.suggestedCount,
      lockedCount: result.lockedSourceCount,
      ineligibleCount: result.ineligibleSourceCount,
    };
  });
}

export async function approveSuggestedTxnReversalsBulkServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  reversalIds?: string[];
  txnIds?: TxnId[];
}): Promise<TxnBulkActionResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:manage_reversals'
    );

    return executeAuditedTransaction(context.db, async (trx) => {
      await lockProjectReversalWorkflow({
        db: trx,
        projectId: args.projectId,
      });
      const requestedIds = args.reversalIds ?? args.txnIds ?? [];
      if (!requestedIds.length) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Select at least one suggested reversal pair to approve'
        );
      }

      let reversalQuery = trx
        .selectFrom('txn_reversals')
        .selectAll()
        .where('project_id', '=', args.projectId)
        .orderBy('id', 'asc')
        .forUpdate();
      if (args.reversalIds) {
        reversalQuery = reversalQuery.where('id', 'in', args.reversalIds);
      } else {
        reversalQuery = reversalQuery.where(({ eb, or }) =>
          or([
            eb('source_txn_public_id', 'in', args.txnIds!),
            eb('matched_reversal_txn_public_id', 'in', args.txnIds!),
          ])
        );
      }
      const reversalRows = (await reversalQuery.execute()) as TxnReversalRow[];
      const uniqueReversals = new Map(
        reversalRows.map((reversal) => [reversal.id, reversal] as const)
      );

      const involvedTxnIds = [
        ...new Set(
          [...uniqueReversals.values()].flatMap((reversal) => [
            reversal.source_txn_public_id,
            ...(reversal.matched_reversal_txn_public_id
              ? [reversal.matched_reversal_txn_public_id]
              : []),
          ])
        ),
      ];
      const involvedRows = involvedTxnIds.length
        ? await trx
            .selectFrom('txns')
            .select(['public_id', 'locked_at'])
            .where('project_id', '=', args.projectId)
            .where('public_id', 'in', involvedTxnIds)
            .orderBy('public_id', 'asc')
            .forUpdate()
            .execute()
        : [];
      const lockedTxnIds = new Set(
        involvedRows.flatMap((row) => (row.locked_at ? [row.public_id] : []))
      );

      let lockedCount = 0;
      let ineligibleCount = 0;
      const now = new Date().toISOString();
      const eligibleReversals: TxnReversalRow[] = [];
      for (const reversal of uniqueReversals.values()) {
        if (
          lockedTxnIds.has(reversal.source_txn_public_id) ||
          (reversal.matched_reversal_txn_public_id &&
            lockedTxnIds.has(reversal.matched_reversal_txn_public_id))
        ) {
          lockedCount += 1;
          continue;
        }
        if (!isSuggestedReversalStatus(reversal.status)) {
          ineligibleCount += 1;
          continue;
        }
        eligibleReversals.push(reversal);
      }
      await Promise.all(
        eligibleReversals.map((reversal) =>
          approveSuggestedTxnReversalMatch({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            userId: context.userId,
            txnId: asTxnId(reversal.source_txn_public_id),
            expectedReversalVersion: reversal.version,
            now,
          })
        )
      );
      const updatedCount = eligibleReversals.length;
      const unchangedCount = Math.max(
        0,
        requestedIds.length - uniqueReversals.size
      );

      return {
        action: 'approveSuggestedReversals',
        requestedCount: requestedIds.length,
        foundCount: uniqueReversals.size,
        updatedCount,
        unchangedCount,
        lockedCount,
        ineligibleCount,
      };
    });
  });
}

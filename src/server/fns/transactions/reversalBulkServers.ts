import type { TxnBulkActionResult } from '../../../api/types';
import type { ProjectId, TxnId } from '../../../types';
import { asTxnId } from '../../../types';
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
import { approveSuggestedTxnReversalMatch } from './reversalWorkflowServers';

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
    const result = await context.db.transaction().execute((trx) =>
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
  txnIds: TxnId[];
}): Promise<TxnBulkActionResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:manage_reversals'
    );

    return context.db.transaction().execute(async (trx) => {
      await lockProjectReversalWorkflow({ db: trx, projectId: args.projectId });
      const selectedRows = await trx
        .selectFrom('txns')
        .select(['public_id', 'locked_at'])
        .where('project_id', '=', args.projectId)
        .where('public_id', 'in', args.txnIds)
        .orderBy('public_id', 'asc')
        .forUpdate()
        .execute();
      const selectedByTxnId = new Map(
        selectedRows.map((row) => [row.public_id, row] as const)
      );

      const reversalRows = (await trx
        .selectFrom('txn_reversals')
        .selectAll()
        .where('project_id', '=', args.projectId)
        .where(({ eb, or }) =>
          or([
            eb('source_txn_public_id', 'in', args.txnIds),
            eb('matched_reversal_txn_public_id', 'in', args.txnIds),
          ])
        )
        .orderBy('id', 'asc')
        .forUpdate()
        .execute()) as TxnReversalRow[];
      const reversalByTxnId = new Map<string, TxnReversalRow>();
      for (const reversal of reversalRows) {
        reversalByTxnId.set(reversal.source_txn_public_id, reversal);
        if (reversal.matched_reversal_txn_public_id) {
          reversalByTxnId.set(
            reversal.matched_reversal_txn_public_id,
            reversal
          );
        }
      }

      let updatedCount = 0;
      let unchangedCount = 0;
      let lockedCount = 0;
      let ineligibleCount = 0;
      const uniqueReversalSelections = new Map<string, TxnId>();

      for (const txnId of args.txnIds) {
        const row = selectedByTxnId.get(txnId);
        if (!row) continue;
        if (row.locked_at) {
          lockedCount += 1;
          continue;
        }
        const reversal = reversalByTxnId.get(txnId);
        if (!reversal || !isSuggestedReversalStatus(reversal.status)) {
          ineligibleCount += 1;
          continue;
        }
        if (uniqueReversalSelections.has(reversal.id)) {
          unchangedCount += 1;
          continue;
        }
        uniqueReversalSelections.set(
          reversal.id,
          asTxnId(reversal.source_txn_public_id)
        );
      }

      const now = new Date().toISOString();
      for (const txnId of uniqueReversalSelections.values()) {
        await approveSuggestedTxnReversalMatch({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          userId: context.userId,
          txnId,
          now,
        });
        updatedCount += 1;
      }

      return {
        action: 'approveSuggestedReversals',
        requestedCount: args.txnIds.length,
        foundCount: selectedRows.length,
        updatedCount,
        unchangedCount,
        lockedCount,
        ineligibleCount,
      };
    });
  });
}

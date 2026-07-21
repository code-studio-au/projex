import type { ProjectId, Txn } from '../../../types';
import { asUserId } from '../../../types';
import { AppError } from '../../../api/errors';
import type { TxnWorkflowStateInput } from '../../../api/types';
import { planTxnWorkflowState } from '../../../utils/transactionWorkflow';
import { toTxn } from '../../mappers/transactionRows';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import { txnSelectColumns } from './shared';
import { lockProjectReversalWorkflow } from './reversalConcurrency';

export { bulkTxnActionServer } from './bulkWorkflowServers';

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

    return context.db.transaction().execute(async (trx) => {
      await lockProjectReversalWorkflow({
        db: trx,
        projectId: args.projectId,
      });
      const now = new Date().toISOString();
      const existing = await trx
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
        .forUpdate()
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

      const updated = await trx
        .updateTable('txns')
        .set(patch)
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.input.txnId)
        .returning(txnSelectColumns())
        .executeTakeFirst();
      if (!updated) {
        throw new AppError(
          'CONFLICT',
          'Transaction workflow state changed during the update'
        );
      }
      return toTxn(updated);
    });
  });
}

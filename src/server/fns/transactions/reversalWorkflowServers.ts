import { sql, type Insertable } from 'kysely';

import { AppError } from '../../../api/errors';
import type { ProjectId } from '../../../types';
import type {
  TxnReversalActionInput,
  TxnReversalActionResult,
} from '../../../api/types';
import { uid } from '../../../utils/id';
import type { TxnReversalTable } from '../../db/schema';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import { lockProjectReversalWorkflow } from './reversalConcurrency';
import { recordReversalTransition } from './reversalAudit';
import { reconcilePendingReversalMatches } from './reversalReconciliation';
import {
  buildReversalMatchEvidence,
  toTxnReversalTxnSummary,
} from './reversalMatchFacts';
import {
  buildPendingComment,
  completeReversalComments,
  createReversalComment,
  resolveOpenReversalComments,
} from './reversalComments';
import {
  assertCounterpartTxnEligible,
  assertExpectedProject,
  assertSourceTxnEligible,
  getReversalRowForAnyTxn,
  getSourceReversalRow,
  getTxnOrThrow,
  isOpenReversalStatus,
  type TxnReversalRow,
} from './reversalDomain';
import {
  approveSuggestedTxnReversalMatch,
  rejectSuggestedTxnReversalMatch,
  unmatchTxnReversal,
} from './reversalMatchDecisionServers';
import {
  assertExpectedReversalVersion,
  clearedMatchFields,
} from './reversalWorkflowState';

export async function applyTxnReversalActionServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnReversalActionInput;
}): Promise<TxnReversalActionResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:manage_reversals'
    );

    return context.db.transaction().execute(async (trx) => {
      const now = new Date().toISOString();
      await lockProjectReversalWorkflow({
        db: trx,
        projectId: args.projectId,
      });

      if (args.input.action === 'markPending') {
        const sourceTxn = await getTxnOrThrow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.txnId,
        });
        assertSourceTxnEligible(sourceTxn);
        await assertExpectedProject({
          context: args.context,
          sourceProjectId: args.projectId,
          expectedProjectId: args.input.expectedProjectId,
          db: trx,
          companyId: context.companyId,
        });

        const current = await getSourceReversalRow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.txnId,
        });
        if (current && current.status !== 'pending_reversal') {
          throw new AppError(
            'CONFLICT',
            current.status === 'reversal_exception'
              ? 'Return the reversal exception to pending before updating it.'
              : 'This transaction already has a reversal match. Resolve that proposal or match first.'
          );
        }

        let updatedReversal: TxnReversalRow;
        if (current) {
          assertExpectedReversalVersion(
            current,
            args.input.expectedReversalVersion
          );
          const updated = await trx
            .updateTable('txn_reversals')
            .set({
              expected_project_id: args.input.expectedProjectId ?? null,
              status: 'pending_reversal',
              ...clearedMatchFields,
              version: sql`version + 1`,
              updated_at: now,
            })
            .where('project_id', '=', args.projectId)
            .where('source_txn_public_id', '=', args.input.txnId)
            .where('version', '=', current.version)
            .returningAll()
            .executeTakeFirst();
          if (!updated) {
            throw new AppError(
              'CONFLICT',
              'This pending reversal changed while it was being updated'
            );
          }
          updatedReversal = updated as TxnReversalRow;
        } else {
          const inserted = await trx
            .insertInto('txn_reversals')
            .values({
              id: uid('txnr'),
              company_id: context.companyId,
              project_id: args.projectId,
              source_txn_public_id: args.input.txnId,
              matched_reversal_txn_public_id: null,
              expected_project_id: args.input.expectedProjectId ?? null,
              status: 'pending_reversal',
              marked_at: now,
              marked_by_user_id: context.userId,
              matched_at: null,
              matched_by_user_id: null,
              created_at: now,
              updated_at: now,
            } satisfies Insertable<TxnReversalTable>)
            .returningAll()
            .executeTakeFirstOrThrow();
          updatedReversal = inserted as TxnReversalRow;
        }

        await Promise.all([
          createReversalComment({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            txnId: args.input.txnId,
            userId: context.userId,
            body: buildPendingComment({
              commentBody: args.input.commentBody,
            }),
          }),
          recordReversalTransition({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            actorUserId: context.userId,
            reversalId: updatedReversal.id,
            eventType: current
              ? 'txn_reversal.pending_updated'
              : 'txn_reversal.pending_created',
            reason: current
              ? 'Updated the pending reversal details'
              : 'Marked the source transaction as awaiting reversal',
            previous: current,
            resulting: updatedReversal,
            now,
          }),
        ]);

        await reconcilePendingReversalMatches({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          userId: context.userId,
          sourceTxnIds: [args.input.txnId],
        });

        return {
          action: args.input.action,
          txn: await getTxnOrThrow({
            db: trx,
            projectId: args.projectId,
            txnId: args.input.txnId,
          }),
        };
      }

      if (args.input.action === 'clearPending') {
        const sourceTxn = await getTxnOrThrow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.txnId,
        });
        assertSourceTxnEligible(sourceTxn);
        const current = await getSourceReversalRow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.txnId,
        });
        if (!current) {
          throw new AppError(
            'CONFLICT',
            'This transaction is not marked as pending reversal'
          );
        }
        if (!isOpenReversalStatus(current.status)) {
          throw new AppError(
            'CONFLICT',
            'Resolve or unmatch the reversal proposal before cancelling this workflow.'
          );
        }
        assertExpectedReversalVersion(
          current,
          args.input.expectedReversalVersion
        );
        const deleted = await trx
          .deleteFrom('txn_reversals')
          .where('project_id', '=', args.projectId)
          .where('source_txn_public_id', '=', args.input.txnId)
          .where('version', '=', current.version)
          .returning('id')
          .executeTakeFirst();
        if (!deleted) {
          throw new AppError(
            'CONFLICT',
            'This reversal workflow changed while it was being cancelled'
          );
        }
        await Promise.all([
          completeReversalComments({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            txnIds: [args.input.txnId],
            userId: context.userId,
            now,
            commentBody: args.input.commentBody,
          }),
          recordReversalTransition({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            actorUserId: context.userId,
            reversalId: current.id,
            eventType: 'txn_reversal.cancelled',
            reason: 'Cancelled the reversal workflow',
            previous: current,
            resulting: null,
            now,
          }),
        ]);
        return {
          action: args.input.action,
          txn: await getTxnOrThrow({
            db: trx,
            projectId: args.projectId,
            txnId: args.input.txnId,
          }),
        };
      }

      if (args.input.action === 'markException') {
        const sourceTxn = await getTxnOrThrow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.txnId,
        });
        assertSourceTxnEligible(sourceTxn);
        const current = await getSourceReversalRow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.txnId,
        });
        if (!current || current.status !== 'pending_reversal') {
          throw new AppError(
            'CONFLICT',
            'Only pending reversal transactions can be marked as exceptions'
          );
        }
        assertExpectedReversalVersion(
          current,
          args.input.expectedReversalVersion
        );
        const updated = await trx
          .updateTable('txn_reversals')
          .set({
            status: 'reversal_exception',
            version: sql`version + 1`,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('source_txn_public_id', '=', args.input.txnId)
          .where('version', '=', current.version)
          .returningAll()
          .executeTakeFirst();
        if (!updated) {
          throw new AppError(
            'CONFLICT',
            'This pending reversal changed while it was being updated'
          );
        }
        await resolveOpenReversalComments({
          db: trx,
          projectId: args.projectId,
          txnIds: [args.input.txnId],
          userId: context.userId,
          now,
        });
        await Promise.all([
          createReversalComment({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            txnId: args.input.txnId,
            userId: context.userId,
            body: args.input.commentBody,
          }),
          recordReversalTransition({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            actorUserId: context.userId,
            reversalId: current.id,
            eventType: 'txn_reversal.exception_marked',
            reason:
              'Marked the pending reversal as an exception requiring manual review',
            previous: current,
            resulting: updated as TxnReversalRow,
            now,
          }),
        ]);
        return {
          action: args.input.action,
          txn: await getTxnOrThrow({
            db: trx,
            projectId: args.projectId,
            txnId: args.input.txnId,
          }),
        };
      }

      if (args.input.action === 'clearException') {
        const sourceTxn = await getTxnOrThrow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.txnId,
        });
        assertSourceTxnEligible(sourceTxn);
        const current = await getSourceReversalRow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.txnId,
        });
        if (!current || current.status !== 'reversal_exception') {
          throw new AppError(
            'CONFLICT',
            'This transaction is not marked as a reversal exception'
          );
        }
        assertExpectedReversalVersion(
          current,
          args.input.expectedReversalVersion
        );
        const updated = await trx
          .updateTable('txn_reversals')
          .set({
            status: 'pending_reversal',
            ...clearedMatchFields,
            version: sql`version + 1`,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('source_txn_public_id', '=', args.input.txnId)
          .where('version', '=', current.version)
          .returningAll()
          .executeTakeFirst();
        if (!updated) {
          throw new AppError(
            'CONFLICT',
            'This reversal exception changed while it was being returned to pending'
          );
        }
        await resolveOpenReversalComments({
          db: trx,
          projectId: args.projectId,
          txnIds: [args.input.txnId],
          userId: context.userId,
          now,
        });
        await Promise.all([
          createReversalComment({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            txnId: args.input.txnId,
            userId: context.userId,
            body: args.input.commentBody,
          }),
          recordReversalTransition({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            actorUserId: context.userId,
            reversalId: current.id,
            eventType: 'txn_reversal.exception_returned_to_pending',
            reason: 'Returned the exception to the pending reversal queue',
            previous: current,
            resulting: updated as TxnReversalRow,
            now,
          }),
        ]);
        return {
          action: args.input.action,
          txn: await getTxnOrThrow({
            db: trx,
            projectId: args.projectId,
            txnId: args.input.txnId,
          }),
        };
      }

      if (args.input.action === 'match') {
        const sourceTxn = await getTxnOrThrow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.txnId,
        });
        assertSourceTxnEligible(sourceTxn);
        const current = await getSourceReversalRow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.txnId,
        });
        if (!current || !isOpenReversalStatus(current.status)) {
          throw new AppError(
            'CONFLICT',
            'Only pending reversal transactions can be matched'
          );
        }
        assertExpectedReversalVersion(
          current,
          args.input.expectedReversalVersion
        );

        const counterpartTxn = await getTxnOrThrow({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.reversalTxnId,
        });
        assertCounterpartTxnEligible({ sourceTxn, counterpartTxn });

        const counterpartReversal = await getReversalRowForAnyTxn({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.reversalTxnId,
        });
        if (counterpartReversal) {
          throw new AppError(
            'CONFLICT',
            'The selected reversal transaction is already part of another reversal workflow'
          );
        }

        const updated = await trx
          .updateTable('txn_reversals')
          .set({
            status: 'reversed_matched',
            matched_reversal_txn_public_id: args.input.reversalTxnId,
            matched_at: now,
            matched_by_user_id: context.userId,
            match_method: 'manual',
            match_score: null,
            candidate_count: 1,
            match_evidence: buildReversalMatchEvidence({
              sourceTxn,
              counterpartTxn,
            }),
            source_snapshot: toTxnReversalTxnSummary(sourceTxn),
            counterpart_snapshot: toTxnReversalTxnSummary(counterpartTxn),
            proposed_at: now,
            proposed_by_user_id: context.userId,
            version: sql`version + 1`,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('source_txn_public_id', '=', args.input.txnId)
          .where('version', '=', current.version)
          .returningAll()
          .executeTakeFirst();
        if (!updated) {
          throw new AppError(
            'CONFLICT',
            'This pending reversal changed while it was being matched'
          );
        }

        await Promise.all([
          completeReversalComments({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            txnIds: [args.input.txnId, args.input.reversalTxnId],
            userId: context.userId,
            now,
            commentBody: args.input.commentBody,
          }),
          recordReversalTransition({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            actorUserId: context.userId,
            reversalId: current.id,
            eventType: 'txn_reversal.matched_manually',
            reason: 'Manually matched the source and reversal transactions',
            previous: current,
            resulting: updated as TxnReversalRow,
            now,
          }),
        ]);

        return {
          action: args.input.action,
          txn: await getTxnOrThrow({
            db: trx,
            projectId: args.projectId,
            txnId: args.input.txnId,
          }),
          counterpartTxn: await getTxnOrThrow({
            db: trx,
            projectId: args.projectId,
            txnId: args.input.reversalTxnId,
          }),
        };
      }

      if (args.input.action === 'approveSuggestedMatch') {
        return approveSuggestedTxnReversalMatch({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          userId: context.userId,
          txnId: args.input.txnId,
          commentBody: args.input.commentBody,
          expectedReversalVersion: args.input.expectedReversalVersion,
          now,
        });
      }

      if (args.input.action === 'rejectSuggestedMatch') {
        return rejectSuggestedTxnReversalMatch({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          userId: context.userId,
          txnId: args.input.txnId,
          commentBody: args.input.commentBody,
          expectedReversalVersion: args.input.expectedReversalVersion,
          now,
        });
      }

      return unmatchTxnReversal({
        db: trx,
        companyId: context.companyId,
        projectId: args.projectId,
        userId: context.userId,
        txnId: args.input.txnId,
        commentBody: args.input.commentBody,
        expectedReversalVersion: args.input.expectedReversalVersion,
        now,
      });
    });
  });
}

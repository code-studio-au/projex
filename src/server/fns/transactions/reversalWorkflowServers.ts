import { sql, type Insertable, type Transaction } from 'kysely';

import { AppError } from '../../../api/errors';
import type { CompanyId, ProjectId, TxnId, UserId } from '../../../types';
import { asTxnId } from '../../../types';
import type {
  TxnReversalActionInput,
  TxnReversalActionResult,
} from '../../../api/types';
import { uid } from '../../../utils/id';
import type { DB, TxnReversalTable } from '../../db/schema';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import { assertTxnUnlocked } from './shared';
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
  assertSuggestedMatchMetadataCompatible,
  getReversalRowForAnyTxn,
  getSourceReversalRow,
  getTxnOrThrow,
  isOpenReversalStatus,
  isSuggestedReversalStatus,
  type TxnReversalRow,
} from './reversalDomain';

function assertExpectedReversalVersion(
  reversal: TxnReversalRow,
  expectedVersion: number | undefined
) {
  if (
    typeof expectedVersion === 'number' &&
    reversal.version !== expectedVersion
  ) {
    throw new AppError(
      'CONFLICT',
      'This reversal workflow changed while you were reviewing it. Refresh and try again.'
    );
  }
}

const clearedMatchFields = {
  matched_reversal_txn_public_id: null,
  matched_at: null,
  matched_by_user_id: null,
  match_method: null,
  match_score: null,
  candidate_count: null,
  match_evidence: null,
  source_snapshot: null,
  counterpart_snapshot: null,
  proposed_at: null,
  proposed_by_user_id: null,
} as const;

export async function approveSuggestedTxnReversalMatch(args: {
  db: Transaction<DB>;
  companyId: CompanyId;
  projectId: ProjectId;
  userId: UserId;
  txnId: TxnId;
  commentBody?: string;
  expectedReversalVersion?: number;
  now: string;
}): Promise<TxnReversalActionResult> {
  const reversal = await getReversalRowForAnyTxn({
    db: args.db,
    projectId: args.projectId,
    txnId: args.txnId,
  });
  if (!reversal || !isSuggestedReversalStatus(reversal.status)) {
    throw new AppError(
      'CONFLICT',
      'This transaction does not have an auto-matched reversal awaiting approval'
    );
  }
  assertExpectedReversalVersion(reversal, args.expectedReversalVersion);

  const sourceTxnId = asTxnId(reversal.source_txn_public_id);
  const counterpartTxnId = reversal.matched_reversal_txn_public_id
    ? asTxnId(reversal.matched_reversal_txn_public_id)
    : null;
  if (!counterpartTxnId) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Suggested reversal row is missing its counterpart transaction'
    );
  }

  await args.db
    .selectFrom('txns')
    .select('public_id')
    .where('project_id', '=', args.projectId)
    .where('public_id', 'in', [sourceTxnId, counterpartTxnId].sort())
    .orderBy('public_id', 'asc')
    .forUpdate()
    .execute();

  const [sourceTxn, counterpartTxn] = await Promise.all([
    getTxnOrThrow({
      db: args.db,
      projectId: args.projectId,
      txnId: sourceTxnId,
    }),
    getTxnOrThrow({
      db: args.db,
      projectId: args.projectId,
      txnId: counterpartTxnId,
    }),
  ]);
  assertSourceTxnEligible(sourceTxn);
  assertCounterpartTxnEligible({ sourceTxn, counterpartTxn });
  assertSuggestedMatchMetadataCompatible({ sourceTxn, counterpartTxn });
  const isAmbiguousSuggested =
    reversal.status === 'auto_matched_ambiguous_pending_approval';

  const updated = await args.db
    .updateTable('txn_reversals')
    .set({
      status: 'reversed_matched',
      matched_at: args.now,
      matched_by_user_id: args.userId,
      version: sql`version + 1`,
      updated_at: args.now,
    })
    .where('project_id', '=', args.projectId)
    .where('source_txn_public_id', '=', sourceTxnId)
    .where('matched_reversal_txn_public_id', '=', counterpartTxnId)
    .where('status', 'in', [
      'auto_matched_pending_approval',
      'auto_matched_ambiguous_pending_approval',
    ])
    .where('version', '=', reversal.version)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    throw new AppError(
      'CONFLICT',
      'The suggested reversal changed while it was being approved'
    );
  }

  await Promise.all([
    completeReversalComments({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      txnIds: [sourceTxnId, counterpartTxnId],
      userId: args.userId,
      now: args.now,
      commentBody: args.commentBody,
    }),
    recordReversalTransition({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      actorUserId: args.userId,
      reversalId: reversal.id,
      eventType: 'txn_reversal.match_approved',
      reason: isAmbiguousSuggested
        ? 'Approved the deterministic default reversal proposal'
        : 'Approved the automatic reversal proposal',
      previous: reversal,
      resulting: updated as TxnReversalRow,
      now: args.now,
    }),
  ]);

  return {
    action: 'approveSuggestedMatch',
    txn: await getTxnOrThrow({
      db: args.db,
      projectId: args.projectId,
      txnId: sourceTxnId,
    }),
    counterpartTxn: await getTxnOrThrow({
      db: args.db,
      projectId: args.projectId,
      txnId: counterpartTxnId,
    }),
  };
}

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
        const reversal = await getReversalRowForAnyTxn({
          db: trx,
          projectId: args.projectId,
          txnId: args.input.txnId,
        });
        if (!reversal || !isSuggestedReversalStatus(reversal.status)) {
          throw new AppError(
            'CONFLICT',
            'This transaction does not have an auto-matched reversal awaiting approval'
          );
        }
        assertExpectedReversalVersion(
          reversal,
          args.input.expectedReversalVersion
        );

        const sourceTxnId = asTxnId(reversal.source_txn_public_id);
        const counterpartTxnId = reversal.matched_reversal_txn_public_id
          ? asTxnId(reversal.matched_reversal_txn_public_id)
          : null;
        if (!counterpartTxnId) {
          throw new AppError(
            'INTERNAL_ERROR',
            'Suggested reversal row is missing its counterpart transaction'
          );
        }

        const [sourceTxn, counterpartTxn] = await Promise.all([
          getTxnOrThrow({
            db: trx,
            projectId: args.projectId,
            txnId: sourceTxnId,
          }),
          getTxnOrThrow({
            db: trx,
            projectId: args.projectId,
            txnId: counterpartTxnId,
          }),
        ]);
        assertTxnUnlocked(sourceTxn);
        assertTxnUnlocked(counterpartTxn);
        const isAmbiguousSuggested =
          reversal.status === 'auto_matched_ambiguous_pending_approval';

        await trx
          .insertInto('txn_reversal_match_rejections')
          .values({
            id: uid('txnrj'),
            company_id: context.companyId,
            project_id: args.projectId,
            source_txn_public_id: sourceTxnId,
            counterpart_txn_public_id: counterpartTxnId,
            rejected_at: now,
            rejected_by_user_id: context.userId,
            created_at: now,
            updated_at: now,
          })
          .onConflict((conflict) =>
            conflict
              .columns([
                'project_id',
                'source_txn_public_id',
                'counterpart_txn_public_id',
              ])
              .doUpdateSet({
                rejected_at: now,
                rejected_by_user_id: context.userId,
                updated_at: now,
              })
          )
          .executeTakeFirst();

        const updated = await trx
          .updateTable('txn_reversals')
          .set({
            status: 'pending_reversal',
            ...clearedMatchFields,
            version: sql`version + 1`,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('source_txn_public_id', '=', sourceTxnId)
          .where('version', '=', reversal.version)
          .returningAll()
          .executeTakeFirst();
        if (!updated) {
          throw new AppError(
            'CONFLICT',
            'This suggested reversal changed while it was being rejected'
          );
        }

        await resolveOpenReversalComments({
          db: trx,
          projectId: args.projectId,
          txnIds: [sourceTxnId, counterpartTxnId],
          userId: context.userId,
          now,
        });
        await Promise.all([
          createReversalComment({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            txnId: sourceTxnId,
            userId: context.userId,
            body: args.input.commentBody ?? '',
          }),
          recordReversalTransition({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            actorUserId: context.userId,
            reversalId: reversal.id,
            eventType: 'txn_reversal.match_rejected',
            reason: isAmbiguousSuggested
              ? 'Rejected the deterministic default reversal proposal'
              : 'Rejected the automatic reversal proposal',
            previous: reversal,
            resulting: updated as TxnReversalRow,
            now,
          }),
        ]);

        return {
          action: args.input.action,
          txn: await getTxnOrThrow({
            db: trx,
            projectId: args.projectId,
            txnId: sourceTxnId,
          }),
          counterpartTxn: await getTxnOrThrow({
            db: trx,
            projectId: args.projectId,
            txnId: counterpartTxnId,
          }),
        };
      }

      const reversal = await getReversalRowForAnyTxn({
        db: trx,
        projectId: args.projectId,
        txnId: args.input.txnId,
      });
      if (!reversal || reversal.status !== 'reversed_matched') {
        throw new AppError(
          'CONFLICT',
          'This transaction is not currently matched to a reversal'
        );
      }
      assertExpectedReversalVersion(
        reversal,
        args.input.expectedReversalVersion
      );

      const sourceTxnId = asTxnId(reversal.source_txn_public_id);
      const counterpartTxnId = reversal.matched_reversal_txn_public_id
        ? asTxnId(reversal.matched_reversal_txn_public_id)
        : null;
      if (!counterpartTxnId) {
        throw new AppError(
          'INTERNAL_ERROR',
          'Matched reversal row is missing its counterpart transaction'
        );
      }

      const [sourceTxn, counterpartTxn] = await Promise.all([
        getTxnOrThrow({
          db: trx,
          projectId: args.projectId,
          txnId: sourceTxnId,
        }),
        getTxnOrThrow({
          db: trx,
          projectId: args.projectId,
          txnId: counterpartTxnId,
        }),
      ]);
      assertTxnUnlocked(sourceTxn);
      assertTxnUnlocked(counterpartTxn);

      if (reversal.match_method !== 'manual') {
        await trx
          .insertInto('txn_reversal_match_rejections')
          .values({
            id: uid('txnrj'),
            company_id: context.companyId,
            project_id: args.projectId,
            source_txn_public_id: sourceTxnId,
            counterpart_txn_public_id: counterpartTxnId,
            rejected_at: now,
            rejected_by_user_id: context.userId,
            created_at: now,
            updated_at: now,
          })
          .onConflict((conflict) =>
            conflict
              .columns([
                'project_id',
                'source_txn_public_id',
                'counterpart_txn_public_id',
              ])
              .doUpdateSet({
                rejected_at: now,
                rejected_by_user_id: context.userId,
                updated_at: now,
              })
          )
          .executeTakeFirst();
      }

      const updated = await trx
        .updateTable('txn_reversals')
        .set({
          status: 'pending_reversal',
          ...clearedMatchFields,
          version: sql`version + 1`,
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('source_txn_public_id', '=', sourceTxnId)
        .where('version', '=', reversal.version)
        .returningAll()
        .executeTakeFirst();
      if (!updated) {
        throw new AppError(
          'CONFLICT',
          'This reversal match changed while it was being removed'
        );
      }

      await resolveOpenReversalComments({
        db: trx,
        projectId: args.projectId,
        txnIds: [sourceTxnId, counterpartTxnId],
        userId: context.userId,
        now,
      });
      await Promise.all([
        createReversalComment({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          txnId: sourceTxnId,
          userId: context.userId,
          body: args.input.commentBody,
        }),
        recordReversalTransition({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          actorUserId: context.userId,
          reversalId: reversal.id,
          eventType: 'txn_reversal.unmatched',
          reason:
            'Removed the approved reversal match and returned the source to pending',
          previous: reversal,
          resulting: updated as TxnReversalRow,
          now,
        }),
      ]);

      return {
        action: args.input.action,
        txn: await getTxnOrThrow({
          db: trx,
          projectId: args.projectId,
          txnId: sourceTxnId,
        }),
        counterpartTxn: await getTxnOrThrow({
          db: trx,
          projectId: args.projectId,
          txnId: counterpartTxnId,
        }),
      };
    });
  });
}

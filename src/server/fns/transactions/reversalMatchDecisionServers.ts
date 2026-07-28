import { sql, type Transaction } from 'kysely';

import { AppError } from '../../../api/errors';
import type { TxnReversalActionResult } from '../../../api/types';
import type { CompanyId, ProjectId, TxnId, UserId } from '../../../types';
import { asTxnId } from '../../../types';
import { uid } from '../../../utils/id';
import type { DB } from '../../db/schema';
import { assertTxnUnlocked } from './shared';
import { recordReversalTransition } from './reversalAudit';
import {
  completeReversalComments,
  createReversalComment,
  resolveOpenReversalComments,
} from './reversalComments';
import {
  assertCounterpartTxnEligible,
  assertSourceTxnEligible,
  assertSuggestedMatchMetadataCompatible,
  getReversalRowForAnyTxn,
  getTxnOrThrow,
  isSuggestedReversalStatus,
  type TxnReversalRow,
} from './reversalDomain';
import {
  assertExpectedReversalVersion,
  clearedMatchFields,
} from './reversalWorkflowState';

type ReversalMatchDecisionArgs = {
  db: Transaction<DB>;
  companyId: CompanyId;
  projectId: ProjectId;
  userId: UserId;
  txnId: TxnId;
  commentBody?: string;
  expectedReversalVersion?: number;
  now: string;
};

async function recordRejectedReversalPair(args: {
  db: Transaction<DB>;
  companyId: CompanyId;
  projectId: ProjectId;
  userId: UserId;
  sourceTxnId: TxnId;
  counterpartTxnId: TxnId;
  now: string;
}) {
  await args.db
    .insertInto('txn_reversal_match_rejections')
    .values({
      id: uid('txnrj'),
      company_id: args.companyId,
      project_id: args.projectId,
      source_txn_public_id: args.sourceTxnId,
      counterpart_txn_public_id: args.counterpartTxnId,
      rejected_at: args.now,
      rejected_by_user_id: args.userId,
      created_at: args.now,
      updated_at: args.now,
    })
    .onConflict((conflict) =>
      conflict
        .columns([
          'project_id',
          'source_txn_public_id',
          'counterpart_txn_public_id',
        ])
        .doUpdateSet({
          rejected_at: args.now,
          rejected_by_user_id: args.userId,
          updated_at: args.now,
        })
    )
    .executeTakeFirst();
}

export async function approveSuggestedTxnReversalMatch(
  args: ReversalMatchDecisionArgs
): Promise<TxnReversalActionResult> {
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

export async function rejectSuggestedTxnReversalMatch(
  args: ReversalMatchDecisionArgs
): Promise<TxnReversalActionResult> {
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
  assertTxnUnlocked(sourceTxn);
  assertTxnUnlocked(counterpartTxn);
  const isAmbiguousSuggested =
    reversal.status === 'auto_matched_ambiguous_pending_approval';

  await recordRejectedReversalPair({
    ...args,
    sourceTxnId,
    counterpartTxnId,
  });

  const updated = await args.db
    .updateTable('txn_reversals')
    .set({
      status: 'pending_reversal',
      ...clearedMatchFields,
      version: sql`version + 1`,
      updated_at: args.now,
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
    db: args.db,
    projectId: args.projectId,
    txnIds: [sourceTxnId, counterpartTxnId],
    userId: args.userId,
    now: args.now,
  });
  await Promise.all([
    createReversalComment({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      txnId: sourceTxnId,
      userId: args.userId,
      body: args.commentBody ?? '',
    }),
    recordReversalTransition({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      actorUserId: args.userId,
      reversalId: reversal.id,
      eventType: 'txn_reversal.match_rejected',
      reason: isAmbiguousSuggested
        ? 'Rejected the deterministic default reversal proposal'
        : 'Rejected the automatic reversal proposal',
      previous: reversal,
      resulting: updated as TxnReversalRow,
      now: args.now,
    }),
  ]);

  return {
    action: 'rejectSuggestedMatch',
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

export async function unmatchTxnReversal(
  args: ReversalMatchDecisionArgs & { commentBody: string }
): Promise<TxnReversalActionResult> {
  const reversal = await getReversalRowForAnyTxn({
    db: args.db,
    projectId: args.projectId,
    txnId: args.txnId,
  });
  if (!reversal || reversal.status !== 'reversed_matched') {
    throw new AppError(
      'CONFLICT',
      'This transaction is not currently matched to a reversal'
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
      'Matched reversal row is missing its counterpart transaction'
    );
  }

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
  assertTxnUnlocked(sourceTxn);
  assertTxnUnlocked(counterpartTxn);

  if (reversal.match_method !== 'manual') {
    await recordRejectedReversalPair({
      ...args,
      sourceTxnId,
      counterpartTxnId,
    });
  }

  const updated = await args.db
    .updateTable('txn_reversals')
    .set({
      status: 'pending_reversal',
      ...clearedMatchFields,
      version: sql`version + 1`,
      updated_at: args.now,
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
    db: args.db,
    projectId: args.projectId,
    txnIds: [sourceTxnId, counterpartTxnId],
    userId: args.userId,
    now: args.now,
  });
  await Promise.all([
    createReversalComment({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      txnId: sourceTxnId,
      userId: args.userId,
      body: args.commentBody,
    }),
    recordReversalTransition({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      actorUserId: args.userId,
      reversalId: reversal.id,
      eventType: 'txn_reversal.unmatched',
      reason:
        'Removed the approved reversal match and returned the source to pending',
      previous: reversal,
      resulting: updated as TxnReversalRow,
      now: args.now,
    }),
  ]);

  return {
    action: 'unmatch',
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

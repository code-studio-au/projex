import type { Insertable, Transaction } from 'kysely';

import { AppError } from '../../../api/errors';
import type { ProjectId, TxnId } from '../../../types';
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
import { reconcilePendingReversalMatches } from './reversalReconciliation';
import {
  buildApproveAmbiguousSuggestedCounterpartComment,
  buildApproveAmbiguousSuggestedSourceComment,
  buildApproveSuggestedCounterpartComment,
  buildApproveSuggestedSourceComment,
  buildClearExceptionComment,
  buildClearPendingComment,
  buildExceptionComment,
  buildMatchCounterpartComment,
  buildMatchSourceComment,
  buildPendingComment,
  buildRejectAmbiguousSuggestedCounterpartComment,
  buildRejectAmbiguousSuggestedSourceComment,
  buildRejectSuggestedCounterpartComment,
  buildRejectSuggestedSourceComment,
  buildUnmatchCounterpartComment,
  buildUnmatchSourceComment,
  createReversalComment,
  getProjectName,
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
} from './reversalDomain';

export async function approveSuggestedTxnReversalMatch(args: {
  db: Transaction<DB>;
  companyId: string;
  projectId: ProjectId;
  userId: string;
  txnId: TxnId;
  commentBody?: string;
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

  const updateResult = await args.db
    .updateTable('txn_reversals')
    .set({
      status: 'reversed_matched',
      matched_at: args.now,
      matched_by_user_id: args.userId,
      updated_at: args.now,
    })
    .where('project_id', '=', args.projectId)
    .where('source_txn_public_id', '=', sourceTxnId)
    .where('matched_reversal_txn_public_id', '=', counterpartTxnId)
    .where('status', 'in', [
      'auto_matched_pending_approval',
      'auto_matched_ambiguous_pending_approval',
    ])
    .executeTakeFirst();
  if (updateResult.numUpdatedRows !== 1n) {
    throw new AppError(
      'CONFLICT',
      'The suggested reversal changed while it was being approved'
    );
  }

  await Promise.all([
    createReversalComment({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      txnId: sourceTxnId,
      userId: args.userId,
      body: isAmbiguousSuggested
        ? buildApproveAmbiguousSuggestedSourceComment({
            counterpartTxn,
            commentBody: args.commentBody,
          })
        : buildApproveSuggestedSourceComment({
            counterpartTxn,
            commentBody: args.commentBody,
          }),
    }),
    createReversalComment({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      txnId: counterpartTxnId,
      userId: args.userId,
      body: isAmbiguousSuggested
        ? buildApproveAmbiguousSuggestedCounterpartComment({
            sourceTxn,
            commentBody: args.commentBody,
          })
        : buildApproveSuggestedCounterpartComment({
            sourceTxn,
            commentBody: args.commentBody,
          }),
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
        if (current?.status === 'reversed_matched') {
          throw new AppError(
            'CONFLICT',
            'This transaction is already matched to a reversal. Unmatch it before marking it pending again.'
          );
        }

        if (current) {
          await trx
            .updateTable('txn_reversals')
            .set({
              expected_project_id: args.input.expectedProjectId ?? null,
              status: 'pending_reversal',
              updated_at: now,
            })
            .where('project_id', '=', args.projectId)
            .where('source_txn_public_id', '=', args.input.txnId)
            .executeTakeFirst();
        } else {
          await trx
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
            .executeTakeFirst();
        }

        const expectedProjectName = await getProjectName({
          db: trx,
          projectId: args.input.expectedProjectId,
        });
        await createReversalComment({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          txnId: args.input.txnId,
          userId: context.userId,
          body: buildPendingComment({
            expectedProjectName,
            expectedProjectId: args.input.expectedProjectId,
            commentBody: args.input.commentBody,
          }),
        });

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
        if (current.status !== 'pending_reversal') {
          throw new AppError(
            'CONFLICT',
            current.status === 'reversal_exception'
              ? 'Clear the reversal exception instead.'
              : 'Unmatch the reversal before clearing the pending state.'
          );
        }
        await trx
          .deleteFrom('txn_reversals')
          .where('project_id', '=', args.projectId)
          .where('source_txn_public_id', '=', args.input.txnId)
          .executeTakeFirst();
        await createReversalComment({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          txnId: args.input.txnId,
          userId: context.userId,
          body: buildClearPendingComment(args.input.commentBody),
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
        if (!current || !isOpenReversalStatus(current.status)) {
          throw new AppError(
            'CONFLICT',
            'Only pending reversal transactions can be marked as exceptions'
          );
        }
        await trx
          .updateTable('txn_reversals')
          .set({
            status: 'reversal_exception',
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('source_txn_public_id', '=', args.input.txnId)
          .executeTakeFirst();
        await createReversalComment({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          txnId: args.input.txnId,
          userId: context.userId,
          body: buildExceptionComment(args.input.commentBody),
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
        await trx
          .deleteFrom('txn_reversals')
          .where('project_id', '=', args.projectId)
          .where('source_txn_public_id', '=', args.input.txnId)
          .executeTakeFirst();
        await createReversalComment({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          txnId: args.input.txnId,
          userId: context.userId,
          body: buildClearExceptionComment(args.input.commentBody),
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

        await trx
          .updateTable('txn_reversals')
          .set({
            status: 'reversed_matched',
            matched_reversal_txn_public_id: args.input.reversalTxnId,
            matched_at: now,
            matched_by_user_id: context.userId,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('source_txn_public_id', '=', args.input.txnId)
          .executeTakeFirst();

        await Promise.all([
          createReversalComment({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            txnId: args.input.txnId,
            userId: context.userId,
            body: buildMatchSourceComment({
              sourceTxn,
              counterpartTxn,
              commentBody: args.input.commentBody,
            }),
          }),
          createReversalComment({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            txnId: args.input.reversalTxnId,
            userId: context.userId,
            body: buildMatchCounterpartComment({
              sourceTxn,
              commentBody: args.input.commentBody,
            }),
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

        await trx
          .updateTable('txn_reversals')
          .set({
            status: 'pending_reversal',
            matched_reversal_txn_public_id: null,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('source_txn_public_id', '=', sourceTxnId)
          .executeTakeFirst();

        await Promise.all([
          createReversalComment({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            txnId: sourceTxnId,
            userId: context.userId,
            body: isAmbiguousSuggested
              ? buildRejectAmbiguousSuggestedSourceComment({
                  counterpartTxn,
                  commentBody: args.input.commentBody,
                })
              : buildRejectSuggestedSourceComment({
                  counterpartTxn,
                  commentBody: args.input.commentBody,
                }),
          }),
          createReversalComment({
            db: trx,
            companyId: context.companyId,
            projectId: args.projectId,
            txnId: counterpartTxnId,
            userId: context.userId,
            body: isAmbiguousSuggested
              ? buildRejectAmbiguousSuggestedCounterpartComment({
                  sourceTxn,
                  commentBody: args.input.commentBody,
                })
              : buildRejectSuggestedCounterpartComment({
                  sourceTxn,
                  commentBody: args.input.commentBody,
                }),
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

      await trx
        .updateTable('txn_reversals')
        .set({
          status: 'pending_reversal',
          matched_reversal_txn_public_id: null,
          matched_at: null,
          matched_by_user_id: null,
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('source_txn_public_id', '=', sourceTxnId)
        .executeTakeFirst();

      await Promise.all([
        createReversalComment({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          txnId: sourceTxnId,
          userId: context.userId,
          body: buildUnmatchSourceComment({
            counterpartTxn,
            commentBody: args.input.commentBody,
          }),
        }),
        createReversalComment({
          db: trx,
          companyId: context.companyId,
          projectId: args.projectId,
          txnId: counterpartTxnId,
          userId: context.userId,
          body: buildUnmatchCounterpartComment({
            sourceTxn,
            commentBody: args.input.commentBody,
          }),
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

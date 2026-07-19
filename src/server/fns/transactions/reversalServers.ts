import type { Insertable, Kysely, Transaction } from 'kysely';

import { AppError } from '../../../api/errors';
import type { ProjectId, Txn, TxnId, TxnReversalStatus } from '../../../types';
import { asTxnId } from '../../../types';
import type {
  TxnReversalActionInput,
  TxnReversalActionResult,
  TxnReversalMatchSuggestion,
} from '../../../api/types';
import { uid } from '../../../utils/id';
import { toTxn } from '../../mappers/transactionRows';
import type { DB, TxnReversalTable } from '../../db/schema';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import {
  assertTxnUnlocked,
  prefixedTxnSelectColumns,
  txnReversalJoin,
  txnReversalSelectExpressions,
} from './shared';

type DbExecutor = Kysely<DB> | Transaction<DB>;

type TxnReversalRow = {
  id: string;
  company_id: string;
  project_id: string;
  source_txn_public_id: string;
  matched_reversal_txn_public_id: string | null;
  expected_project_id: string | null;
  status: TxnReversalStatus;
  marked_at: string;
  marked_by_user_id: string;
  matched_at: string | null;
  matched_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function isOpenReversalStatus(
  status: TxnReversalStatus
): status is 'pending_reversal' | 'reversal_exception' {
  return status === 'pending_reversal' || status === 'reversal_exception';
}

async function getTxnServerRow(args: {
  db: DbExecutor;
  projectId: ProjectId;
  txnId: TxnId;
}) {
  return args.db
    .selectFrom('txns as t')
    .leftJoin('txn_reversals as tr', txnReversalJoin())
    .select([
      ...prefixedTxnSelectColumns('t'),
      ...txnReversalSelectExpressions({}),
    ])
    .where('t.project_id', '=', args.projectId)
    .where('t.public_id', '=', args.txnId)
    .executeTakeFirst();
}

async function getTxnOrThrow(args: {
  db: DbExecutor;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<Txn> {
  const row = await getTxnServerRow(args);
  if (!row) {
    throw new AppError('NOT_FOUND', 'Unknown transaction');
  }
  return toTxn(row);
}

async function getSourceReversalRow(args: {
  db: DbExecutor;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<TxnReversalRow | null> {
  return (
    (await args.db
      .selectFrom('txn_reversals')
      .selectAll()
      .where('project_id', '=', args.projectId)
      .where('source_txn_public_id', '=', args.txnId)
      .executeTakeFirst()) ?? null
  );
}

async function getReversalRowForAnyTxn(args: {
  db: DbExecutor;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<TxnReversalRow | null> {
  return (
    (await args.db
      .selectFrom('txn_reversals')
      .selectAll()
      .where('project_id', '=', args.projectId)
      .where((eb) =>
        eb.or([
          eb('source_txn_public_id', '=', args.txnId),
          eb('matched_reversal_txn_public_id', '=', args.txnId),
        ])
      )
      .executeTakeFirst()) ?? null
  );
}

async function assertExpectedProject(args: {
  context: ServerFnContextInput;
  sourceProjectId: ProjectId;
  expectedProjectId?: ProjectId;
  db: DbExecutor;
  companyId: string;
}): Promise<void> {
  if (!args.expectedProjectId) return;
  if (args.expectedProjectId === args.sourceProjectId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Expected destination project must be different from the current project'
    );
  }
  const project = await requireOperationalProjectForAction(
    args.context,
    args.expectedProjectId,
    'project:view',
    args.db as Kysely<DB>
  );
  if (project.companyId !== args.companyId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Expected destination project must belong to the same company'
    );
  }
}

function assertSourceTxnEligible(txn: Txn): void {
  assertTxnUnlocked(txn);
  if (!txn.budgetImpact) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Only budget-impact transactions can be marked as pending reversal'
    );
  }
  if (txn.amountCents <= 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Pending reversal can only be recorded against positive source transactions'
    );
  }
}

function assertCounterpartTxnEligible(args: {
  sourceTxn: Txn;
  counterpartTxn: Txn;
}): void {
  assertTxnUnlocked(args.counterpartTxn);
  if (!args.counterpartTxn.budgetImpact) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Matched reversal transactions must affect the budget'
    );
  }
  if (args.counterpartTxn.id === args.sourceTxn.id) {
    throw new AppError(
      'VALIDATION_ERROR',
      'A transaction cannot be matched to itself as a reversal'
    );
  }
  if (args.counterpartTxn.amountCents >= 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Matched reversal transactions must be negative amounts'
    );
  }
  if (
    Math.abs(args.counterpartTxn.amountCents) !== args.sourceTxn.amountCents
  ) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Matched reversal transactions must have the same absolute amount as the source transaction'
    );
  }
}

function appendUserNote(body: string | undefined): string {
  const trimmed = body?.trim();
  return trimmed ? `\n\nNote:\n${trimmed}` : '';
}

function formatSignedMajorUnits(amountCents: number): string {
  const sign = amountCents < 0 ? '-' : '';
  return `${sign}${(Math.abs(amountCents) / 100).toFixed(2)}`;
}

async function createReversalComment(args: {
  db: DbExecutor;
  companyId: string;
  projectId: ProjectId;
  txnId: TxnId;
  userId: string;
  body: string;
}) {
  await args.db
    .insertInto('txn_comments')
    .values({
      id: uid('cmt'),
      company_id: args.companyId,
      project_id: args.projectId,
      txn_public_id: args.txnId,
      parent_comment_id: null,
      body: args.body,
      assigned_to_user_id: null,
      created_by_user_id: args.userId,
      resolved_at: null,
      resolved_by_user_id: null,
    })
    .executeTakeFirst();
}

async function getProjectName(args: {
  db: DbExecutor;
  projectId?: ProjectId;
}): Promise<string | null> {
  if (!args.projectId) return null;
  const row = await args.db
    .selectFrom('projects')
    .select('name')
    .where('id', '=', args.projectId)
    .executeTakeFirst();
  return row?.name ?? null;
}

function buildPendingComment(args: {
  expectedProjectName: string | null;
  expectedProjectId?: ProjectId;
  commentBody: string;
}) {
  const destinationLine = args.expectedProjectId
    ? `Expected destination project: ${args.expectedProjectName ?? args.expectedProjectId} (${args.expectedProjectId})`
    : 'Expected destination project: not specified';
  return `[Pending reversal]
To be moved in Power BI; reversal is expected in a future import.
${destinationLine}${appendUserNote(args.commentBody)}`;
}

function buildClearPendingComment(commentBody: string) {
  return `[Pending reversal cleared]
The transaction is no longer marked as awaiting a Power BI reversal.${appendUserNote(commentBody)}`;
}

function buildExceptionComment(commentBody: string) {
  return `[Reversal exception]
This pending reversal needs manual review before it can be matched.${appendUserNote(commentBody)}`;
}

function buildClearExceptionComment(commentBody: string) {
  return `[Reversal exception cleared]
The transaction is no longer marked as a reversal exception.${appendUserNote(commentBody)}`;
}

function buildMatchSourceComment(args: {
  sourceTxn: Txn;
  counterpartTxn: Txn;
  commentBody?: string;
}) {
  return `[Reversal matched]
Matched to ${args.counterpartTxn.id} on ${args.counterpartTxn.date} for ${formatSignedMajorUnits(args.counterpartTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

function buildMatchCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody?: string;
}) {
  return `[Matched as reversal]
Matched to pending reversal transaction ${args.sourceTxn.id} dated ${args.sourceTxn.date} for ${formatSignedMajorUnits(args.sourceTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

function buildUnmatchSourceComment(args: {
  counterpartTxn: Txn;
  commentBody: string;
}) {
  return `[Reversal match removed]
Removed the match to ${args.counterpartTxn.id}; the transaction is pending reversal again.${appendUserNote(args.commentBody)}`;
}

function buildUnmatchCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody: string;
}) {
  return `[Removed as reversal match]
Removed the match to source transaction ${args.sourceTxn.id}.${appendUserNote(args.commentBody)}`;
}

function normalizeSuggestionReason(reason: string) {
  return reason.replace(/\s+/g, ' ').trim();
}

function buildSuggestion(args: {
  sourceTxn: Txn;
  candidateTxn: Txn;
}): TxnReversalMatchSuggestion {
  const reasons: string[] = [];
  let score = 0;

  if (
    args.sourceTxn.externalId &&
    args.candidateTxn.externalId &&
    args.sourceTxn.externalId === args.candidateTxn.externalId
  ) {
    score += 100;
    reasons.push('Same external ID');
  }

  if (args.sourceTxn.item.trim() === args.candidateTxn.item.trim()) {
    score += 20;
    reasons.push('Same item');
  }

  if (
    args.sourceTxn.description.trim() === args.candidateTxn.description.trim()
  ) {
    score += 15;
    reasons.push('Same description');
  }

  const dayDelta = Math.round(
    (Date.parse(args.candidateTxn.date) - Date.parse(args.sourceTxn.date)) /
      (24 * 60 * 60 * 1000)
  );
  if (dayDelta >= 0 && dayDelta <= 62) {
    score += dayDelta <= 31 ? 25 : 12;
    reasons.push(
      dayDelta === 0
        ? 'Same transaction date'
        : `Candidate arrives ${dayDelta} day${dayDelta === 1 ? '' : 's'} later`
    );
  }

  reasons.push('Same project');
  reasons.push('Same absolute amount');
  reasons.push('Opposite sign');

  return {
    txnId: args.candidateTxn.id,
    externalId: args.candidateTxn.externalId,
    date: args.candidateTxn.date,
    item: args.candidateTxn.item,
    description: args.candidateTxn.description,
    amountCents: args.candidateTxn.amountCents,
    score,
    reasons: reasons.map(normalizeSuggestionReason),
  };
}

export async function listTxnReversalMatchSuggestionsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<TxnReversalMatchSuggestion[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:manage_reversals'
    );
    const sourceTxn = await getTxnOrThrow({
      db: context.db,
      projectId: args.projectId,
      txnId: args.txnId,
    });
    assertSourceTxnEligible(sourceTxn);

    const candidateRows = await context.db
      .selectFrom('txns as t')
      .leftJoin('txn_reversals as tr', txnReversalJoin())
      .select([
        ...prefixedTxnSelectColumns('t'),
        ...txnReversalSelectExpressions({}),
      ])
      .where('t.project_id', '=', args.projectId)
      .where('t.public_id', '!=', args.txnId)
      .where('t.locked_at', 'is', null)
      .where('t.budget_impact', '=', true)
      .where('t.amount_cents', '=', -sourceTxn.amountCents)
      .where('tr.id', 'is', null)
      .orderBy('t.txn_date', 'desc')
      .orderBy('t.id', 'desc')
      .limit(20)
      .execute();

    return candidateRows
      .map((row) => buildSuggestion({ sourceTxn, candidateTxn: toTxn(row) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.date.localeCompare(a.date);
      });
  });
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

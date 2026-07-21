import { sql, type Insertable, type Kysely, type Transaction } from 'kysely';

import { AppError } from '../../../api/errors';
import type { ProjectId, Txn, TxnId, TxnReversalStatus } from '../../../types';
import { asTxnId } from '../../../types';
import type {
  TxnBulkActionResult,
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
import {
  buildReversalAutoMatchPlan,
  isValidReversalAutoMatchEdge,
  reversalAutoMatchPairKey,
  type ReversalAutoMatchPlanEntry,
} from './reversalMatching';

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

function isSuggestedReversalStatus(
  status: TxnReversalStatus
): status is
  | 'auto_matched_pending_approval'
  | 'auto_matched_ambiguous_pending_approval' {
  return (
    status === 'auto_matched_pending_approval' ||
    status === 'auto_matched_ambiguous_pending_approval'
  );
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

function assertSuggestedMatchMetadataCompatible(args: {
  sourceTxn: Txn;
  counterpartTxn: Txn;
}): void {
  if (isValidReversalAutoMatchEdge(args)) return;
  throw new AppError(
    'CONFLICT',
    'This auto-matched reversal is no longer compatible with the source transaction. Reject it and review the match manually.'
  );
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

function buildSuggestedSourceComment(args: { counterpartTxn: Txn }) {
  return `[Reversal match suggested]
Auto-matched to ${args.counterpartTxn.id} on ${args.counterpartTxn.date} for ${formatSignedMajorUnits(args.counterpartTxn.amountCents)}. Awaiting admin approval.`;
}

function buildSuggestedCounterpartComment(args: { sourceTxn: Txn }) {
  return `[Suggested as reversal]
Auto-matched to pending reversal transaction ${args.sourceTxn.id} dated ${args.sourceTxn.date} for ${formatSignedMajorUnits(args.sourceTxn.amountCents)}. Awaiting admin approval.`;
}

function buildAmbiguousSuggestedSourceComment(args: {
  counterpartTxn: Txn;
  validCounterpartTxnIds: TxnId[];
}) {
  return `[Default reversal match selected]
The EXA matching group had overlapping candidates, so a deterministic valid default was selected for review.
Defaulted to ${args.counterpartTxn.id} on ${args.counterpartTxn.date} for ${formatSignedMajorUnits(args.counterpartTxn.amountCents)}.
Valid reversal candidates for this source: ${args.validCounterpartTxnIds.join(', ')}.

Review and approve the default match, or reject it to return this transaction to manual matching.`;
}

function buildAmbiguousSuggestedCounterpartComment(args: {
  sourceTxn: Txn;
  validSourceTxnIds: TxnId[];
}) {
  return `[Defaulted as reversal]
The EXA matching group had overlapping candidates, so this transaction was default-matched to ${args.sourceTxn.id} dated ${args.sourceTxn.date} for ${formatSignedMajorUnits(args.sourceTxn.amountCents)}.
Valid pending reversal sources for this transaction: ${args.validSourceTxnIds.join(', ')}.
Awaiting admin approval.`;
}

function buildApproveSuggestedSourceComment(args: {
  counterpartTxn: Txn;
  commentBody?: string;
}) {
  return `[Reversal matched]
Approved auto-matched reversal to ${args.counterpartTxn.id} on ${args.counterpartTxn.date} for ${formatSignedMajorUnits(args.counterpartTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

function buildApproveSuggestedCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody?: string;
}) {
  return `[Matched as reversal]
Approved auto-match to pending reversal transaction ${args.sourceTxn.id} dated ${args.sourceTxn.date} for ${formatSignedMajorUnits(args.sourceTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

function buildApproveAmbiguousSuggestedSourceComment(args: {
  counterpartTxn: Txn;
  commentBody?: string;
}) {
  return `[Reversal matched]
Approved the defaulted reversal match to ${args.counterpartTxn.id} on ${args.counterpartTxn.date} for ${formatSignedMajorUnits(args.counterpartTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

function buildApproveAmbiguousSuggestedCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody?: string;
}) {
  return `[Matched as reversal]
Approved the defaulted match to pending reversal transaction ${args.sourceTxn.id} dated ${args.sourceTxn.date} for ${formatSignedMajorUnits(args.sourceTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

function buildRejectSuggestedSourceComment(args: {
  counterpartTxn: Txn;
  commentBody?: string;
}) {
  return `[Suggested reversal rejected]
Removed the auto-suggested match to ${args.counterpartTxn.id}; the transaction is pending reversal again.${appendUserNote(args.commentBody)}`;
}

function buildRejectSuggestedCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody?: string;
}) {
  return `[Removed as suggested reversal]
Removed the auto-suggested match to source transaction ${args.sourceTxn.id}.${appendUserNote(args.commentBody)}`;
}

function buildRejectAmbiguousSuggestedSourceComment(args: {
  counterpartTxn: Txn;
  commentBody?: string;
}) {
  return `[Default reversal match rejected]
Removed the defaulted match to ${args.counterpartTxn.id}; the transaction is pending reversal again.${appendUserNote(args.commentBody)}`;
}

function buildRejectAmbiguousSuggestedCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody?: string;
}) {
  return `[Removed as defaulted reversal]
Removed the defaulted match to source transaction ${args.sourceTxn.id}.${appendUserNote(args.commentBody)}`;
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

async function markAutoMatchPlanForReview(args: {
  db: DbExecutor;
  companyId: string;
  projectId: ProjectId;
  userId: string;
  matches: ReversalAutoMatchPlanEntry[];
}): Promise<number> {
  if (!args.matches.length) return 0;

  const now = new Date().toISOString();
  let suggestedCount = 0;
  for (const match of args.matches) {
    const updateResult = await args.db
      .updateTable('txn_reversals')
      .set({
        status: match.ambiguous
          ? 'auto_matched_ambiguous_pending_approval'
          : 'auto_matched_pending_approval',
        matched_reversal_txn_public_id: match.counterpartTxn.id,
        matched_at: null,
        matched_by_user_id: null,
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('source_txn_public_id', '=', match.sourceTxn.id)
      .where('status', '=', 'pending_reversal')
      .executeTakeFirst();
    if (updateResult.numUpdatedRows !== 1n) continue;

    await Promise.all([
      createReversalComment({
        db: args.db,
        companyId: args.companyId,
        projectId: args.projectId,
        txnId: match.sourceTxn.id,
        userId: args.userId,
        body: match.ambiguous
          ? buildAmbiguousSuggestedSourceComment({
              counterpartTxn: match.counterpartTxn,
              validCounterpartTxnIds: match.sourceCandidateTxnIds,
            })
          : buildSuggestedSourceComment({
              counterpartTxn: match.counterpartTxn,
            }),
      }),
      createReversalComment({
        db: args.db,
        companyId: args.companyId,
        projectId: args.projectId,
        txnId: match.counterpartTxn.id,
        userId: args.userId,
        body: match.ambiguous
          ? buildAmbiguousSuggestedCounterpartComment({
              sourceTxn: match.sourceTxn,
              validSourceTxnIds: match.counterpartCandidateTxnIds,
            })
          : buildSuggestedCounterpartComment({
              sourceTxn: match.sourceTxn,
            }),
      }),
    ]);
    suggestedCount += 1;
  }
  return suggestedCount;
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

export type ReversalReconciliationResult = {
  pendingSourceCount: number;
  eligibleSourceCount: number;
  lockedSourceCount: number;
  ineligibleSourceCount: number;
  candidateCount: number;
  suggestedCount: number;
};

function emptyReversalReconciliationResult(): ReversalReconciliationResult {
  return {
    pendingSourceCount: 0,
    eligibleSourceCount: 0,
    lockedSourceCount: 0,
    ineligibleSourceCount: 0,
    candidateCount: 0,
    suggestedCount: 0,
  };
}

function addDays(date: string, days: number) {
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export async function reconcilePendingReversalMatches(args: {
  db: Transaction<DB>;
  companyId: string;
  projectId: ProjectId;
  userId: string;
  sourceTxnIds?: TxnId[];
  counterpartTxnIds?: TxnId[];
}): Promise<ReversalReconciliationResult> {
  if (args.sourceTxnIds && !args.sourceTxnIds.length) {
    return emptyReversalReconciliationResult();
  }
  if (args.counterpartTxnIds && !args.counterpartTxnIds.length) {
    return emptyReversalReconciliationResult();
  }

  await sql`select pg_advisory_xact_lock(hashtextextended(${`txn-reversal:${args.projectId}`}, 0))`.execute(
    args.db
  );

  let pendingSourceQuery = args.db
    .selectFrom('txns as t')
    .innerJoin('txn_reversals as tr', (join) =>
      join
        .onRef('tr.project_id', '=', 't.project_id')
        .onRef('tr.source_txn_public_id', '=', 't.public_id')
    )
    .select([
      ...prefixedTxnSelectColumns('t'),
      ...txnReversalSelectExpressions({}),
    ])
    .where('t.project_id', '=', args.projectId)
    .where('tr.status', '=', 'pending_reversal');
  if (args.sourceTxnIds) {
    pendingSourceQuery = pendingSourceQuery.where(
      't.public_id',
      'in',
      args.sourceTxnIds
    );
  }
  const pendingSources = (await pendingSourceQuery.execute()).map((row) =>
    toTxn(row)
  );
  const lockedSourceCount = pendingSources.filter((txn) => txn.lockedAt).length;
  const availableSources = pendingSources.filter(
    (txn) =>
      !txn.lockedAt &&
      txn.budgetImpact &&
      txn.amountCents > 0 &&
      Number.isFinite(Date.parse(txn.date))
  );
  const ineligibleSourceCount =
    pendingSources.length - availableSources.length - lockedSourceCount;
  const baseResult = {
    pendingSourceCount: pendingSources.length,
    eligibleSourceCount: availableSources.length,
    lockedSourceCount,
    ineligibleSourceCount,
    candidateCount: 0,
    suggestedCount: 0,
  };
  if (!availableSources.length) return baseResult;

  const sourceDates = availableSources.map((txn) => txn.date).sort();
  const latestCounterpartDate = addDays(sourceDates.at(-1)!, 62);
  if (!latestCounterpartDate) return baseResult;
  const counterpartAmounts = [
    ...new Set(availableSources.map((txn) => -txn.amountCents)),
  ];

  let counterpartQuery = args.db
    .selectFrom('txns as t')
    .leftJoin('txn_reversals as tr', txnReversalJoin())
    .select([
      ...prefixedTxnSelectColumns('t'),
      ...txnReversalSelectExpressions({}),
    ])
    .where('t.project_id', '=', args.projectId)
    .where('t.import_source_type', '=', 'powerbi_expenditure_actuals')
    .where('t.locked_at', 'is', null)
    .where('t.budget_impact', '=', true)
    .where('t.amount_cents', 'in', counterpartAmounts)
    .where('t.txn_date', '>=', sourceDates[0]!)
    .where('t.txn_date', '<=', latestCounterpartDate)
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom('txns as source')
          .select('source.public_id')
          .whereRef('source.project_id', '=', 't.project_id')
          .where(
            'source.public_id',
            'in',
            availableSources.map((txn) => txn.id)
          )
          .where(
            sql<boolean>`${sql.ref('source.amount_cents')} = -${sql.ref('t.amount_cents')}`
          )
          .whereRef('source.txn_date', '<=', 't.txn_date')
          .where(
            sql<boolean>`${sql.ref('t.txn_date')} <= ${sql.ref('source.txn_date')} + interval '62 days'`
          )
      )
    )
    .where('tr.id', 'is', null);
  if (args.counterpartTxnIds) {
    counterpartQuery = counterpartQuery.where(
      't.public_id',
      'in',
      args.counterpartTxnIds
    );
  }
  const counterpartTxns = (await counterpartQuery.execute()).map((row) =>
    toTxn(row)
  );
  if (!counterpartTxns.length) return baseResult;

  const rejectedPairs = await args.db
    .selectFrom('txn_reversal_match_rejections')
    .select(['source_txn_public_id', 'counterpart_txn_public_id'])
    .where('project_id', '=', args.projectId)
    .where(
      'source_txn_public_id',
      'in',
      availableSources.map((txn) => txn.id)
    )
    .execute();
  const excludedPairKeys = new Set(
    rejectedPairs.map((row) =>
      reversalAutoMatchPairKey(
        asTxnId(row.source_txn_public_id),
        asTxnId(row.counterpart_txn_public_id)
      )
    )
  );
  const matches = buildReversalAutoMatchPlan({
    sourceTxns: availableSources,
    counterpartTxns,
    excludedPairKeys,
  });
  const suggestedCount = await markAutoMatchPlanForReview({
    db: args.db,
    companyId: args.companyId,
    projectId: args.projectId,
    userId: args.userId,
    matches,
  });
  return {
    ...baseResult,
    candidateCount: counterpartTxns.length,
    suggestedCount,
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
        assertSourceTxnEligible(sourceTxn);
        assertCounterpartTxnEligible({ sourceTxn, counterpartTxn });
        assertSuggestedMatchMetadataCompatible({ sourceTxn, counterpartTxn });
        const isAmbiguousSuggested =
          reversal.status === 'auto_matched_ambiguous_pending_approval';

        await trx
          .updateTable('txn_reversals')
          .set({
            status: 'reversed_matched',
            matched_at: now,
            matched_by_user_id: context.userId,
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
              ? buildApproveAmbiguousSuggestedSourceComment({
                  counterpartTxn,
                  commentBody: args.input.commentBody,
                })
              : buildApproveSuggestedSourceComment({
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
              ? buildApproveAmbiguousSuggestedCounterpartComment({
                  sourceTxn,
                  commentBody: args.input.commentBody,
                })
              : buildApproveSuggestedCounterpartComment({
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

    const selectedRows = await context.db
      .selectFrom('txns as t')
      .leftJoin('txn_reversals as tr', txnReversalJoin())
      .select([
        't.public_id',
        't.locked_at',
        'tr.id as reversal_id',
        'tr.status as reversal_status',
      ])
      .where('t.project_id', '=', args.projectId)
      .where('t.public_id', 'in', args.txnIds)
      .execute();

    const selectedByTxnId = new Map(
      selectedRows.map((row) => [row.public_id, row] as const)
    );

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
      if (
        !row.reversal_id ||
        !row.reversal_status ||
        !isSuggestedReversalStatus(row.reversal_status)
      ) {
        ineligibleCount += 1;
        continue;
      }
      if (uniqueReversalSelections.has(row.reversal_id)) {
        unchangedCount += 1;
        continue;
      }
      uniqueReversalSelections.set(row.reversal_id, asTxnId(row.public_id));
    }

    for (const txnId of uniqueReversalSelections.values()) {
      const result = await applyTxnReversalActionServer({
        context: args.context,
        projectId: args.projectId,
        input: {
          action: 'approveSuggestedMatch',
          txnId,
        },
      });
      if (result.txn.reversal?.status === 'reversed_matched') {
        updatedCount += 1;
      } else {
        unchangedCount += 1;
      }
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
}

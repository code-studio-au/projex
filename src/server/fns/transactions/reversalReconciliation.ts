import { sql, type Transaction } from 'kysely';
import { isDeepStrictEqual } from 'node:util';

import type { TxnReversalMatchSuggestion } from '../../../api/types';
import type { CompanyId, ProjectId, Txn, TxnId, UserId } from '../../../types';
import { asTxnId } from '../../../types';
import { toTxn } from '../../mappers/transactionRows';
import type { DB } from '../../db/schema';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import {
  prefixedTxnSelectColumns,
  txnReversalJoin,
  txnReversalSelectExpressions,
} from './shared';
import {
  buildReversalMatchEvidence,
  toTxnReversalTxnSummary,
} from './reversalMatchFacts';
import {
  buildReversalAutoMatchPlan,
  reversalAutoMatchPairKey,
  type ReversalAutoMatchPlanEntry,
} from './reversalMatching';
import { lockProjectReversalWorkflow } from './reversalConcurrency';
import type { ReversalDbExecutor } from './reversalTypes';
import { assertSourceTxnEligible, getTxnOrThrow } from './reversalDomain';
import { getSourceReversalRow, type TxnReversalRow } from './reversalDomain';
import { recordReversalTransition } from './reversalAudit';

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
  reasons.push('Same project', 'Same absolute amount', 'Opposite sign');

  return {
    txnId: args.candidateTxn.id,
    externalId: args.candidateTxn.externalId,
    date: args.candidateTxn.date,
    item: args.candidateTxn.item,
    description: args.candidateTxn.description,
    amountCents: args.candidateTxn.amountCents,
    score,
    reasons: reasons.map(normalizeSuggestionReason),
    evidence: buildReversalMatchEvidence({
      sourceTxn: args.sourceTxn,
      counterpartTxn: args.candidateTxn,
    }),
  };
}

async function markAutoMatchPlanForReview(args: {
  db: ReversalDbExecutor;
  companyId: CompanyId;
  projectId: ProjectId;
  userId: UserId;
  matches: ReversalAutoMatchPlanEntry[];
}): Promise<number> {
  if (!args.matches.length) return 0;

  const now = new Date().toISOString();
  let suggestedCount = 0;
  for (const match of args.matches) {
    const previous = await getSourceReversalRow({
      db: args.db,
      projectId: args.projectId,
      txnId: match.sourceTxn.id,
    });
    if (
      !previous ||
      ![
        'pending_reversal',
        'auto_matched_pending_approval',
        'auto_matched_ambiguous_pending_approval',
      ].includes(previous.status)
    ) {
      continue;
    }

    const matchMethod = match.ambiguous ? 'auto_default' : 'auto_clear';
    const candidateCount = Math.max(
      match.sourceCandidateTxnIds.length,
      match.counterpartCandidateTxnIds.length
    );
    const evidence = buildReversalMatchEvidence({
      sourceTxn: match.sourceTxn,
      counterpartTxn: match.counterpartTxn,
      sourceCandidateCount: match.sourceCandidateTxnIds.length,
      counterpartCandidateCount: match.counterpartCandidateTxnIds.length,
      alternativeCounterparts: match.validCounterpartTxns.filter(
        (txn) => txn.id !== match.counterpartTxn.id
      ),
    });
    const desiredStatus = match.ambiguous
      ? 'auto_matched_ambiguous_pending_approval'
      : 'auto_matched_pending_approval';
    const sourceSnapshot = toTxnReversalTxnSummary(match.sourceTxn);
    const counterpartSnapshot = toTxnReversalTxnSummary(match.counterpartTxn);
    const proposalIsUnchanged =
      previous.status === desiredStatus &&
      previous.matched_reversal_txn_public_id === match.counterpartTxn.id &&
      previous.match_method === matchMethod &&
      previous.match_score === match.score &&
      previous.candidate_count === candidateCount &&
      isDeepStrictEqual(previous.match_evidence, evidence) &&
      isDeepStrictEqual(previous.source_snapshot, sourceSnapshot) &&
      isDeepStrictEqual(previous.counterpart_snapshot, counterpartSnapshot);
    if (proposalIsUnchanged) continue;

    const updated = await args.db
      .updateTable('txn_reversals')
      .set({
        status: desiredStatus,
        matched_reversal_txn_public_id: match.counterpartTxn.id,
        matched_at: null,
        matched_by_user_id: null,
        match_method: matchMethod,
        match_score: match.score,
        candidate_count: candidateCount,
        match_evidence: evidence,
        source_snapshot: sourceSnapshot,
        counterpart_snapshot: counterpartSnapshot,
        proposed_at: now,
        proposed_by_user_id: args.userId,
        version: sql`version + 1`,
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('source_txn_public_id', '=', match.sourceTxn.id)
      .where('status', 'in', [
        'pending_reversal',
        'auto_matched_pending_approval',
        'auto_matched_ambiguous_pending_approval',
      ])
      .where('version', '=', previous.version)
      .returningAll()
      .executeTakeFirst();
    if (!updated) continue;

    await recordReversalTransition({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      actorUserId: args.userId,
      reversalId: updated.id,
      eventType: 'txn_reversal.match_suggested',
      reason: match.ambiguous
        ? 'Created a deterministic default reversal proposal for an ambiguous candidate group'
        : 'Created an unambiguous automatic reversal proposal',
      previous,
      resulting: updated as TxnReversalRow,
      now,
    });
    suggestedCount += 1;
  }
  return suggestedCount;
}

async function resetUnselectedSuggestions(args: {
  db: ReversalDbExecutor;
  companyId: CompanyId;
  projectId: ProjectId;
  userId: UserId;
  selectedSourceTxnIds: ReadonlySet<TxnId>;
}) {
  const staleSuggestions = (await args.db
    .selectFrom('txn_reversals')
    .selectAll()
    .where('project_id', '=', args.projectId)
    .where('status', 'in', [
      'auto_matched_pending_approval',
      'auto_matched_ambiguous_pending_approval',
    ])
    .forUpdate()
    .execute()) as TxnReversalRow[];
  const now = new Date().toISOString();
  for (const suggestion of staleSuggestions) {
    if (
      args.selectedSourceTxnIds.has(asTxnId(suggestion.source_txn_public_id))
    ) {
      continue;
    }
    const reset = await args.db
      .updateTable('txn_reversals')
      .set({
        status: 'pending_reversal',
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
        version: sql`version + 1`,
        updated_at: now,
      })
      .where('id', '=', suggestion.id)
      .where('version', '=', suggestion.version)
      .returningAll()
      .executeTakeFirst();
    if (!reset) continue;
    await recordReversalTransition({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      actorUserId: args.userId,
      reversalId: suggestion.id,
      eventType: 'txn_reversal.proposal_withdrawn',
      reason: 'No compatible counterpart remained after full reconciliation',
      previous: suggestion,
      resulting: reset as TxnReversalRow,
      now,
    });
  }
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
    const latestCandidateDate = addDays(sourceTxn.date, 62);
    if (!latestCandidateDate) return [];

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
      .where('t.txn_date', '>=', sourceTxn.date)
      .where('t.txn_date', '<=', latestCandidateDate)
      .where('tr.id', 'is', null)
      .orderBy('t.txn_date', 'desc')
      .orderBy('t.id', 'desc')
      .execute();

    return candidateRows
      .map((row) => buildSuggestion({ sourceTxn, candidateTxn: toTxn(row) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.date.localeCompare(a.date);
      })
      .slice(0, 20);
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
  companyId: CompanyId;
  projectId: ProjectId;
  userId: UserId;
  sourceTxnIds?: TxnId[];
  counterpartTxnIds?: TxnId[];
}): Promise<ReversalReconciliationResult> {
  if (args.sourceTxnIds && !args.sourceTxnIds.length) {
    return emptyReversalReconciliationResult();
  }
  if (args.counterpartTxnIds && !args.counterpartTxnIds.length) {
    return emptyReversalReconciliationResult();
  }

  await lockProjectReversalWorkflow({ db: args.db, projectId: args.projectId });

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
    .where('tr.status', 'in', [
      'pending_reversal',
      'auto_matched_pending_approval',
      'auto_matched_ambiguous_pending_approval',
    ]);
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
    .where(({ eb, or, and }) =>
      or([
        eb('tr.id', 'is', null),
        and([
          eb('tr.status', 'in', [
            'auto_matched_pending_approval',
            'auto_matched_ambiguous_pending_approval',
          ]),
          eb(
            'tr.source_txn_public_id',
            'in',
            availableSources.map((txn) => txn.id)
          ),
        ]),
      ])
    );
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
  if (!args.sourceTxnIds && !args.counterpartTxnIds) {
    await resetUnselectedSuggestions({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      userId: args.userId,
      selectedSourceTxnIds: new Set(matches.map((match) => match.sourceTxn.id)),
    });
  }
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

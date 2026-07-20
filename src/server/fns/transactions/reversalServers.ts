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
type PowerBiSourceMeta = Partial<Record<string, string>>;
type CanonicalPowerBiSourceMeta = Partial<
  Record<
    'source' | 'journalLineDescription' | 'ccAndDescription' | 'referenceNum',
    string
  >
>;

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
): status is 'auto_matched_pending_approval' {
  return status === 'auto_matched_pending_approval';
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

function buildSuggestedSourceComment(args: { counterpartTxn: Txn }) {
  return `[Reversal match suggested]
Auto-matched to ${args.counterpartTxn.id} on ${args.counterpartTxn.date} for ${formatSignedMajorUnits(args.counterpartTxn.amountCents)}. Awaiting admin approval.`;
}

function buildSuggestedCounterpartComment(args: { sourceTxn: Txn }) {
  return `[Suggested as reversal]
Auto-matched to pending reversal transaction ${args.sourceTxn.id} dated ${args.sourceTxn.date} for ${formatSignedMajorUnits(args.sourceTxn.amountCents)}. Awaiting admin approval.`;
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

function buildAmbiguousAutoMatchComment(args: {
  counterpartTxnIds: TxnId[];
  counterpartAmountCents: number;
}) {
  return `[Auto-match review needed]
Imported reversal candidates matched the same EXA signature and amount, so automatic approval was skipped.
Possible reversal transactions: ${args.counterpartTxnIds.join(', ')}
Imported reversal amount: ${formatSignedMajorUnits(args.counterpartAmountCents)}

Review the suggestions in the pending reversal modal and match the correct transaction manually.`;
}

function normalizeSuggestionReason(reason: string) {
  return reason.replace(/\s+/g, ' ').trim();
}

function normalizeMetaValue(value: string | undefined | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const POWER_BI_META_KEY_ALIASES = {
  source: ['source', 'Source'],
  journalLineDescription: [
    'journalLineDescription',
    'Journal Line Description',
  ],
  ccAndDescription: ['ccAndDescription', 'CC and Description'],
  referenceNum: ['referenceNum', 'Reference Num'],
} as const;

function toPowerBiSourceMeta(
  meta: Txn['importSourceMeta']
): CanonicalPowerBiSourceMeta | null {
  if (!meta) return null;
  const rawMeta = meta as PowerBiSourceMeta;

  return Object.fromEntries(
    Object.entries(POWER_BI_META_KEY_ALIASES).map(([canonicalKey, aliases]) => [
      canonicalKey,
      aliases
        .map((alias) => rawMeta[alias])
        .find((value) => typeof value === 'string' && value.trim()),
    ])
  ) as CanonicalPowerBiSourceMeta;
}

function autoMatchScore(args: { sourceTxn: Txn; counterpartTxn: Txn }): number {
  const sourceMeta = toPowerBiSourceMeta(args.sourceTxn.importSourceMeta);
  const counterpartMeta = toPowerBiSourceMeta(
    args.counterpartTxn.importSourceMeta
  );
  if (!sourceMeta || !counterpartMeta) return Number.NEGATIVE_INFINITY;

  if (
    normalizeMetaValue(sourceMeta.source) !== 'exa' ||
    normalizeMetaValue(counterpartMeta.source) !== 'exa'
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceJournalLineDescription = normalizeMetaValue(
    sourceMeta.journalLineDescription
  );
  const counterpartJournalLineDescription = normalizeMetaValue(
    counterpartMeta.journalLineDescription
  );
  if (
    !sourceJournalLineDescription ||
    sourceJournalLineDescription !== counterpartJournalLineDescription
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceReferenceNum = normalizeMetaValue(sourceMeta.referenceNum);
  const counterpartReferenceNum = normalizeMetaValue(
    counterpartMeta.referenceNum
  );
  if (
    sourceReferenceNum &&
    counterpartReferenceNum &&
    sourceReferenceNum !== counterpartReferenceNum
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const sourceCostCentre = normalizeMetaValue(sourceMeta.ccAndDescription);
  const counterpartCostCentre = normalizeMetaValue(
    counterpartMeta.ccAndDescription
  );
  if (
    sourceCostCentre &&
    counterpartCostCentre &&
    sourceCostCentre !== counterpartCostCentre
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const dayDelta = Math.round(
    (Date.parse(args.counterpartTxn.date) - Date.parse(args.sourceTxn.date)) /
      (24 * 60 * 60 * 1000)
  );
  if (dayDelta < 0 || dayDelta > 62) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 100;
  if (sourceReferenceNum && counterpartReferenceNum) score += 100;
  if (sourceCostCentre && counterpartCostCentre) score += 25;
  if (dayDelta <= 31) score += 25;
  return score;
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

function scoredCounterpartsForSource(args: {
  sourceTxn: Txn;
  counterpartCandidates: Txn[];
}) {
  return args.counterpartCandidates
    .filter(
      (counterpartTxn) =>
        counterpartTxn.amountCents < 0 &&
        args.sourceTxn.amountCents === Math.abs(counterpartTxn.amountCents) &&
        Date.parse(counterpartTxn.date) >= Date.parse(args.sourceTxn.date)
    )
    .map((counterpartTxn) => ({
      counterpartTxn,
      score: autoMatchScore({ sourceTxn: args.sourceTxn, counterpartTxn }),
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.counterpartTxn.date.localeCompare(b.counterpartTxn.date)
    );
}

async function markSourcesForAmbiguousAutoMatchReview(args: {
  db: DbExecutor;
  companyId: string;
  projectId: ProjectId;
  userId: string;
  sourceTxns: Txn[];
  counterpartTxns: Txn[];
}) {
  if (!args.sourceTxns.length || !args.counterpartTxns.length) return;

  const now = new Date().toISOString();
  const counterpartTxnIds = args.counterpartTxns.map((txn) => txn.id);
  const counterpartAmountCents = args.counterpartTxns[0]!.amountCents;

  for (const sourceTxn of args.sourceTxns) {
    await args.db
      .updateTable('txn_reversals')
      .set({
        status: 'reversal_exception',
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('source_txn_public_id', '=', sourceTxn.id)
      .where('status', '=', 'pending_reversal')
      .executeTakeFirst();

    await createReversalComment({
      db: args.db,
      companyId: args.companyId,
      projectId: args.projectId,
      txnId: sourceTxn.id,
      userId: args.userId,
      body: buildAmbiguousAutoMatchComment({
        counterpartTxnIds,
        counterpartAmountCents,
      }),
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

export async function autoSuggestTxnReversalMatchesForImportedTransactions(args: {
  db: DbExecutor;
  companyId: string;
  projectId: ProjectId;
  userId: string;
  importedTransactions: Txn[];
}) {
  const importedCandidates = args.importedTransactions.filter(
    (txn) =>
      txn.importSourceType === 'powerbi_expenditure_actuals' &&
      txn.amountCents < 0 &&
      txn.budgetImpact &&
      !txn.lockedAt
  );
  if (!importedCandidates.length) return;

  const pendingSourceRows = await args.db
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
    .where('t.locked_at', 'is', null)
    .where('t.budget_impact', '=', true)
    .where('t.amount_cents', '>', 0)
    .where('tr.status', '=', 'pending_reversal')
    .execute();

  const availableSources = pendingSourceRows.map((row) => toTxn(row));
  const claimedSourceIds = new Set<string>();
  const reviewFlaggedSourceIds = new Set<string>();
  const claimedCounterpartIds = new Set<string>();

  for (const counterpartTxn of importedCandidates) {
    if (claimedCounterpartIds.has(counterpartTxn.id)) continue;

    const scoredSources = availableSources
      .filter(
        (sourceTxn) =>
          !claimedSourceIds.has(sourceTxn.id) &&
          !reviewFlaggedSourceIds.has(sourceTxn.id) &&
          sourceTxn.amountCents === Math.abs(counterpartTxn.amountCents) &&
          Date.parse(counterpartTxn.date) >= Date.parse(sourceTxn.date)
      )
      .map((sourceTxn) => ({
        sourceTxn,
        score: autoMatchScore({ sourceTxn, counterpartTxn }),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort(
        (a, b) =>
          b.score - a.score || a.sourceTxn.date.localeCompare(b.sourceTxn.date)
      );

    const best = scoredSources[0];
    const runnerUp = scoredSources[1];
    if (!best) continue;
    if (best.score < 125) continue;

    const bestSourceCounterparts = scoredCounterpartsForSource({
      sourceTxn: best.sourceTxn,
      counterpartCandidates: importedCandidates.filter(
        (candidate) => !claimedCounterpartIds.has(candidate.id)
      ),
    });
    const bestSourceRunnerUp = bestSourceCounterparts[1];

    if (runnerUp && runnerUp.score === best.score) {
      const tiedSourceTxns = scoredSources
        .filter((entry) => entry.score === best.score)
        .map((entry) => entry.sourceTxn);
      const tiedCounterpartTxns = bestSourceCounterparts
        .filter((entry) => entry.score === best.score)
        .map((entry) => entry.counterpartTxn);
      tiedSourceTxns.forEach((txn) => reviewFlaggedSourceIds.add(txn.id));
      await markSourcesForAmbiguousAutoMatchReview({
        db: args.db,
        companyId: args.companyId,
        projectId: args.projectId,
        userId: args.userId,
        sourceTxns: tiedSourceTxns,
        counterpartTxns: tiedCounterpartTxns,
      });
      continue;
    }

    if (bestSourceRunnerUp && bestSourceRunnerUp.score === best.score) {
      reviewFlaggedSourceIds.add(best.sourceTxn.id);
      await markSourcesForAmbiguousAutoMatchReview({
        db: args.db,
        companyId: args.companyId,
        projectId: args.projectId,
        userId: args.userId,
        sourceTxns: [best.sourceTxn],
        counterpartTxns: bestSourceCounterparts
          .filter((entry) => entry.score === best.score)
          .map((entry) => entry.counterpartTxn),
      });
      continue;
    }

    claimedSourceIds.add(best.sourceTxn.id);
    claimedCounterpartIds.add(counterpartTxn.id);
    const now = new Date().toISOString();

    await args.db
      .updateTable('txn_reversals')
      .set({
        status: 'auto_matched_pending_approval',
        matched_reversal_txn_public_id: counterpartTxn.id,
        matched_at: null,
        matched_by_user_id: null,
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('source_txn_public_id', '=', best.sourceTxn.id)
      .where('status', '=', 'pending_reversal')
      .executeTakeFirst();

    await Promise.all([
      createReversalComment({
        db: args.db,
        companyId: args.companyId,
        projectId: args.projectId,
        txnId: best.sourceTxn.id,
        userId: args.userId,
        body: buildSuggestedSourceComment({
          counterpartTxn,
        }),
      }),
      createReversalComment({
        db: args.db,
        companyId: args.companyId,
        projectId: args.projectId,
        txnId: counterpartTxn.id,
        userId: args.userId,
        body: buildSuggestedCounterpartComment({
          sourceTxn: best.sourceTxn,
        }),
      }),
    ]);
  }
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
            body: buildApproveSuggestedSourceComment({
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
            body: buildApproveSuggestedCounterpartComment({
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
            body: buildRejectSuggestedSourceComment({
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
            body: buildRejectSuggestedCounterpartComment({
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

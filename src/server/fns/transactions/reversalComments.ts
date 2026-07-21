import type { ProjectId, Txn, TxnId } from '../../../types';
import { uid } from '../../../utils/id';
import type { ReversalDbExecutor } from './reversalTypes';

function appendUserNote(body: string | undefined): string {
  const trimmed = body?.trim();
  return trimmed ? `\n\nNote:\n${trimmed}` : '';
}

function formatSignedMajorUnits(amountCents: number): string {
  const sign = amountCents < 0 ? '-' : '';
  return `${sign}${(Math.abs(amountCents) / 100).toFixed(2)}`;
}

export async function createReversalComment(args: {
  db: ReversalDbExecutor;
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

export async function getProjectName(args: {
  db: ReversalDbExecutor;
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

export function buildPendingComment(args: {
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

export function buildClearPendingComment(commentBody: string) {
  return `[Pending reversal cleared]
The transaction is no longer marked as awaiting a Power BI reversal.${appendUserNote(commentBody)}`;
}

export function buildExceptionComment(commentBody: string) {
  return `[Reversal exception]
This pending reversal needs manual review before it can be matched.${appendUserNote(commentBody)}`;
}

export function buildClearExceptionComment(commentBody: string) {
  return `[Reversal exception cleared]
The transaction is no longer marked as a reversal exception.${appendUserNote(commentBody)}`;
}

export function buildMatchSourceComment(args: {
  sourceTxn: Txn;
  counterpartTxn: Txn;
  commentBody?: string;
}) {
  return `[Reversal matched]
Matched to ${args.counterpartTxn.id} on ${args.counterpartTxn.date} for ${formatSignedMajorUnits(args.counterpartTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

export function buildMatchCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody?: string;
}) {
  return `[Matched as reversal]
Matched to pending reversal transaction ${args.sourceTxn.id} dated ${args.sourceTxn.date} for ${formatSignedMajorUnits(args.sourceTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

export function buildUnmatchSourceComment(args: {
  counterpartTxn: Txn;
  commentBody: string;
}) {
  return `[Reversal match removed]
Removed the match to ${args.counterpartTxn.id}; the transaction is pending reversal again.${appendUserNote(args.commentBody)}`;
}

export function buildUnmatchCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody: string;
}) {
  return `[Removed as reversal match]
Removed the match to source transaction ${args.sourceTxn.id}.${appendUserNote(args.commentBody)}`;
}

export function buildSuggestedSourceComment(args: { counterpartTxn: Txn }) {
  return `[Reversal match suggested]
Auto-matched to ${args.counterpartTxn.id} on ${args.counterpartTxn.date} for ${formatSignedMajorUnits(args.counterpartTxn.amountCents)}. Awaiting admin approval.`;
}

export function buildSuggestedCounterpartComment(args: { sourceTxn: Txn }) {
  return `[Suggested as reversal]
Auto-matched to pending reversal transaction ${args.sourceTxn.id} dated ${args.sourceTxn.date} for ${formatSignedMajorUnits(args.sourceTxn.amountCents)}. Awaiting admin approval.`;
}

export function buildAmbiguousSuggestedSourceComment(args: {
  counterpartTxn: Txn;
  validCounterpartTxnIds: TxnId[];
}) {
  return `[Default reversal match selected]
The Power BI matching group had overlapping candidates, so a deterministic valid default was selected for review.
Defaulted to ${args.counterpartTxn.id} on ${args.counterpartTxn.date} for ${formatSignedMajorUnits(args.counterpartTxn.amountCents)}.
Valid reversal candidates for this source: ${args.validCounterpartTxnIds.join(', ')}.

Review and approve the default match, or reject it to return this transaction to manual matching.`;
}

export function buildAmbiguousSuggestedCounterpartComment(args: {
  sourceTxn: Txn;
  validSourceTxnIds: TxnId[];
}) {
  return `[Defaulted as reversal]
The Power BI matching group had overlapping candidates, so this transaction was default-matched to ${args.sourceTxn.id} dated ${args.sourceTxn.date} for ${formatSignedMajorUnits(args.sourceTxn.amountCents)}.
Valid pending reversal sources for this transaction: ${args.validSourceTxnIds.join(', ')}.
Awaiting admin approval.`;
}

export function buildApproveSuggestedSourceComment(args: {
  counterpartTxn: Txn;
  commentBody?: string;
}) {
  return `[Reversal matched]
Approved auto-matched reversal to ${args.counterpartTxn.id} on ${args.counterpartTxn.date} for ${formatSignedMajorUnits(args.counterpartTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

export function buildApproveSuggestedCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody?: string;
}) {
  return `[Matched as reversal]
Approved auto-match to pending reversal transaction ${args.sourceTxn.id} dated ${args.sourceTxn.date} for ${formatSignedMajorUnits(args.sourceTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

export function buildApproveAmbiguousSuggestedSourceComment(args: {
  counterpartTxn: Txn;
  commentBody?: string;
}) {
  return `[Reversal matched]
Approved the defaulted reversal match to ${args.counterpartTxn.id} on ${args.counterpartTxn.date} for ${formatSignedMajorUnits(args.counterpartTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

export function buildApproveAmbiguousSuggestedCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody?: string;
}) {
  return `[Matched as reversal]
Approved the defaulted match to pending reversal transaction ${args.sourceTxn.id} dated ${args.sourceTxn.date} for ${formatSignedMajorUnits(args.sourceTxn.amountCents)}.${appendUserNote(args.commentBody)}`;
}

export function buildRejectSuggestedSourceComment(args: {
  counterpartTxn: Txn;
  commentBody?: string;
}) {
  return `[Suggested reversal rejected]
Removed the auto-suggested match to ${args.counterpartTxn.id}; the transaction is pending reversal again.${appendUserNote(args.commentBody)}`;
}

export function buildRejectSuggestedCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody?: string;
}) {
  return `[Removed as suggested reversal]
Removed the auto-suggested match to source transaction ${args.sourceTxn.id}.${appendUserNote(args.commentBody)}`;
}

export function buildRejectAmbiguousSuggestedSourceComment(args: {
  counterpartTxn: Txn;
  commentBody?: string;
}) {
  return `[Default reversal match rejected]
Removed the defaulted match to ${args.counterpartTxn.id}; the transaction is pending reversal again.${appendUserNote(args.commentBody)}`;
}

export function buildRejectAmbiguousSuggestedCounterpartComment(args: {
  sourceTxn: Txn;
  commentBody?: string;
}) {
  return `[Removed as defaulted reversal]
Removed the defaulted match to source transaction ${args.sourceTxn.id}.${appendUserNote(args.commentBody)}`;
}

import type { ProjectId, TxnId } from '../../../types';
import { uid } from '../../../utils/id';
import type { ReversalDbExecutor } from './reversalTypes';

export async function createReversalComment(args: {
  db: ReversalDbExecutor;
  companyId: string;
  projectId: ProjectId;
  txnId: TxnId;
  userId: string;
  body: string;
  resolvedAt?: string;
}) {
  const body = args.body.trim();
  if (!body) return;
  await args.db
    .insertInto('txn_comments')
    .values({
      id: uid('cmt'),
      company_id: args.companyId,
      project_id: args.projectId,
      txn_public_id: args.txnId,
      parent_comment_id: null,
      body,
      comment_origin: 'reversal_workflow',
      assigned_to_user_id: null,
      created_by_user_id: args.userId,
      resolved_at: args.resolvedAt ?? null,
      resolved_by_user_id: args.resolvedAt ? args.userId : null,
    })
    .executeTakeFirst();
}

export async function resolveOpenReversalComments(args: {
  db: ReversalDbExecutor;
  projectId: ProjectId;
  txnIds: TxnId[];
  userId: string;
  now: string;
}) {
  const txnIds = [...new Set(args.txnIds)];
  if (!txnIds.length) return;
  await args.db
    .updateTable('txn_comments')
    .set({
      resolved_at: args.now,
      resolved_by_user_id: args.userId,
      updated_at: args.now,
    })
    .where('project_id', '=', args.projectId)
    .where('txn_public_id', 'in', txnIds)
    .where('comment_origin', '=', 'reversal_workflow')
    .where('resolved_at', 'is', null)
    .execute();
}

export async function completeReversalComments(args: {
  db: ReversalDbExecutor;
  companyId: string;
  projectId: ProjectId;
  txnIds: TxnId[];
  userId: string;
  now: string;
  commentBody?: string;
}) {
  const txnIds = [...new Set(args.txnIds)];
  await resolveOpenReversalComments({
    db: args.db,
    projectId: args.projectId,
    txnIds,
    userId: args.userId,
    now: args.now,
  });
  const note = args.commentBody?.trim();
  if (!note) return;
  await Promise.all(
    txnIds.map((txnId) =>
      createReversalComment({
        db: args.db,
        companyId: args.companyId,
        projectId: args.projectId,
        txnId,
        userId: args.userId,
        body: note,
        resolvedAt: args.now,
      })
    )
  );
}

export function buildPendingComment(args: { commentBody: string }) {
  return args.commentBody.trim();
}

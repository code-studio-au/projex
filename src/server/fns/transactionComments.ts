import type {
  ProjectId,
  TxnComment,
  TxnCommentId,
  TxnCommentSummary,
  TxnId,
} from '../../types';
import { asTxnCommentId, asTxnId } from '../../types';
import { AppError } from '../../api/errors';
import type {
  TxnCommentCreateInput,
  TxnCommentUpdateInput,
} from '../../api/types';
import { uid } from '../../utils/id';
import { txnCommentBodySchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { requireAuthorized } from '../auth/authorize';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import {
  requireOperationalProjectForAction,
  type ProjectActionContext,
} from './resourceGuards';
import {
  toTxnComment,
  type TxnCommentRow,
} from '../mappers/transactionCommentRows';

const commentSelect = [
  'txn_comments.id',
  'txn_comments.company_id',
  'txn_comments.project_id',
  'txn_comments.txn_public_id',
  'txn_comments.parent_comment_id',
  'txn_comments.body',
  'txn_comments.assigned_to_user_id',
  'txn_comments.created_by_user_id',
  'created_by.name as created_by_name',
  'txn_comments.resolved_at',
  'txn_comments.resolved_by_user_id',
  'txn_comments.created_at',
  'txn_comments.updated_at',
] as const;

async function assertTxnInProject(
  context: ProjectActionContext,
  txnId: TxnId
): Promise<void> {
  const txn = await context.db
    .selectFrom('txns')
    .select('public_id')
    .where('project_id', '=', context.projectId)
    .where('public_id', '=', txnId)
    .executeTakeFirst();

  if (!txn) throw new AppError('NOT_FOUND', 'Unknown transaction');
}

async function assertParentCommentInThread(
  context: ProjectActionContext,
  txnId: TxnId,
  parentCommentId: TxnCommentId
): Promise<void> {
  const parent = await context.db
    .selectFrom('txn_comments')
    .select('id')
    .where('project_id', '=', context.projectId)
    .where('txn_public_id', '=', txnId)
    .where('id', '=', parentCommentId)
    .where('parent_comment_id', 'is', null)
    .executeTakeFirst();

  if (!parent) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Replies must belong to an existing top-level transaction comment'
    );
  }
}

async function assertAssignableProjectMember(
  context: ProjectActionContext,
  assignedToUserId: TxnCommentCreateInput['assignedToUserId']
): Promise<void> {
  if (!assignedToUserId) return;
  const membership = await context.db
    .selectFrom('project_memberships')
    .innerJoin('users', 'users.id', 'project_memberships.user_id')
    .select('project_memberships.user_id')
    .where('project_memberships.project_id', '=', context.projectId)
    .where('project_memberships.user_id', '=', assignedToUserId)
    .where('users.disabled', '=', false)
    .executeTakeFirst();

  if (!membership) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Comments can only be assigned to active members of this project'
    );
  }
}

async function loadComment(
  context: ProjectActionContext,
  txnId: TxnId,
  commentId: TxnCommentId
): Promise<TxnCommentRow> {
  const row = await context.db
    .selectFrom('txn_comments')
    .innerJoin(
      'users as created_by',
      'created_by.id',
      'txn_comments.created_by_user_id'
    )
    .select(commentSelect)
    .where('txn_comments.project_id', '=', context.projectId)
    .where('txn_comments.txn_public_id', '=', txnId)
    .where('txn_comments.id', '=', commentId)
    .executeTakeFirst();

  if (!row) throw new AppError('NOT_FOUND', 'Unknown transaction comment');
  return row;
}

export async function listTransactionCommentsServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txnId: TxnId;
}): Promise<TxnComment[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );
    await assertTxnInProject(context, args.txnId);

    const rows = await context.db
      .selectFrom('txn_comments')
      .innerJoin(
        'users as created_by',
        'created_by.id',
        'txn_comments.created_by_user_id'
      )
      .select(commentSelect)
      .where('txn_comments.project_id', '=', args.projectId)
      .where('txn_comments.txn_public_id', '=', args.txnId)
      .orderBy('txn_comments.created_at', 'asc')
      .orderBy('txn_comments.id', 'asc')
      .execute();

    return rows.map(toTxnComment);
  });
}

export async function listTransactionCommentSummariesServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<TxnCommentSummary[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );

    const rows = await context.db
      .selectFrom('txn_comments')
      .innerJoin(
        'users as created_by',
        'created_by.id',
        'txn_comments.created_by_user_id'
      )
      .select([
        'txn_comments.txn_public_id',
        'txn_comments.assigned_to_user_id',
        'txn_comments.resolved_at',
        'txn_comments.id',
        'txn_comments.body',
        'txn_comments.created_at',
        'created_by.name as created_by_name',
      ])
      .where('txn_comments.project_id', '=', args.projectId)
      .orderBy('txn_comments.created_at', 'asc')
      .orderBy('txn_comments.id', 'asc')
      .execute();

    const byTxn = new Map<string, TxnCommentSummary>();
    for (const row of rows) {
      const current =
        byTxn.get(row.txn_public_id) ??
        ({
          txnId: asTxnId(row.txn_public_id),
          totalCount: 0,
          unresolvedCount: 0,
          assignedToMeUnresolvedCount: 0,
          latestCommentBody: undefined,
          latestCommentCreatedAt: undefined,
          latestCommentAuthorName: undefined,
        } satisfies TxnCommentSummary);
      current.totalCount += 1;
      current.latestCommentBody = row.body;
      current.latestCommentCreatedAt = row.created_at;
      current.latestCommentAuthorName = row.created_by_name;
      if (!row.resolved_at) {
        current.unresolvedCount += 1;
        if (row.assigned_to_user_id === context.userId) {
          current.assignedToMeUnresolvedCount += 1;
        }
      }
      byTxn.set(row.txn_public_id, current);
    }

    return [...byTxn.values()];
  });
}

export async function createTransactionCommentServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnCommentCreateInput;
}): Promise<TxnComment> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );

    validateOrThrow(txnCommentBodySchema, args.input.body);
    await assertTxnInProject(context, args.input.txnId);
    await assertAssignableProjectMember(context, args.input.assignedToUserId);
    if (args.input.parentCommentId) {
      await assertParentCommentInThread(
        context,
        args.input.txnId,
        args.input.parentCommentId
      );
    }

    const now = new Date().toISOString();
    const created = await context.db
      .insertInto('txn_comments')
      .values({
        id: asTxnCommentId(uid('txn_comment')),
        company_id: context.companyId,
        project_id: context.projectId,
        txn_public_id: args.input.txnId,
        parent_comment_id: args.input.parentCommentId ?? null,
        body: args.input.body.trim(),
        assigned_to_user_id: args.input.assignedToUserId ?? null,
        created_by_user_id: context.userId,
        resolved_at: null,
        resolved_by_user_id: null,
        created_at: now,
        updated_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    return toTxnComment(
      await loadComment(context, args.input.txnId, asTxnCommentId(created.id))
    );
  });
}

export async function updateTransactionCommentServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txnId: TxnId;
  input: TxnCommentUpdateInput;
}): Promise<TxnComment> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );
    await assertTxnInProject(context, args.txnId);
    const existing = await loadComment(context, args.txnId, args.input.id);

    if (
      typeof args.input.body === 'undefined' &&
      typeof args.input.assignedToUserId === 'undefined' &&
      typeof args.input.resolved === 'undefined'
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'At least one transaction comment field is required'
      );
    }

    if (
      typeof args.input.body !== 'undefined' &&
      existing.created_by_user_id !== context.userId
    ) {
      await requireAuthorized({
        db: context.db,
        userId: context.userId,
        action: 'txns:edit',
        companyId: context.companyId,
        projectId: context.projectId,
      });
    }

    if (typeof args.input.body !== 'undefined') {
      validateOrThrow(txnCommentBodySchema, args.input.body);
    }
    await assertAssignableProjectMember(context, args.input.assignedToUserId);

    const now = new Date().toISOString();
    const patch = {
      ...(typeof args.input.body !== 'undefined'
        ? { body: args.input.body.trim() }
        : {}),
      ...(typeof args.input.assignedToUserId !== 'undefined'
        ? { assigned_to_user_id: args.input.assignedToUserId ?? null }
        : {}),
      ...(args.input.resolved === true
        ? { resolved_at: now, resolved_by_user_id: context.userId }
        : {}),
      ...(args.input.resolved === false
        ? { resolved_at: null, resolved_by_user_id: null }
        : {}),
      updated_at: now,
    };

    await context.db
      .updateTable('txn_comments')
      .set(patch)
      .where('project_id', '=', context.projectId)
      .where('txn_public_id', '=', args.txnId)
      .where('id', '=', args.input.id)
      .executeTakeFirstOrThrow();

    return toTxnComment(await loadComment(context, args.txnId, args.input.id));
  });
}

export async function deleteTransactionCommentServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  txnId: TxnId;
  commentId: TxnCommentId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:view'
    );
    await assertTxnInProject(context, args.txnId);
    const existing = await loadComment(context, args.txnId, args.commentId);

    if (existing.created_by_user_id !== context.userId) {
      await requireAuthorized({
        db: context.db,
        userId: context.userId,
        action: 'txns:edit',
        companyId: context.companyId,
        projectId: context.projectId,
      });
    }

    await context.db
      .deleteFrom('txn_comments')
      .where('project_id', '=', context.projectId)
      .where('txn_public_id', '=', args.txnId)
      .where('id', '=', args.commentId)
      .executeTakeFirstOrThrow();
  });
}

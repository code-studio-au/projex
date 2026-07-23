import type { ProjectId, Txn, TxnUnlockRequest } from '../../../types';
import { asTxnId, asTxnUnlockRequestId, asUserId } from '../../../types';
import { AppError } from '../../../api/errors';
import type {
  TxnUnlockRequestInput,
  TxnUnlockResolutionInput,
  TxnWorkflowStateInput,
} from '../../../api/types';
import { planTxnWorkflowState } from '../../../utils/transactionWorkflow';
import { toTxn } from '../../mappers/transactionRows';
import { requireAuthorized } from '../../auth/authorize';
import { recordAuditEvent } from '../../audit/auditEvents';
import { uid } from '../../../utils/id';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import { txnSelectColumns, workflowPatchIsNoop } from './shared';
import { lockProjectReversalWorkflow } from './reversalConcurrency';

export { bulkTxnActionServer } from './bulkWorkflowServers';

function workflowState(row: {
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  locked_at: string | null;
  locked_by_user_id: string | null;
  workflow_version: number;
}) {
  return {
    reviewedAt: row.reviewed_at,
    reviewedByUserId: row.reviewed_by_user_id,
    lockedAt: row.locked_at,
    lockedByUserId: row.locked_by_user_id,
    workflowVersion: row.workflow_version,
  };
}

function workflowEvent(input: TxnWorkflowStateInput) {
  if (input.locked === true) {
    return { type: 'transaction.locked', reason: 'Transaction locked' };
  }
  if (input.locked === false) {
    return {
      type: 'transaction.admin_unlocked',
      reason: input.reason?.trim() ?? '',
    };
  }
  if (input.reviewed === true) {
    return { type: 'transaction.reviewed', reason: 'Transaction reviewed' };
  }
  return {
    type: 'transaction.reopened',
    reason: input.reason?.trim() || 'Reopened for further review',
  };
}

function toUnlockRequest(row: {
  id: string;
  txn_public_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string;
  requested_by_user_id: string;
  requested_at: string;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  resolution_reason: string | null;
  version: number;
}): TxnUnlockRequest {
  return {
    id: asTxnUnlockRequestId(row.id),
    txnId: asTxnId(row.txn_public_id),
    status: row.status,
    reason: row.reason,
    requestedByUserId: asUserId(row.requested_by_user_id),
    requestedAt: row.requested_at,
    resolvedByUserId: row.resolved_by_user_id
      ? asUserId(row.resolved_by_user_id)
      : undefined,
    resolvedAt: row.resolved_at ?? undefined,
    resolutionReason: row.resolution_reason ?? undefined,
    version: row.version,
  };
}

const unlockRequestColumns = [
  'id',
  'txn_public_id',
  'status',
  'reason',
  'requested_by_user_id',
  'requested_at',
  'resolved_by_user_id',
  'resolved_at',
  'resolution_reason',
  'version',
] as const;

export async function updateTxnWorkflowStateServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnWorkflowStateInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    if (args.input.locked === false) {
      await requireAuthorized({
        db: context.db,
        userId: context.userId,
        companyId: context.companyId,
        projectId: args.projectId,
        action: 'txns:admin_unlock',
      });
      if (!args.input.reason?.trim()) {
        throw new AppError(
          'VALIDATION_ERROR',
          'A reason is required for an administrative unlock'
        );
      }
    }

    return context.db.transaction().execute(async (trx) => {
      await lockProjectReversalWorkflow({
        db: trx,
        projectId: args.projectId,
      });
      const now = new Date().toISOString();
      const existing = await trx
        .selectFrom('txns')
        .select(txnSelectColumns())
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.input.txnId)
        .forUpdate()
        .executeTakeFirst();
      if (!existing) throw new AppError('NOT_FOUND', 'Unknown transaction');
      if (existing.workflow_version !== args.input.expectedWorkflowVersion) {
        throw new AppError(
          'CONFLICT',
          'Transaction workflow state changed. Refresh and try again.'
        );
      }
      if (args.input.reviewed === false && existing.locked_at) {
        throw new AppError(
          'CONFLICT',
          'Unlock the transaction before reopening its review'
        );
      }

      const patch = planTxnWorkflowState({
        current: {
          reviewedAt: existing.reviewed_at ?? undefined,
          reviewedByUserId: existing.reviewed_by_user_id
            ? asUserId(existing.reviewed_by_user_id)
            : undefined,
          lockedAt: existing.locked_at ?? undefined,
          lockedByUserId: existing.locked_by_user_id
            ? asUserId(existing.locked_by_user_id)
            : undefined,
        },
        reviewed: args.input.reviewed,
        locked: args.input.locked,
        actorUserId: context.userId,
        now,
      });
      if (workflowPatchIsNoop({ row: existing, patch })) {
        return toTxn(existing);
      }

      let resolvedRequestId: string | undefined;
      if (args.input.locked === false) {
        const pendingRequest = await trx
          .selectFrom('txn_unlock_requests')
          .select(['id', 'version'])
          .where('project_id', '=', args.projectId)
          .where('txn_public_id', '=', args.input.txnId)
          .where('status', '=', 'pending')
          .forUpdate()
          .executeTakeFirst();
        if (pendingRequest) {
          resolvedRequestId = pendingRequest.id;
          await trx
            .updateTable('txn_unlock_requests')
            .set({
              status: 'approved',
              resolved_by_user_id: context.userId,
              resolved_at: now,
              resolution_reason: args.input.reason!.trim(),
              version: pendingRequest.version + 1,
              updated_at: now,
            })
            .where('id', '=', pendingRequest.id)
            .where('version', '=', pendingRequest.version)
            .executeTakeFirstOrThrow();
        }
      }

      const updated = await trx
        .updateTable('txns')
        .set({
          ...patch,
          workflow_version: existing.workflow_version + 1,
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.input.txnId)
        .where('workflow_version', '=', args.input.expectedWorkflowVersion)
        .returning(txnSelectColumns())
        .executeTakeFirst();
      if (!updated) {
        throw new AppError(
          'CONFLICT',
          'Transaction workflow state changed during the update'
        );
      }

      const event = workflowEvent(args.input);
      await recordAuditEvent({
        db: trx,
        companyId: context.companyId,
        projectId: args.projectId,
        actorUserId: context.userId,
        eventClass: 'workflow',
        eventType: event.type,
        entityType: 'transaction',
        entityId: args.input.txnId,
        reason: event.reason,
        previousState: workflowState(existing),
        resultingState: workflowState(updated),
        metadata: resolvedRequestId
          ? { unlockRequestId: resolvedRequestId }
          : {},
        nowIso: now,
      });
      return toTxn(updated);
    });
  });
}

export async function requestTxnUnlockServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnUnlockRequestInput;
}): Promise<TxnUnlockRequest> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );

    return context.db.transaction().execute(async (trx) => {
      const now = new Date().toISOString();
      const txn = await trx
        .selectFrom('txns')
        .select(txnSelectColumns())
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.input.txnId)
        .forUpdate()
        .executeTakeFirst();
      if (!txn) throw new AppError('NOT_FOUND', 'Unknown transaction');
      if (txn.workflow_version !== args.input.expectedWorkflowVersion) {
        throw new AppError(
          'CONFLICT',
          'Transaction workflow state changed. Refresh and try again.'
        );
      }
      if (!txn.locked_at) {
        throw new AppError(
          'CONFLICT',
          'Only locked transactions require an unlock request'
        );
      }

      const existingRequest = await trx
        .selectFrom('txn_unlock_requests')
        .select('id')
        .where('project_id', '=', args.projectId)
        .where('txn_public_id', '=', args.input.txnId)
        .where('status', '=', 'pending')
        .executeTakeFirst();
      if (existingRequest) {
        throw new AppError(
          'CONFLICT',
          'An unlock request is already pending for this transaction'
        );
      }

      const request = await trx
        .insertInto('txn_unlock_requests')
        .values({
          id: uid('unl'),
          company_id: context.companyId,
          project_id: args.projectId,
          txn_public_id: args.input.txnId,
          status: 'pending',
          reason: args.input.reason.trim(),
          requested_by_user_id: context.userId,
          requested_at: now,
          resolved_by_user_id: null,
          resolved_at: null,
          resolution_reason: null,
          version: 1,
          created_at: now,
          updated_at: now,
        })
        .returning(unlockRequestColumns)
        .executeTakeFirstOrThrow();

      const updatedTxn = await trx
        .updateTable('txns')
        .set({
          workflow_version: txn.workflow_version + 1,
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', args.input.txnId)
        .where('workflow_version', '=', args.input.expectedWorkflowVersion)
        .returning(txnSelectColumns())
        .executeTakeFirst();
      if (!updatedTxn) {
        throw new AppError(
          'CONFLICT',
          'Transaction workflow state changed during the unlock request'
        );
      }

      await recordAuditEvent({
        db: trx,
        companyId: context.companyId,
        projectId: args.projectId,
        actorUserId: context.userId,
        eventClass: 'workflow',
        eventType: 'transaction.unlock_requested',
        entityType: 'transaction',
        entityId: args.input.txnId,
        reason: args.input.reason,
        previousState: workflowState(txn),
        resultingState: {
          ...workflowState(updatedTxn),
          unlockRequestId: request.id,
          unlockRequestStatus: request.status,
        },
        nowIso: now,
      });
      return toUnlockRequest(request);
    });
  });
}

export async function resolveTxnUnlockRequestServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: TxnUnlockResolutionInput;
}): Promise<Txn> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:resolve_unlock'
    );

    return context.db.transaction().execute(async (trx) => {
      const now = new Date().toISOString();
      const request = await trx
        .selectFrom('txn_unlock_requests')
        .select(unlockRequestColumns)
        .where('project_id', '=', args.projectId)
        .where('id', '=', args.input.requestId)
        .forUpdate()
        .executeTakeFirst();
      if (!request) throw new AppError('NOT_FOUND', 'Unknown unlock request');
      if (
        request.status !== 'pending' ||
        request.version !== args.input.expectedRequestVersion
      ) {
        throw new AppError(
          'CONFLICT',
          'Unlock request state changed. Refresh and try again.'
        );
      }

      const txn = await trx
        .selectFrom('txns')
        .select(txnSelectColumns())
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', request.txn_public_id)
        .forUpdate()
        .executeTakeFirst();
      if (!txn) throw new AppError('NOT_FOUND', 'Unknown transaction');
      if (!txn.locked_at && args.input.decision === 'approve') {
        throw new AppError(
          'CONFLICT',
          'Transaction is already unlocked. Refresh and try again.'
        );
      }

      const updatedRequest = await trx
        .updateTable('txn_unlock_requests')
        .set({
          status: args.input.decision === 'approve' ? 'approved' : 'rejected',
          resolved_by_user_id: context.userId,
          resolved_at: now,
          resolution_reason: args.input.reason.trim(),
          version: request.version + 1,
          updated_at: now,
        })
        .where('id', '=', request.id)
        .where('status', '=', 'pending')
        .where('version', '=', args.input.expectedRequestVersion)
        .returning(unlockRequestColumns)
        .executeTakeFirst();
      if (!updatedRequest) {
        throw new AppError(
          'CONFLICT',
          'Unlock request state changed during resolution'
        );
      }

      const updatedTxn = await trx
        .updateTable('txns')
        .set({
          locked_at: args.input.decision === 'approve' ? null : txn.locked_at,
          locked_by_user_id:
            args.input.decision === 'approve' ? null : txn.locked_by_user_id,
          workflow_version: txn.workflow_version + 1,
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('public_id', '=', request.txn_public_id)
        .where('workflow_version', '=', txn.workflow_version)
        .returning(txnSelectColumns())
        .executeTakeFirst();
      if (!updatedTxn) {
        throw new AppError(
          'CONFLICT',
          'Transaction workflow state changed during resolution'
        );
      }

      await recordAuditEvent({
        db: trx,
        companyId: context.companyId,
        projectId: args.projectId,
        actorUserId: context.userId,
        eventClass: 'workflow',
        eventType:
          args.input.decision === 'approve'
            ? 'transaction.unlock_approved'
            : 'transaction.unlock_rejected',
        entityType: 'transaction',
        entityId: request.txn_public_id,
        reason: args.input.reason,
        previousState: {
          ...workflowState(txn),
          unlockRequestId: request.id,
          unlockRequestStatus: request.status,
        },
        resultingState: {
          ...workflowState(updatedTxn),
          unlockRequestId: updatedRequest.id,
          unlockRequestStatus: updatedRequest.status,
        },
        nowIso: now,
      });
      return toTxn(updatedTxn);
    });
  });
}

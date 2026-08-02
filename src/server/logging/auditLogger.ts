import { AsyncLocalStorage } from 'node:async_hooks';

import {
  isAuditLoggingEnabled,
  logAuditEvent,
  type ServerLogFields,
} from '../../api/serverLogging.ts';
import type { CompanyId, ProjectId, UserId } from '../../types';

export type AuditEventClass =
  | 'workflow'
  | 'import'
  | 'coding'
  | 'taxonomy'
  | 'structural'
  | 'rules'
  | 'membership'
  | 'access'
  | 'lifecycle'
  | 'inheritance';

type PendingAuditLog = {
  event: string;
  fields: ServerLogFields;
};

const pendingAuditLogs = new AsyncLocalStorage<PendingAuditLog[]>();

function flushAuditLogs(logs: PendingAuditLog[]): void {
  for (const log of logs) {
    logAuditEvent(log);
  }
}

/**
 * Buffers mutation audit logs until the supplied database transaction has
 * committed. Rejected operations discard the buffer, so rolled-back writes
 * cannot be reported as successful audit events.
 */
export async function withAuditLoggingTransaction<T>(
  transaction: () => Promise<T>
): Promise<T> {
  if (!isAuditLoggingEnabled()) return transaction();

  const existingBuffer = pendingAuditLogs.getStore();
  if (existingBuffer) return transaction();

  const buffer: PendingAuditLog[] = [];
  const result = await pendingAuditLogs.run(buffer, transaction);
  flushAuditLogs(buffer);
  return result;
}

/**
 * Records a safe, scalar-only mutation event for emission after commit.
 */
export async function recordAuditLogEvent(args: {
  companyId: CompanyId;
  projectId?: ProjectId | null;
  actorUserId: UserId;
  eventClass: AuditEventClass;
  eventType: string;
  entityType: string;
  entityId: string;
  affectedCount?: number;
  outcome?: 'succeeded';
  reasonCode?: string;
}): Promise<void> {
  if (!isAuditLoggingEnabled()) return;

  const buffer = pendingAuditLogs.getStore();
  if (!buffer) {
    throw new Error(
      'Mutation audit logs must be recorded inside withAuditLoggingTransaction'
    );
  }

  buffer.push({
    event: args.eventType,
    fields: {
      actorUserId: args.actorUserId,
      companyId: args.companyId,
      projectId: args.projectId ?? undefined,
      entityType: args.entityType,
      entityId: args.entityId,
      eventClass: args.eventClass,
      outcome: args.outcome ?? 'succeeded',
      affectedCount: args.affectedCount,
      reasonCode: args.reasonCode,
    },
  });
}

import type { CompanyId, ProjectId, UserId } from '../../../types';
import { recordAuditLogEvent } from '../../logging/auditLogger';
export async function recordReversalTransition(args: {
  companyId: CompanyId;
  projectId: ProjectId;
  actorUserId: UserId;
  reversalId: string;
  eventType: string;
}) {
  await recordAuditLogEvent({
    companyId: args.companyId,
    projectId: args.projectId,
    actorUserId: args.actorUserId,
    eventClass: 'workflow',
    eventType: args.eventType,
    entityType: 'txn_reversal',
    entityId: args.reversalId,
  });
}

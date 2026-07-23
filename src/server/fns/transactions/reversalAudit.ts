import type { CompanyId, ProjectId, UserId } from '../../../types';
import { recordAuditEvent } from '../../audit/auditEvents';
import type { ReversalDbExecutor } from './reversalTypes';
import type { TxnReversalRow } from './reversalDomain';

function reversalAuditState(row: TxnReversalRow | null) {
  if (!row) return {};
  return {
    status: row.status,
    sourceTxnId: row.source_txn_public_id,
    counterpartTxnId: row.matched_reversal_txn_public_id,
    expectedProjectId: row.expected_project_id,
    matchMethod: row.match_method,
    matchScore: row.match_score,
    candidateCount: row.candidate_count,
    matchEvidence: row.match_evidence,
    sourceSnapshot: row.source_snapshot,
    counterpartSnapshot: row.counterpart_snapshot,
    version: row.version,
  };
}

export async function recordReversalTransition(args: {
  db: ReversalDbExecutor;
  companyId: CompanyId;
  projectId: ProjectId;
  actorUserId: UserId;
  reversalId: string;
  eventType: string;
  reason: string;
  previous: TxnReversalRow | null;
  resulting: TxnReversalRow | null;
  now: string;
}) {
  await recordAuditEvent({
    db: args.db,
    companyId: args.companyId,
    projectId: args.projectId,
    actorUserId: args.actorUserId,
    eventClass: 'workflow',
    eventType: args.eventType,
    entityType: 'txn_reversal',
    entityId: args.reversalId,
    reason: args.reason,
    previousState: reversalAuditState(args.previous),
    resultingState: args.resulting
      ? reversalAuditState(args.resulting)
      : { status: 'cancelled' },
    nowIso: args.now,
  });
}

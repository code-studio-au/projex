import type { Kysely, Transaction } from 'kysely';

import type { CompanyId, ProjectId, UserId } from '../../types';
import { uid } from '../../utils/id';
import type { DB } from '../db/schema';

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

export type AuditRetentionClass =
  'financial' | 'security' | 'operational' | 'diagnostic';

export type AuditDb = Kysely<DB> | Transaction<DB>;

type AuditState = Record<string, unknown>;

const retentionByEventClass: Record<
  AuditEventClass,
  { retentionClass: AuditRetentionClass; years?: number; days?: number }
> = {
  workflow: { retentionClass: 'financial', years: 7 },
  import: { retentionClass: 'financial', years: 7 },
  coding: { retentionClass: 'financial', years: 7 },
  taxonomy: { retentionClass: 'operational', years: 2 },
  structural: { retentionClass: 'financial', years: 7 },
  rules: { retentionClass: 'operational', years: 2 },
  membership: { retentionClass: 'security', years: 7 },
  access: { retentionClass: 'security', years: 7 },
  lifecycle: { retentionClass: 'security', years: 7 },
  inheritance: { retentionClass: 'operational', years: 2 },
};

function retentionForEvent(eventClass: AuditEventClass, nowIso: string) {
  const policy = retentionByEventClass[eventClass];
  const retainUntil = new Date(nowIso);
  if (policy.years) {
    retainUntil.setUTCFullYear(retainUntil.getUTCFullYear() + policy.years);
  }
  if (policy.days) {
    retainUntil.setUTCDate(retainUntil.getUTCDate() + policy.days);
  }
  return {
    retentionClass: policy.retentionClass,
    retainUntil: retainUntil.toISOString(),
  };
}

export async function recordAuditEvent(args: {
  db: AuditDb;
  companyId: CompanyId;
  projectId?: ProjectId | null;
  actorUserId: UserId;
  eventClass: AuditEventClass;
  eventType: string;
  entityType: string;
  entityId: string;
  reason: string;
  previousState?: AuditState;
  resultingState?: AuditState;
  metadata?: AuditState;
  nowIso?: string;
}) {
  const now = args.nowIso ?? new Date().toISOString();
  const retention = retentionForEvent(args.eventClass, now);
  await args.db
    .insertInto('audit_events')
    .values({
      id: uid('audit'),
      company_id: args.companyId,
      project_id: args.projectId ?? null,
      actor_user_id: args.actorUserId,
      event_class: args.eventClass,
      event_type: args.eventType.trim(),
      entity_type: args.entityType.trim(),
      entity_id: args.entityId,
      reason: args.reason.trim(),
      previous_state: args.previousState ?? {},
      resulting_state: args.resultingState ?? {},
      metadata: args.metadata ?? {},
      retention_class: retention.retentionClass,
      retain_until: retention.retainUntil,
      created_at: now,
    })
    .execute();
}

export type ProjectStandardOriginScope = 'company' | 'project';
export type ProjectStandardSyncStatus =
  | 'local'
  | 'inherited'
  | 'overridden'
  | 'detached';

export function buildLocalProjectStandardMetadata(nowIso: string) {
  return {
    origin_scope: 'project' as const,
    origin_company_item_id: null,
    sync_status: 'local' as const,
    last_synced_at: nowIso,
    source_updated_at_snapshot: null,
  };
}

export function buildInheritedProjectStandardMetadata(args: {
  companyItemId: string;
  sourceUpdatedAt: string;
  nowIso: string;
}) {
  return {
    origin_scope: 'company' as const,
    origin_company_item_id: args.companyItemId,
    sync_status: 'inherited' as const,
    last_synced_at: args.nowIso,
    source_updated_at_snapshot: args.sourceUpdatedAt,
  };
}

export function buildDetachedProjectStandardMetadata(args: {
  companyItemId: string;
  previousSourceUpdatedAt?: string | null;
  nowIso: string;
}) {
  return {
    origin_scope: 'company' as const,
    origin_company_item_id: args.companyItemId,
    sync_status: 'detached' as const,
    last_synced_at: args.nowIso,
    source_updated_at_snapshot: args.previousSourceUpdatedAt ?? null,
  };
}

export function shouldApplyInheritedUpdate(syncStatus?: string | null) {
  return !syncStatus || syncStatus === 'inherited';
}

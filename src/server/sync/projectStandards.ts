import type { Kysely, Transaction } from 'kysely';

import type { DB } from '../db/schema';
import type { CompanyId } from '../../types';
import { asProjectId } from '../../types';

export type ProjectStandardOriginScope = 'company' | 'project';
export type ProjectStandardSyncStatus =
  | 'local'
  | 'inherited'
  | 'overridden'
  | 'detached';

export type ProjectStandardsDb = Kysely<DB> | Transaction<DB>;

type SortableProjectStandardRow = {
  sync_status?: ProjectStandardSyncStatus | null;
  sort_order: number;
  created_at: string;
};

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

export function compareProjectStandards<T extends SortableProjectStandardRow>(
  a: T,
  b: T
) {
  const aGroup = a.sync_status === 'inherited' ? 1 : 0;
  const bGroup = b.sync_status === 'inherited' ? 1 : 0;
  if (aGroup !== bGroup) return aGroup - bGroup;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.created_at.localeCompare(b.created_at);
}

export async function listSyncedProjectIdsForCompany(args: {
  db: ProjectStandardsDb;
  companyId: CompanyId;
}) {
  const rows = await args.db
    .selectFrom('projects')
    .select('id')
    .where('company_id', '=', args.companyId)
    .where('project_type', '=', 'project')
    .where('sync_company_defaults', '=', true)
    .execute();
  return rows.map((row) => asProjectId(row.id));
}

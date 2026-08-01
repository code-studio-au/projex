import type { Kysely, Transaction } from 'kysely';

import type { DB } from '../db/schema';
import type { CompanyId } from '../../types';
import { asProjectId } from '../../types';

export type ProjectStandardOriginScope = 'company' | 'project';
export type ProjectStandardSyncStatus =
  'local' | 'inherited' | 'overridden' | 'detached';

export type ProjectStandardsDb = Kysely<DB> | Transaction<DB>;

export type InheritanceReconciliationAction<Source, ProjectItem> =
  | { kind: 'create'; source: Source }
  | { kind: 'update'; source: Source; target: ProjectItem }
  | { kind: 'adopt'; source: Source; target: ProjectItem }
  | { kind: 'preserve'; source: Source; target: ProjectItem }
  | { kind: 'detach'; target: ProjectItem };

/**
 * Pure lifecycle planner shared by every company-standard type. Persistence,
 * target resolution, and entity conflicts remain in the owning adapter.
 */
export function planProjectStandardReconciliation<Source, ProjectItem>(args: {
  sources: readonly Source[];
  projectItems: readonly ProjectItem[];
  sourceId: (source: Source) => string;
  originCompanyItemId: (item: ProjectItem) => string | null | undefined;
  syncStatus: (
    item: ProjectItem
  ) => ProjectStandardSyncStatus | null | undefined;
  isExactLocalDuplicate: (source: Source, item: ProjectItem) => boolean;
}): Array<InheritanceReconciliationAction<Source, ProjectItem>> {
  const actions: Array<InheritanceReconciliationAction<Source, ProjectItem>> =
    [];
  const liveSourceIds = new Set(args.sources.map(args.sourceId));
  const claimedProjectItems = new Set<ProjectItem>();

  for (const source of args.sources) {
    const sourceId = args.sourceId(source);
    const inherited = args.projectItems.find(
      (item) => args.originCompanyItemId(item) === sourceId
    );
    if (inherited) {
      claimedProjectItems.add(inherited);
      actions.push({
        kind: shouldApplyInheritedUpdate(args.syncStatus(inherited))
          ? 'update'
          : 'preserve',
        source,
        target: inherited,
      });
      continue;
    }

    const duplicate = args.projectItems.find(
      (item) =>
        !claimedProjectItems.has(item) &&
        !args.originCompanyItemId(item) &&
        args.isExactLocalDuplicate(source, item)
    );
    if (duplicate) {
      claimedProjectItems.add(duplicate);
      actions.push({ kind: 'adopt', source, target: duplicate });
      continue;
    }

    actions.push({ kind: 'create', source });
  }

  for (const item of args.projectItems) {
    const sourceId = args.originCompanyItemId(item);
    if (
      sourceId &&
      !liveSourceIds.has(sourceId) &&
      args.syncStatus(item) !== 'detached'
    ) {
      actions.push({ kind: 'detach', target: item });
    }
  }

  return actions;
}

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

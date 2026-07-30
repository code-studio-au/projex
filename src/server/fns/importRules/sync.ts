import { defaultPowerBiImportRules } from '../../../utils/powerBiImport';
import { uid } from '../../../utils/id';
import type { CompanyId, ProjectId } from '../../../types';
import { asImportRuleId } from '../../../types';
import {
  buildDetachedProjectStandardMetadata,
  buildInheritedProjectStandardMetadata,
  listSyncedProjectIdsForCompany,
  planProjectStandardReconciliation,
  type ProjectStandardsDb,
} from '../../sync/projectStandards';
import type { ImportRuleRow } from './shared';
import { importRuleFingerprint, importRuleSelectColumns } from './shared';

export async function seedCompanyImportRuleBaseline(args: {
  db: ProjectStandardsDb;
  companyId: CompanyId;
}) {
  const existing = await args.db
    .selectFrom('import_rules')
    .select('id')
    .where('company_id', '=', args.companyId)
    .where('project_id', 'is', null)
    .executeTakeFirst();
  if (existing) return;

  const now = new Date().toISOString();
  await args.db
    .insertInto('import_rules')
    .values(
      defaultPowerBiImportRules(args.companyId).map((rule) => ({
        id: asImportRuleId(uid('impr')),
        company_id: args.companyId,
        project_id: null,
        name: rule.name,
        origin_scope: null,
        origin_company_item_id: null,
        sync_status: null,
        last_synced_at: null,
        source_updated_at_snapshot: null,
        action: rule.action,
        field: rule.field,
        operator: rule.operator,
        value: rule.value,
        sort_order: rule.sortOrder,
        enabled: rule.enabled,
        created_at: now,
        updated_at: now,
      }))
    )
    .execute();
}

export async function syncCompanyImportRulesToProject(args: {
  db: ProjectStandardsDb;
  companyId: CompanyId;
  projectId: ProjectId;
}) {
  const [companyRules, projectRules] = await Promise.all([
    args.db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('company_id', '=', args.companyId)
      .where('project_id', 'is', null)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute(),
    args.db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('project_id', '=', args.projectId)
      .execute(),
  ]);

  await syncCompanyImportRulesWithPreloadedState({
    db: args.db,
    companyId: args.companyId,
    projectId: args.projectId,
    companyRules,
    projectRules,
  });
}

async function syncCompanyImportRulesWithPreloadedState(args: {
  db: ProjectStandardsDb;
  companyId: CompanyId;
  projectId: ProjectId;
  companyRules: ImportRuleRow[];
  projectRules: ImportRuleRow[];
}) {
  const { companyRules, projectRules } = args;

  const now = new Date().toISOString();
  const actions = planProjectStandardReconciliation({
    sources: companyRules,
    projectItems: projectRules,
    sourceId: (rule) => rule.id,
    originCompanyItemId: (rule) => rule.origin_company_item_id,
    syncStatus: (rule) => rule.sync_status,
    isExactLocalDuplicate: (companyRule, projectRule) =>
      importRuleFingerprint(projectRule) === importRuleFingerprint(companyRule),
  });

  for (const action of actions) {
    if (action.kind === 'preserve') continue;
    if (action.kind === 'detach') {
      await args.db
        .updateTable('import_rules')
        .set({
          ...buildDetachedProjectStandardMetadata({
            companyItemId: action.target.origin_company_item_id!,
            previousSourceUpdatedAt: action.target.source_updated_at_snapshot,
            nowIso: now,
          }),
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('id', '=', action.target.id)
        .execute();
      continue;
    }

    const companyRule = action.source;
    const inheritedMetadata = buildInheritedProjectStandardMetadata({
      companyItemId: companyRule.id,
      sourceUpdatedAt: companyRule.updated_at,
      nowIso: now,
    });
    if (action.kind === 'create') {
      await args.db
        .insertInto('import_rules')
        .values({
          id: asImportRuleId(uid('impr')),
          company_id: args.companyId,
          project_id: args.projectId,
          name: companyRule.name,
          ...inheritedMetadata,
          action: companyRule.action,
          field: companyRule.field,
          operator: companyRule.operator,
          value: companyRule.value,
          sort_order: companyRule.sort_order,
          enabled: companyRule.enabled,
          created_at: now,
          updated_at: now,
        })
        .execute();
      continue;
    }

    await args.db
      .updateTable('import_rules')
      .set({
        name: companyRule.name,
        action: companyRule.action,
        field: companyRule.field,
        operator: companyRule.operator,
        value: companyRule.value,
        sort_order: companyRule.sort_order,
        enabled: companyRule.enabled,
        ...inheritedMetadata,
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('id', '=', action.target.id)
      .execute();
  }
}

function groupProjectImportRules(rows: ImportRuleRow[]) {
  const grouped = new Map<ProjectId, ImportRuleRow[]>();
  for (const row of rows) {
    if (!row.project_id) continue;
    const projectId = row.project_id as ProjectId;
    const existing = grouped.get(projectId);
    if (existing) {
      existing.push(row);
      continue;
    }
    grouped.set(projectId, [row]);
  }
  return grouped;
}

export async function syncCompanyImportRulesToSyncedProjects(args: {
  db: ProjectStandardsDb;
  companyId: CompanyId;
}) {
  const syncedProjectIds = await listSyncedProjectIdsForCompany({
    db: args.db,
    companyId: args.companyId,
  });
  if (!syncedProjectIds.length) return;

  const [companyRules, projectRules] = await Promise.all([
    args.db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('company_id', '=', args.companyId)
      .where('project_id', 'is', null)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute(),
    args.db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('project_id', 'in', syncedProjectIds)
      .execute(),
  ]);

  const projectRulesByProjectId = groupProjectImportRules(projectRules);
  await Promise.all(
    syncedProjectIds.map((projectId) =>
      syncCompanyImportRulesWithPreloadedState({
        db: args.db,
        companyId: args.companyId,
        projectId,
        companyRules,
        projectRules: projectRulesByProjectId.get(projectId) ?? [],
      })
    )
  );
}

export async function detachProjectImportRulesForDeletedCompanyRule(args: {
  db: ProjectStandardsDb;
  companyRuleId: string;
  previousSourceUpdatedAt: string | null;
  nowIso: string;
}) {
  await args.db
    .updateTable('import_rules')
    .set({
      ...buildDetachedProjectStandardMetadata({
        companyItemId: args.companyRuleId,
        previousSourceUpdatedAt: args.previousSourceUpdatedAt,
        nowIso: args.nowIso,
      }),
      updated_at: args.nowIso,
    })
    .where('origin_company_item_id', '=', args.companyRuleId)
    .execute();
}

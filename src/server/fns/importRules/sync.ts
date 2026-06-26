import { defaultPowerBiImportRules } from '../../../utils/powerBiImport';
import { uid } from '../../../utils/id';
import type { CompanyId, ProjectId } from '../../../types';
import { asImportRuleId } from '../../../types';
import {
  buildDetachedProjectStandardMetadata,
  buildInheritedProjectStandardMetadata,
  listSyncedProjectIdsForCompany,
  type ProjectStandardsDb,
  shouldApplyInheritedUpdate,
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
  const companyRuleIds = new Set(companyRules.map((rule) => rule.id));

  for (const companyRule of companyRules) {
    const inherited = projectRules.find(
      (rule) => rule.origin_company_item_id === companyRule.id
    );
    const exactLocalDuplicate = projectRules.find(
      (rule) =>
        rule.origin_company_item_id == null &&
        importRuleFingerprint(rule) === importRuleFingerprint(companyRule)
    );

    if (inherited) {
      if (!shouldApplyInheritedUpdate(inherited.sync_status)) continue;
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
          ...buildInheritedProjectStandardMetadata({
            companyItemId: companyRule.id,
            sourceUpdatedAt: companyRule.updated_at,
            nowIso: now,
          }),
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('id', '=', inherited.id)
        .execute();
      continue;
    }

    if (exactLocalDuplicate) continue;

    await args.db
      .insertInto('import_rules')
      .values({
        id: asImportRuleId(uid('impr')),
        company_id: args.companyId,
        project_id: args.projectId,
        name: companyRule.name,
        ...buildInheritedProjectStandardMetadata({
          companyItemId: companyRule.id,
          sourceUpdatedAt: companyRule.updated_at,
          nowIso: now,
        }),
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
  }

  const staleProjectRules = projectRules.filter(
    (rule) =>
      rule.origin_company_item_id &&
      !companyRuleIds.has(rule.origin_company_item_id) &&
      rule.sync_status !== 'detached'
  );

  for (const staleRule of staleProjectRules) {
    await args.db
      .updateTable('import_rules')
      .set({
        ...buildDetachedProjectStandardMetadata({
          companyItemId: staleRule.origin_company_item_id!,
          previousSourceUpdatedAt: staleRule.source_updated_at_snapshot,
          nowIso: now,
        }),
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('id', '=', staleRule.id)
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
  for (const projectId of syncedProjectIds) {
    await syncCompanyImportRulesWithPreloadedState({
      db: args.db,
      companyId: args.companyId,
      projectId,
      companyRules,
      projectRules: projectRulesByProjectId.get(projectId) ?? [],
    });
  }
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

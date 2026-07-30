import { uid } from '../../../utils/id';
import { resolveCompanyDefaultRuleToProjectTaxonomy } from '../../../utils/companyDefaultMappings';
import type {
  Category,
  CompanyDefaultCategory,
  CompanyDefaultSubCategory,
  ProjectAutoCodingRule,
  ProjectId,
  SubCategory,
} from '../../../types';
import { asProjectAutoCodingRuleId } from '../../../types';
import {
  buildDetachedProjectStandardMetadata,
  buildInheritedProjectStandardMetadata,
  listSyncedProjectIdsForCompany,
  planProjectStandardReconciliation,
  type ProjectStandardsDb,
} from '../../sync/projectStandards';
import { toCompanyDefaultMappingRule } from '../../mappers/taxonomyRows';
import {
  listCompanyDefaultCategories,
  listCompanyDefaultSubCategories,
  listProjectCategories,
  listProjectCategoriesForProjects,
  listProjectSubCategories,
  listProjectSubCategoriesForProjects,
  type ProjectAutoCodingRuleRow,
  projectAutoCodingRuleFingerprint,
  projectAutoCodingRuleSelectColumns,
} from './shared';

export async function syncCompanyAutoCodingRulesToProject(args: {
  db: ProjectStandardsDb;
  companyId: ProjectAutoCodingRule['companyId'];
  projectId: ProjectId;
  actorUserId: NonNullable<ProjectAutoCodingRule['createdByUserId']>;
}) {
  const [
    companyRules,
    projectRuleRows,
    defaultCategories,
    defaultSubCategories,
    projectCategories,
    projectSubCategories,
  ] = await Promise.all([
    args.db
      .selectFrom('company_default_mapping_rules')
      .select([
        'id',
        'company_id',
        'match_text',
        'company_default_category_id',
        'company_default_sub_category_id',
        'sort_order',
        'created_at',
        'updated_at',
      ])
      .where('company_id', '=', args.companyId)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute(),
    args.db
      .selectFrom('project_auto_coding_rules')
      .select(projectAutoCodingRuleSelectColumns())
      .where('project_id', '=', args.projectId)
      .execute(),
    listCompanyDefaultCategories(args.db, args.companyId),
    listCompanyDefaultSubCategories(args.db, args.companyId),
    listProjectCategories(args.db, args.projectId),
    listProjectSubCategories(args.db, args.projectId),
  ]);

  await syncCompanyAutoCodingRulesWithPreloadedState({
    db: args.db,
    companyId: args.companyId,
    projectId: args.projectId,
    actorUserId: args.actorUserId,
    companyRules,
    projectRuleRows,
    defaultCategories,
    defaultSubCategories,
    projectCategories,
    projectSubCategories,
  });
}

async function syncCompanyAutoCodingRulesWithPreloadedState(args: {
  db: ProjectStandardsDb;
  companyId: ProjectAutoCodingRule['companyId'];
  projectId: ProjectId;
  actorUserId: NonNullable<ProjectAutoCodingRule['createdByUserId']>;
  companyRules: Array<{
    id: string;
    company_id: string;
    match_text: string;
    company_default_category_id: string;
    company_default_sub_category_id: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }>;
  projectRuleRows: ProjectAutoCodingRuleRow[];
  defaultCategories: CompanyDefaultCategory[];
  defaultSubCategories: CompanyDefaultSubCategory[];
  projectCategories: Category[];
  projectSubCategories: SubCategory[];
}) {
  const {
    companyRules,
    projectRuleRows,
    defaultCategories,
    defaultSubCategories,
    projectCategories,
    projectSubCategories,
  } = args;

  const now = new Date().toISOString();
  const resolvedCompanyRules = companyRules.flatMap((rule) => {
    const resolved = resolveCompanyDefaultRuleToProjectTaxonomy({
      rule: toCompanyDefaultMappingRule(rule),
      defaultCategories,
      defaultSubCategories,
      projectCategories,
      projectSubCategories,
    });
    return resolved ? [{ rule, resolved }] : [];
  });
  const actions = planProjectStandardReconciliation({
    sources: resolvedCompanyRules,
    projectItems: projectRuleRows,
    sourceId: (source) => source.rule.id,
    originCompanyItemId: (rule) => rule.origin_company_item_id,
    syncStatus: (rule) => rule.sync_status,
    isExactLocalDuplicate: (source, projectRule) =>
      projectAutoCodingRuleFingerprint(projectRule) ===
      projectAutoCodingRuleFingerprint({
        match_text: source.rule.match_text,
        sub_category_id: String(source.resolved.subCategoryId),
      }),
  });

  for (const action of actions) {
    if (action.kind === 'preserve') continue;
    if (action.kind === 'detach') {
      await args.db
        .updateTable('project_auto_coding_rules')
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

    const { rule: companyRule, resolved } = action.source;
    const inheritedMetadata = buildInheritedProjectStandardMetadata({
      companyItemId: companyRule.id,
      sourceUpdatedAt: companyRule.updated_at,
      nowIso: now,
    });
    if (action.kind === 'create') {
      await args.db
        .insertInto('project_auto_coding_rules')
        .values({
          id: asProjectAutoCodingRuleId(uid('prule')),
          company_id: args.companyId,
          project_id: args.projectId,
          match_text: companyRule.match_text,
          category_id: resolved.categoryId,
          sub_category_id: resolved.subCategoryId,
          ...inheritedMetadata,
          sort_order: companyRule.sort_order,
          created_by_user_id: args.actorUserId,
          created_at: now,
          updated_at: now,
        })
        .execute();
      continue;
    }

    await args.db
      .updateTable('project_auto_coding_rules')
      .set({
        match_text: companyRule.match_text,
        category_id: resolved.categoryId,
        sub_category_id: resolved.subCategoryId,
        sort_order: companyRule.sort_order,
        ...inheritedMetadata,
        updated_at: now,
      })
      .where('project_id', '=', args.projectId)
      .where('id', '=', action.target.id)
      .execute();
  }
}

function groupProjectAutoCodingRuleRows(rows: ProjectAutoCodingRuleRow[]) {
  const grouped = new Map<ProjectId, ProjectAutoCodingRuleRow[]>();
  for (const row of rows) {
    const projectId = row.project_id as ProjectId;
    const rules = grouped.get(projectId);
    if (rules) {
      rules.push(row);
      continue;
    }
    grouped.set(projectId, [row]);
  }
  return grouped;
}

export async function syncCompanyAutoCodingRulesToSyncedProjects(args: {
  db: ProjectStandardsDb;
  companyId: ProjectAutoCodingRule['companyId'];
  actorUserId: NonNullable<ProjectAutoCodingRule['createdByUserId']>;
}) {
  const syncedProjectIds = await listSyncedProjectIdsForCompany({
    db: args.db,
    companyId: args.companyId,
  });
  await syncCompanyAutoCodingRulesToProjects({
    db: args.db,
    companyId: args.companyId,
    actorUserId: args.actorUserId,
    projectIds: syncedProjectIds,
  });
}

export async function syncCompanyAutoCodingRulesToProjects(args: {
  db: ProjectStandardsDb;
  companyId: ProjectAutoCodingRule['companyId'];
  actorUserId: NonNullable<ProjectAutoCodingRule['createdByUserId']>;
  projectIds: ProjectId[];
}) {
  const syncedProjectIds = args.projectIds;
  if (!syncedProjectIds.length) return;

  const [
    companyRules,
    projectRuleRows,
    defaultCategories,
    defaultSubCategories,
    projectCategoriesByProjectId,
    projectSubCategoriesByProjectId,
  ] = await Promise.all([
    args.db
      .selectFrom('company_default_mapping_rules')
      .select([
        'id',
        'company_id',
        'match_text',
        'company_default_category_id',
        'company_default_sub_category_id',
        'sort_order',
        'created_at',
        'updated_at',
      ])
      .where('company_id', '=', args.companyId)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute(),
    args.db
      .selectFrom('project_auto_coding_rules')
      .select(projectAutoCodingRuleSelectColumns())
      .where('project_id', 'in', syncedProjectIds)
      .execute(),
    listCompanyDefaultCategories(args.db, args.companyId),
    listCompanyDefaultSubCategories(args.db, args.companyId),
    listProjectCategoriesForProjects(args.db, syncedProjectIds),
    listProjectSubCategoriesForProjects(args.db, syncedProjectIds),
  ]);

  const projectRuleRowsByProjectId =
    groupProjectAutoCodingRuleRows(projectRuleRows);

  await Promise.all(
    syncedProjectIds.map((projectId) =>
      syncCompanyAutoCodingRulesWithPreloadedState({
        db: args.db,
        companyId: args.companyId,
        projectId,
        actorUserId: args.actorUserId,
        companyRules,
        projectRuleRows: projectRuleRowsByProjectId.get(projectId) ?? [],
        defaultCategories,
        defaultSubCategories,
        projectCategories: projectCategoriesByProjectId.get(projectId) ?? [],
        projectSubCategories:
          projectSubCategoriesByProjectId.get(projectId) ?? [],
      })
    )
  );
}

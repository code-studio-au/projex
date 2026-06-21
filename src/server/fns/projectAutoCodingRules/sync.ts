import { uid } from '../../../utils/id';
import { resolveCompanyDefaultRuleToProjectTaxonomy } from '../../../utils/companyDefaultMappings';
import type { ProjectAutoCodingRule, ProjectId } from '../../../types';
import { asProjectAutoCodingRuleId } from '../../../types';
import {
  buildDetachedProjectStandardMetadata,
  buildInheritedProjectStandardMetadata,
  listSyncedProjectIdsForCompany,
  type ProjectStandardsDb,
  shouldApplyInheritedUpdate,
} from '../../sync/projectStandards';
import { toCompanyDefaultMappingRule } from '../../mappers/taxonomyRows';
import {
  listCompanyDefaultCategories,
  listCompanyDefaultSubCategories,
  listProjectCategories,
  listProjectSubCategories,
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

  const now = new Date().toISOString();
  const companyRuleIds = new Set(companyRules.map((rule) => rule.id));

  for (const companyRule of companyRules) {
    const inherited = projectRuleRows.find(
      (rule) => rule.origin_company_item_id === companyRule.id
    );
    const resolved = resolveCompanyDefaultRuleToProjectTaxonomy({
      rule: toCompanyDefaultMappingRule(companyRule),
      defaultCategories,
      defaultSubCategories,
      projectCategories,
      projectSubCategories,
    });

    if (!resolved) {
      if (
        inherited &&
        inherited.sync_status !== 'detached' &&
        inherited.origin_company_item_id
      ) {
        await args.db
          .updateTable('project_auto_coding_rules')
          .set({
            ...buildDetachedProjectStandardMetadata({
              companyItemId: inherited.origin_company_item_id,
              previousSourceUpdatedAt: inherited.source_updated_at_snapshot,
              nowIso: now,
            }),
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('id', '=', inherited.id)
          .execute();
      }
      continue;
    }

    const exactLocalDuplicate = projectRuleRows.find(
      (rule) =>
        rule.origin_company_item_id == null &&
        projectAutoCodingRuleFingerprint(rule) ===
          projectAutoCodingRuleFingerprint({
            match_text: companyRule.match_text,
            sub_category_id: String(resolved.subCategoryId),
          })
    );

    if (inherited) {
      if (!shouldApplyInheritedUpdate(inherited.sync_status)) continue;
      await args.db
        .updateTable('project_auto_coding_rules')
        .set({
          match_text: companyRule.match_text,
          category_id: resolved.categoryId,
          sub_category_id: resolved.subCategoryId,
          sort_order: companyRule.sort_order,
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
      .insertInto('project_auto_coding_rules')
      .values({
        id: asProjectAutoCodingRuleId(uid('prule')),
        company_id: args.companyId,
        project_id: args.projectId,
        match_text: companyRule.match_text,
        category_id: resolved.categoryId,
        sub_category_id: resolved.subCategoryId,
        ...buildInheritedProjectStandardMetadata({
          companyItemId: companyRule.id,
          sourceUpdatedAt: companyRule.updated_at,
          nowIso: now,
        }),
        sort_order: companyRule.sort_order,
        created_by_user_id: args.actorUserId,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  const staleProjectRules = projectRuleRows.filter(
    (rule) =>
      rule.origin_company_item_id &&
      !companyRuleIds.has(rule.origin_company_item_id) &&
      rule.sync_status !== 'detached'
  );

  for (const staleRule of staleProjectRules) {
    await args.db
      .updateTable('project_auto_coding_rules')
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

export async function syncCompanyAutoCodingRulesToSyncedProjects(args: {
  db: ProjectStandardsDb;
  companyId: ProjectAutoCodingRule['companyId'];
  actorUserId: NonNullable<ProjectAutoCodingRule['createdByUserId']>;
}) {
  const syncedProjectIds = await listSyncedProjectIdsForCompany({
    db: args.db,
    companyId: args.companyId,
  });
  for (const projectId of syncedProjectIds) {
    await syncCompanyAutoCodingRulesToProject({
      db: args.db,
      companyId: args.companyId,
      projectId,
      actorUserId: args.actorUserId,
    });
  }
}

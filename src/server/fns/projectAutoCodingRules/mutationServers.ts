import { AppError } from '../../../api/errors';
import type {
  BackfillProjectCodingInput,
  BackfillProjectCodingResult,
  CreateProjectAutoCodingRuleInput,
  CreateProjectAutoCodingRuleResult,
  ProjectAutoCodingRuleUpdateInput,
  PromoteProjectRuleToCompanyDefaultInput,
  PromoteProjectRuleToCompanyDefaultResult,
} from '../../../api/types';
import type { ProjectAutoCodingRule, ProjectId, Txn } from '../../../types';
import {
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asProjectAutoCodingRuleId,
  asSubCategoryId,
} from '../../../types';
import { uid } from '../../../utils/id';
import {
  applyProjectAutoCodingRule,
  findMatchingProjectAutoCodingRule,
} from '../../../utils/projectAutoCodingRules';
import {
  canonicalizeRuleText,
  textRuleMatches,
  transactionRuleHaystack,
} from '../../../utils/textRuleMatching';
import { subCategoryNameSchema } from '../../../validation/schemas';
import { validateOrThrow } from '../../../validation/validate';
import { requireAuthorized } from '../../auth/authorize';
import {
  toCompanyDefaultCategory,
  toCompanyDefaultSubCategory,
} from '../../mappers/taxonomyRows';
import {
  buildInheritedProjectStandardMetadata,
  buildLocalProjectStandardMetadata,
} from '../../sync/projectStandards';
import { syncCompanyTaxonomyToProjects } from '../taxonomy/standards';
import { ensureBudgetLinesForProjectSubCategories } from '../budgets';
import {
  assertSubCategoryInProject,
  requireOperationalProjectForAction,
} from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import {
  listProjectRules,
  listProjectTransactions,
  projectAutoCodingRuleSelectColumns,
  resolveInheritedCompanyAutoCodingRule,
  toProjectAutoCodingRule,
} from './shared';
import { syncCompanyAutoCodingRulesToProjects } from './sync';

export async function createProjectAutoCodingRuleServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: CreateProjectAutoCodingRuleInput;
}): Promise<CreateProjectAutoCodingRuleResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const context = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    const { db, userId, companyId } = context;
    validateOrThrow(subCategoryNameSchema, args.input.matchText);
    const targetSubCategory = await assertSubCategoryInProject({
      db,
      projectId: args.projectId,
      subCategoryId: args.input.subCategoryId,
    });
    const targetCategoryId = asCategoryId(targetSubCategory.category_id);

    const matchText = args.input.matchText.trim();
    const now = new Date().toISOString();

    return db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('project_auto_coding_rules')
        .select(projectAutoCodingRuleSelectColumns())
        .where('project_id', '=', args.projectId)
        .where(({ fn, eb }) =>
          eb(fn('lower', ['match_text']), '=', matchText.toLowerCase())
        )
        .where('sub_category_id', '=', args.input.subCategoryId)
        .executeTakeFirst();

      let rule: ProjectAutoCodingRule;
      if (existing) {
        rule = toProjectAutoCodingRule(existing);
      } else {
        const maxSort = await trx
          .selectFrom('project_auto_coding_rules')
          .select(({ fn }) => fn.max<number>('sort_order').as('max_sort_order'))
          .where('project_id', '=', args.projectId)
          .executeTakeFirst();
        const inserted = await trx
          .insertInto('project_auto_coding_rules')
          .values({
            id: asProjectAutoCodingRuleId(uid('prule')),
            company_id: companyId,
            project_id: args.projectId,
            match_text: matchText,
            category_id: targetCategoryId,
            sub_category_id: args.input.subCategoryId,
            ...buildLocalProjectStandardMetadata(now),
            sort_order: Number(maxSort?.max_sort_order ?? -1) + 1,
            created_by_user_id: userId,
            created_at: now,
            updated_at: now,
          })
          .returning(projectAutoCodingRuleSelectColumns())
          .executeTakeFirstOrThrow();
        rule = toProjectAutoCodingRule(inserted);
      }

      const txns = await listProjectTransactions(trx, args.projectId);
      const matchedTxnIds = txns.flatMap((txn: Txn) => {
        if (txn.lockedAt || !txn.categorisable || txn.subCategoryId) return [];
        return textRuleMatches({
          haystack: transactionRuleHaystack(txn),
          needle: matchText,
        })
          ? [txn.id]
          : [];
      });

      if (matchedTxnIds.length > 0) {
        await ensureBudgetLinesForProjectSubCategories({
          db: trx,
          companyId,
          projectId: args.projectId,
          targets: [
            {
              categoryId: targetCategoryId,
              subCategoryId: args.input.subCategoryId,
            },
          ],
        });
        await trx
          .updateTable('txns')
          .set({
            category_id: targetCategoryId,
            sub_category_id: args.input.subCategoryId,
            company_default_mapping_rule_id: null,
            coding_source: 'project_rule',
            coding_pending_approval: true,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('public_id', 'in', matchedTxnIds)
          .where('locked_at', 'is', null)
          .execute();
      }

      return {
        rule,
        matchedTxnCount: matchedTxnIds.length,
      };
    });
  });
}

export async function updateProjectAutoCodingRuleServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: ProjectAutoCodingRuleUpdateInput;
}): Promise<ProjectAutoCodingRule> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );

    const existing = await db
      .selectFrom('project_auto_coding_rules')
      .select(projectAutoCodingRuleSelectColumns())
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Unknown project auto-coding rule');
    }

    if (args.input.matchText != null) {
      validateOrThrow(subCategoryNameSchema, args.input.matchText);
    }

    const nextSubCategoryId =
      args.input.subCategoryId ?? asSubCategoryId(existing.sub_category_id);
    const targetSubCategory = await assertSubCategoryInProject({
      db,
      projectId: args.projectId,
      subCategoryId: nextSubCategoryId,
    });
    const nextCategoryId = asCategoryId(targetSubCategory.category_id);

    const nextMatchText = args.input.matchText?.trim() ?? existing.match_text;
    const duplicate = await db
      .selectFrom('project_auto_coding_rules')
      .select('id')
      .where('project_id', '=', args.projectId)
      .where('id', '!=', args.input.id)
      .where(({ fn, eb }) =>
        eb(fn('lower', ['match_text']), '=', nextMatchText.toLowerCase())
      )
      .where('sub_category_id', '=', nextSubCategoryId)
      .executeTakeFirst();
    if (duplicate) {
      throw new AppError(
        'CONFLICT',
        'A project auto-coding rule already exists for that match text and subcategory'
      );
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (args.input.matchText != null) patch.match_text = nextMatchText;
    if (args.input.subCategoryId != null) {
      patch.sub_category_id = args.input.subCategoryId;
      patch.category_id = nextCategoryId;
    }
    if (args.input.sortOrder != null) patch.sort_order = args.input.sortOrder;
    if (
      existing.origin_scope === 'company' &&
      existing.origin_company_item_id != null
    ) {
      const inheritedRule = await resolveInheritedCompanyAutoCodingRule({
        db,
        companyId: existing.company_id as ProjectAutoCodingRule['companyId'],
        projectId: args.projectId,
        companyRuleId: existing.origin_company_item_id,
      });
      const nextSortOrder = args.input.sortOrder ?? existing.sort_order;

      if (
        inheritedRule &&
        canonicalizeRuleText(nextMatchText) ===
          canonicalizeRuleText(inheritedRule.companyRule.match_text) &&
        nextCategoryId === inheritedRule.resolved.categoryId &&
        nextSubCategoryId === inheritedRule.resolved.subCategoryId &&
        nextSortOrder === inheritedRule.companyRule.sort_order
      ) {
        Object.assign(
          patch,
          buildInheritedProjectStandardMetadata({
            companyItemId: inheritedRule.companyRule.id,
            sourceUpdatedAt: inheritedRule.companyRule.updated_at,
            nowIso: new Date().toISOString(),
          })
        );
      } else if (existing.sync_status === 'inherited') {
        patch.sync_status = 'overridden';
        patch.last_synced_at = new Date().toISOString();
      }
    }

    const updated = await db
      .updateTable('project_auto_coding_rules')
      .set(patch)
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.id)
      .returning(projectAutoCodingRuleSelectColumns())
      .executeTakeFirstOrThrow();

    return toProjectAutoCodingRule(updated);
  });
}

export async function deleteProjectAutoCodingRuleServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  ruleId: ProjectAutoCodingRule['id'];
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );

    const existing = await db
      .selectFrom('project_auto_coding_rules')
      .select(['id', 'origin_scope', 'sync_status'])
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.ruleId)
      .executeTakeFirst();
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Unknown project auto-coding rule');
    }
    if (
      existing.origin_scope === 'company' &&
      existing.sync_status === 'inherited'
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Inherited company auto-coding rules cannot be deleted from a synced project.'
      );
    }

    await db
      .deleteFrom('project_auto_coding_rules')
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.ruleId)
      .execute();
  });
}

export async function backfillProjectCodingServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: BackfillProjectCodingInput;
}): Promise<BackfillProjectCodingResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, companyId } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );

    const [projectRules, txns] = await Promise.all([
      listProjectRules(db, args.projectId),
      listProjectTransactions(db, args.projectId),
    ]);

    const eligibleTxns = txns.filter(
      (txn) => txn.categorisable && !txn.lockedAt && !txn.subCategoryId
    );
    const now = new Date().toISOString();
    const projectScopedRules = projectRules.filter(
      (rule) =>
        !(rule.originScope === 'company' && rule.syncStatus === 'inherited')
    );
    const inheritedCompanyRules = projectRules.filter(
      (rule) =>
        rule.originScope === 'company' && rule.syncStatus === 'inherited'
    );
    let projectRuleMatches = 0;
    let companyRuleMatches = 0;
    let updatedCount = 0;
    const mode = args.input.mode;

    await db.transaction().execute(async (trx) => {
      const budgetTargets = new Map<
        string,
        { categoryId: string; subCategoryId: string }
      >();
      for (const txn of eligibleTxns) {
        let nextTxn = txn;

        if (mode === 'project_rules' || mode === 'all') {
          const matchedProjectRule = findMatchingProjectAutoCodingRule(
            nextTxn,
            [...projectScopedRules]
          );
          if (matchedProjectRule) {
            nextTxn = applyProjectAutoCodingRule({
              txn: nextTxn,
              rules: projectScopedRules,
            });
            projectRuleMatches += 1;
          }
        }

        if (
          !nextTxn.subCategoryId &&
          (mode === 'company_rules' || mode === 'all')
        ) {
          const matchedCompanyRule = findMatchingProjectAutoCodingRule(
            nextTxn,
            inheritedCompanyRules
          );
          if (matchedCompanyRule) {
            nextTxn = applyProjectAutoCodingRule({
              txn: nextTxn,
              rules: inheritedCompanyRules,
            });
            companyRuleMatches += 1;
          }
        }

        if (!nextTxn.subCategoryId) continue;

        budgetTargets.set(String(nextTxn.subCategoryId), {
          categoryId: String(nextTxn.categoryId),
          subCategoryId: String(nextTxn.subCategoryId),
        });

        await trx
          .updateTable('txns')
          .set({
            category_id: nextTxn.categoryId ?? null,
            sub_category_id: nextTxn.subCategoryId ?? null,
            company_default_mapping_rule_id:
              nextTxn.companyDefaultMappingRuleId ?? null,
            coding_source: nextTxn.codingSource ?? null,
            coding_pending_approval: nextTxn.codingPendingApproval ?? false,
            updated_at: now,
          })
          .where('project_id', '=', args.projectId)
          .where('public_id', '=', txn.id)
          .where('locked_at', 'is', null)
          .execute();

        updatedCount += 1;
      }

      await ensureBudgetLinesForProjectSubCategories({
        db: trx,
        companyId,
        projectId: args.projectId,
        targets: [...budgetTargets.values()].map((target) => ({
          categoryId: asCategoryId(target.categoryId),
          subCategoryId: asSubCategoryId(target.subCategoryId),
        })),
      });
    });

    return {
      projectRuleMatches,
      companyRuleMatches,
      updatedCount,
    };
  });
}

export async function promoteProjectRuleToCompanyDefaultServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
  input: PromoteProjectRuleToCompanyDefaultInput;
}): Promise<PromoteProjectRuleToCompanyDefaultResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId, companyId } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'txns:edit'
    );
    await requireAuthorized({
      db,
      userId,
      action: 'company:manage_defaults',
      companyId,
      projectId: args.projectId,
    });

    const rule = await db
      .selectFrom('project_auto_coding_rules')
      .select(projectAutoCodingRuleSelectColumns())
      .where('project_id', '=', args.projectId)
      .where('id', '=', args.input.ruleId)
      .executeTakeFirst();
    if (!rule) {
      throw new AppError('NOT_FOUND', 'Unknown project auto-coding rule');
    }

    const subCategory = await db
      .selectFrom('sub_categories')
      .select(['id', 'category_id', 'name'])
      .where('project_id', '=', args.projectId)
      .where('id', '=', rule.sub_category_id)
      .executeTakeFirst();
    const category = subCategory
      ? await db
          .selectFrom('categories')
          .select(['id', 'name'])
          .where('project_id', '=', args.projectId)
          .where('id', '=', subCategory.category_id)
          .executeTakeFirst()
      : null;
    if (!subCategory || !category) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Project rule target taxonomy no longer exists in this project'
      );
    }

    const now = new Date().toISOString();

    return db.transaction().execute(async (trx) => {
      let categoryCreated = false;
      let subCategoryCreated = false;
      let ruleCreated = false;

      const existingCategory = await trx
        .selectFrom('company_default_categories')
        .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
        .where('company_id', '=', companyId)
        .where(({ fn, eb }) =>
          eb(fn('lower', ['name']), '=', category.name.toLowerCase())
        )
        .executeTakeFirst();

      const companyCategory = existingCategory
        ? toCompanyDefaultCategory(existingCategory)
        : toCompanyDefaultCategory(
            await trx
              .insertInto('company_default_categories')
              .values({
                id: asCompanyDefaultCategoryId(uid('cdcat')),
                company_id: companyId,
                name: category.name,
                created_at: now,
                updated_at: now,
              })
              .returning([
                'id',
                'company_id',
                'name',
                'created_at',
                'updated_at',
              ])
              .executeTakeFirstOrThrow()
          );
      categoryCreated = !existingCategory;

      const existingSubCategory = await trx
        .selectFrom('company_default_sub_categories')
        .select([
          'id',
          'company_id',
          'company_default_category_id',
          'name',
          'created_at',
          'updated_at',
        ])
        .where('company_id', '=', companyId)
        .where('company_default_category_id', '=', companyCategory.id)
        .where(({ fn, eb }) =>
          eb(fn('lower', ['name']), '=', subCategory.name.toLowerCase())
        )
        .executeTakeFirst();

      const companySubCategory = existingSubCategory
        ? toCompanyDefaultSubCategory(existingSubCategory)
        : toCompanyDefaultSubCategory(
            await trx
              .insertInto('company_default_sub_categories')
              .values({
                id: asCompanyDefaultSubCategoryId(uid('cdsub')),
                company_id: companyId,
                company_default_category_id: companyCategory.id,
                name: subCategory.name,
                created_at: now,
                updated_at: now,
              })
              .returning([
                'id',
                'company_id',
                'company_default_category_id',
                'name',
                'created_at',
                'updated_at',
              ])
              .executeTakeFirstOrThrow()
          );
      subCategoryCreated = !existingSubCategory;

      const existingRule = await trx
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
        .where('company_id', '=', companyId)
        .where(({ fn, eb }) =>
          eb(fn('lower', ['match_text']), '=', rule.match_text.toLowerCase())
        )
        .where('company_default_sub_category_id', '=', companySubCategory.id)
        .executeTakeFirst();

      let companyRuleId: ReturnType<typeof asCompanyDefaultMappingRuleId>;
      if (existingRule) {
        companyRuleId = asCompanyDefaultMappingRuleId(existingRule.id);
      } else {
        const maxSort = await trx
          .selectFrom('company_default_mapping_rules')
          .select(({ fn }) => fn.max<number>('sort_order').as('max_sort_order'))
          .where('company_id', '=', companyId)
          .executeTakeFirst();
        const insertedRule = await trx
          .insertInto('company_default_mapping_rules')
          .values({
            id: asCompanyDefaultMappingRuleId(uid('cdrule')),
            company_id: companyId,
            match_text: rule.match_text,
            company_default_category_id: companyCategory.id,
            company_default_sub_category_id: companySubCategory.id,
            sort_order: Number(maxSort?.max_sort_order ?? -1) + 1,
            created_at: now,
            updated_at: now,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        companyRuleId = asCompanyDefaultMappingRuleId(insertedRule.id);
        ruleCreated = true;
      }

      const syncedProjectRows = await trx
        .selectFrom('projects')
        .select('id')
        .where('company_id', '=', companyId)
        .where('project_type', '=', 'project')
        .where('sync_company_defaults', '=', true)
        .execute();

      const syncedProjectIds = syncedProjectRows.map(
        (syncedProject) => syncedProject.id as ProjectId
      );

      await syncCompanyTaxonomyToProjects({
        db: trx,
        companyId,
        projectIds: syncedProjectIds,
      });
      await syncCompanyAutoCodingRulesToProjects({
        db: trx,
        companyId,
        actorUserId: userId,
        projectIds: syncedProjectIds,
      });

      await trx
        .updateTable('project_auto_coding_rules')
        .set({
          ...buildInheritedProjectStandardMetadata({
            companyItemId: companyRuleId,
            sourceUpdatedAt: now,
            nowIso: now,
          }),
          updated_at: now,
        })
        .where('project_id', '=', args.projectId)
        .where('id', '=', rule.id)
        .execute();

      return {
        companyDefaultCategoryId: companyCategory.id,
        companyDefaultSubCategoryId: companySubCategory.id,
        companyDefaultRuleId: companyRuleId,
        categoryCreated,
        subCategoryCreated,
        ruleCreated,
      };
    });
  });
}

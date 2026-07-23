import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProjectAutoCodingRuleServer,
  deleteProjectAutoCodingRuleServer,
  listProjectAutoCodingRulesServer,
  updateProjectAutoCodingRuleServer,
} from '../src/server/fns/projectAutoCodingRules.ts';
import { createProjectServer } from '../src/server/fns/projects.ts';
import {
  importTrustedTransactionsServer as importTransactionsServer,
  listTransactionsServer,
} from '../src/server/fns/transactions.ts';
import {
  createCompanyDefaultCategoryServer,
  createCompanyDefaultMappingRuleServer,
  createCompanyDefaultSubCategoryServer,
  deleteCompanyDefaultSubCategoryServer,
  deleteSubCategoryServer,
  deleteCompanyDefaultMappingRuleServer,
  updateCompanyDefaultSubCategoryServer,
  updateSubCategoryServer,
} from '../src/server/fns/taxonomy.ts';
import type { ServerFnContextInput } from '../src/server/fns/runtime.ts';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';
import {
  createIntegrationDb,
  integrationDatabaseUrl,
} from './dbIntegration.helpers.ts';

test(
  'project auto-coding rules can be listed, updated, reordered, and deleted',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_prule_admin_co_1');
    const userId = asUserId('itest_prule_admin_usr_1');
    const projectId = asProjectId('itest_prule_admin_prj_1');
    const categoryAId = asCategoryId('itest_prule_admin_cat_a');
    const categoryBId = asCategoryId('itest_prule_admin_cat_b');
    const subCategoryAId = asSubCategoryId('itest_prule_admin_sub_a');
    const subCategoryBId = asSubCategoryId('itest_prule_admin_sub_b');
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Project Rule Admin Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();

      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'prule-admin@example.com',
          name: 'Project Rule Admin User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();

      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'management' })
        .execute();

      await db
        .insertInto('projects')
        .values({
          id: projectId,
          company_id: companyId,
          name: 'Project Rule Admin Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
          allow_txn_transfers: false,
        })
        .execute();

      await db
        .insertInto('project_memberships')
        .values({ project_id: projectId, user_id: userId, role: 'member' })
        .execute();

      await db
        .insertInto('categories')
        .values([
          {
            id: categoryAId,
            company_id: companyId,
            project_id: projectId,
            name: 'Travel',
            created_at: now,
            updated_at: now,
          },
          {
            id: categoryBId,
            company_id: companyId,
            project_id: projectId,
            name: 'IT',
            created_at: now,
            updated_at: now,
          },
        ])
        .execute();

      await db
        .insertInto('sub_categories')
        .values([
          {
            id: subCategoryAId,
            company_id: companyId,
            project_id: projectId,
            category_id: categoryAId,
            name: 'Flights',
            created_at: now,
            updated_at: now,
          },
          {
            id: subCategoryBId,
            company_id: companyId,
            project_id: projectId,
            category_id: categoryBId,
            name: 'Software and Services',
            created_at: now,
            updated_at: now,
          },
        ])
        .execute();

      const first = await createProjectAutoCodingRuleServer({
        context: { session: { userId } },
        projectId,
        input: {
          matchText: 'qantas',
          subCategoryId: subCategoryAId,
        },
      });
      const second = await createProjectAutoCodingRuleServer({
        context: { session: { userId } },
        projectId,
        input: {
          matchText: 'microsoft',
          subCategoryId: subCategoryBId,
        },
      });

      const listed = await listProjectAutoCodingRulesServer({
        context: { session: { userId } },
        projectId,
      });
      assert.equal(listed.length, 2);
      assert.deepEqual(
        listed.map((rule) => rule.matchText),
        ['qantas', 'microsoft']
      );

      const updated = await updateProjectAutoCodingRuleServer({
        context: { session: { userId } },
        projectId,
        input: {
          id: second.rule.id,
          matchText: 'm365',
          subCategoryId: subCategoryBId,
        },
      });
      assert.equal(updated.matchText, 'm365');

      await updateProjectAutoCodingRuleServer({
        context: { session: { userId } },
        projectId,
        input: {
          id: first.rule.id,
          sortOrder: 1,
        },
      });
      await updateProjectAutoCodingRuleServer({
        context: { session: { userId } },
        projectId,
        input: {
          id: second.rule.id,
          sortOrder: 0,
        },
      });

      const reordered = await listProjectAutoCodingRulesServer({
        context: { session: { userId } },
        projectId,
      });
      assert.deepEqual(
        reordered.map((rule) => rule.matchText),
        ['m365', 'qantas']
      );

      await deleteProjectAutoCodingRuleServer({
        context: { session: { userId } },
        projectId,
        ruleId: first.rule.id,
      });

      const afterDelete = await listProjectAutoCodingRulesServer({
        context: { session: { userId } },
        projectId,
      });
      assert.equal(afterDelete.length, 1);
      assert.equal(afterDelete[0]?.id, second.rule.id);
      assert.equal(afterDelete[0]?.matchText, 'm365');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'subcategory IDs keep duplicate names distinct and moves update dependent rules atomically',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_sub_target_co_1');
    const userId = asUserId('itest_sub_target_usr_1');
    const projectId = asProjectId('itest_sub_target_prj_1');
    const itCategoryId = asCategoryId('itest_sub_target_cat_it');
    const facilitiesCategoryId = asCategoryId(
      'itest_sub_target_cat_facilities'
    );
    const travelCategoryId = asCategoryId('itest_sub_target_cat_travel');
    const sourceSubCategoryId = asSubCategoryId('itest_sub_target_sub_source');
    const duplicateSubCategoryId = asSubCategoryId(
      'itest_sub_target_sub_duplicate'
    );
    const unlockedTxnId = asTxnId('itest_sub_target_txn_unlocked');
    const lockedTxnId = asTxnId('itest_sub_target_txn_locked');
    const now = new Date().toISOString();
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Subcategory Target Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'subcategory-target@example.com',
          name: 'Subcategory Target User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'admin' })
        .execute();
      await db
        .insertInto('projects')
        .values({
          id: projectId,
          company_id: companyId,
          name: 'Subcategory Target Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
          allow_txn_transfers: false,
        })
        .execute();
      await db
        .insertInto('project_memberships')
        .values({ project_id: projectId, user_id: userId, role: 'member' })
        .execute();
      await db
        .insertInto('categories')
        .values([
          {
            id: itCategoryId,
            company_id: companyId,
            project_id: projectId,
            name: 'IT',
            created_at: now,
            updated_at: now,
          },
          {
            id: facilitiesCategoryId,
            company_id: companyId,
            project_id: projectId,
            name: 'Facilities',
            created_at: now,
            updated_at: now,
          },
          {
            id: travelCategoryId,
            company_id: companyId,
            project_id: projectId,
            name: 'Travel',
            created_at: now,
            updated_at: now,
          },
        ])
        .execute();
      await db
        .insertInto('sub_categories')
        .values([
          {
            id: sourceSubCategoryId,
            company_id: companyId,
            project_id: projectId,
            category_id: itCategoryId,
            name: 'Equipment',
            created_at: now,
            updated_at: now,
          },
          {
            id: duplicateSubCategoryId,
            company_id: companyId,
            project_id: projectId,
            category_id: facilitiesCategoryId,
            name: 'Equipment',
            created_at: now,
            updated_at: now,
          },
        ])
        .execute();
      await db
        .insertInto('budget_lines')
        .values({
          id: asBudgetLineId('itest_sub_target_budget_1'),
          company_id: companyId,
          project_id: projectId,
          category_id: itCategoryId,
          sub_category_id: sourceSubCategoryId,
          allocated_cents: 5000,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txns')
        .values(
          [
            { publicId: unlockedTxnId, locked: false },
            { publicId: lockedTxnId, locked: true },
          ].map(({ publicId, locked }, index) => ({
            public_id: publicId,
            external_id: `itest-sub-target-ext-${index + 1}`,
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-07-01',
            item: 'Equipment purchase',
            description: 'Equipment purchase',
            amount_cents: 1000 + index,
            txn_type: 'standard' as const,
            parent_public_id: null,
            source_public_id: null,
            transfer_project_id: null,
            budget_impact: true,
            categorisable: true,
            import_batch_id: null,
            import_source_type: null,
            import_source_meta: null,
            category_id: itCategoryId,
            sub_category_id: sourceSubCategoryId,
            company_default_mapping_rule_id: null,
            coding_source: 'manual' as const,
            coding_pending_approval: false,
            reviewed_at: locked ? now : null,
            reviewed_by_user_id: locked ? userId : null,
            locked_at: locked ? now : null,
            locked_by_user_id: locked ? userId : null,
            created_at: now,
            updated_at: now,
          }))
        )
        .execute();

      const createdRule = await createProjectAutoCodingRuleServer({
        context,
        projectId,
        input: {
          matchText: 'equipment purchase',
          subCategoryId: sourceSubCategoryId,
        },
      });

      await assert.rejects(
        updateSubCategoryServer({
          context,
          projectId,
          input: { id: sourceSubCategoryId, categoryId: travelCategoryId },
        }),
        /locked transactions use it/
      );
      await db
        .updateTable('txns')
        .set({ locked_at: null, locked_by_user_id: null, updated_at: now })
        .where('project_id', '=', projectId)
        .where('public_id', '=', lockedTxnId)
        .execute();
      await updateSubCategoryServer({
        context,
        projectId,
        input: { id: sourceSubCategoryId, categoryId: travelCategoryId },
      });

      const movedRule = await listProjectAutoCodingRulesServer({
        context,
        projectId,
      });
      assert.equal(movedRule[0]?.id, createdRule.rule.id);
      assert.equal(movedRule[0]?.categoryId, travelCategoryId);
      assert.equal(movedRule[0]?.subCategoryId, sourceSubCategoryId);
      const movedBudget = await db
        .selectFrom('budget_lines')
        .select(['category_id', 'sub_category_id'])
        .where('project_id', '=', projectId)
        .where('sub_category_id', '=', sourceSubCategoryId)
        .executeTakeFirstOrThrow();
      assert.equal(movedBudget.category_id, travelCategoryId);
      const movedTxns = await db
        .selectFrom('txns')
        .select(['public_id', 'category_id', 'sub_category_id'])
        .where('project_id', '=', projectId)
        .orderBy('public_id', 'asc')
        .execute();
      assert.equal(
        movedTxns.find((txn) => txn.public_id === unlockedTxnId)?.category_id,
        travelCategoryId
      );
      assert.equal(
        movedTxns.find((txn) => txn.public_id === lockedTxnId)?.category_id,
        travelCategoryId
      );

      await db
        .updateTable('txns')
        .set({
          locked_at: now,
          locked_by_user_id: userId,
          updated_at: now,
        })
        .where('project_id', '=', projectId)
        .where('public_id', '=', lockedTxnId)
        .execute();
      await assert.rejects(
        deleteSubCategoryServer({
          context,
          projectId,
          subCategoryId: sourceSubCategoryId,
          replacementSubCategoryId: duplicateSubCategoryId,
        }),
        /locked transactions use it/
      );
      await db
        .updateTable('txns')
        .set({ locked_at: null, locked_by_user_id: null, updated_at: now })
        .where('project_id', '=', projectId)
        .where('public_id', '=', lockedTxnId)
        .execute();
      await deleteSubCategoryServer({
        context,
        projectId,
        subCategoryId: sourceSubCategoryId,
        replacementSubCategoryId: duplicateSubCategoryId,
      });

      const reassignedRules = await listProjectAutoCodingRulesServer({
        context,
        projectId,
      });
      assert.equal(reassignedRules[0]?.categoryId, facilitiesCategoryId);
      assert.equal(reassignedRules[0]?.subCategoryId, duplicateSubCategoryId);
      assert.equal(
        await db
          .selectFrom('sub_categories')
          .select('id')
          .where('project_id', '=', projectId)
          .where('id', '=', sourceSubCategoryId)
          .executeTakeFirst(),
        undefined
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'existing synced projects expose inherited company auto-coding rules and company imports still resolve after company rules are added later',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_inherited_prule_co_1');
    const userId = asUserId('itest_inherited_prule_usr_1');
    const projectId = asProjectId('itest_inherited_prule_prj_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_inherited_prule_dcat_1'
    );
    const movedDefaultCategoryId = asCompanyDefaultCategoryId(
      'itest_inherited_prule_dcat_2'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_inherited_prule_dsub_1'
    );
    const replacementDefaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_inherited_prule_dsub_2'
    );
    const defaultRuleId = asCompanyDefaultMappingRuleId(
      'itest_inherited_prule_rule_1'
    );
    const overrideSubCategoryId = asSubCategoryId(
      'itest_inherited_prule_override_sub_1'
    );
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Inherited Project Rule Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'inherited-prule@example.com',
          name: 'Inherited Project Rule User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'admin' })
        .execute();

      await createCompanyDefaultCategoryServer({
        context,
        companyId,
        input: {
          id: defaultCategoryId,
          companyId,
          name: 'IT',
        },
      });
      await createCompanyDefaultSubCategoryServer({
        context,
        companyId,
        input: {
          id: defaultSubCategoryId,
          companyId,
          companyDefaultCategoryId: defaultCategoryId,
          name: 'Software and Services',
        },
      });
      await createCompanyDefaultCategoryServer({
        context,
        companyId,
        input: {
          id: movedDefaultCategoryId,
          companyId,
          name: 'Travel',
        },
      });

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'Inherited Rule Project',
        },
      });

      await createCompanyDefaultMappingRuleServer({
        context,
        companyId,
        input: {
          id: defaultRuleId,
          companyId,
          matchText: 'microsoft 365',
          companyDefaultSubCategoryId: defaultSubCategoryId,
          sortOrder: 0,
        },
      });

      const effectiveRules = await listProjectAutoCodingRulesServer({
        context,
        projectId,
      });
      assert.equal(effectiveRules.length, 1);
      assert.equal(effectiveRules[0]?.matchText, 'microsoft 365');
      assert.equal(effectiveRules[0]?.originScope, 'company');
      assert.equal(effectiveRules[0]?.originCompanyItemId, defaultRuleId);
      assert.equal(effectiveRules[0]?.syncStatus, 'inherited');

      await updateCompanyDefaultSubCategoryServer({
        context,
        companyId,
        input: {
          id: defaultSubCategoryId,
          companyDefaultCategoryId: movedDefaultCategoryId,
        },
      });
      const movedProjectSubCategory = await db
        .selectFrom('sub_categories')
        .select(['id', 'category_id'])
        .where('project_id', '=', projectId)
        .where('origin_company_item_id', '=', defaultSubCategoryId)
        .executeTakeFirstOrThrow();
      const movedProjectCategory = await db
        .selectFrom('categories')
        .select('id')
        .where('project_id', '=', projectId)
        .where('origin_company_item_id', '=', movedDefaultCategoryId)
        .executeTakeFirstOrThrow();
      assert.equal(
        movedProjectSubCategory.category_id,
        movedProjectCategory.id
      );
      const rulesAfterCompanyMove = await listProjectAutoCodingRulesServer({
        context,
        projectId,
      });
      assert.equal(
        rulesAfterCompanyMove[0]?.categoryId,
        movedProjectCategory.id
      );
      assert.equal(rulesAfterCompanyMove[0]?.syncStatus, 'inherited');

      await updateSubCategoryServer({
        context,
        projectId,
        input: {
          id: asSubCategoryId(movedProjectSubCategory.id),
          name: 'Project Software Override',
        },
      });
      await assert.rejects(
        deleteSubCategoryServer({
          context,
          projectId,
          subCategoryId: asSubCategoryId(movedProjectSubCategory.id),
        }),
        /company default still exists/
      );
      await updateSubCategoryServer({
        context,
        projectId,
        input: {
          id: asSubCategoryId(movedProjectSubCategory.id),
          name: 'Software and Services',
        },
      });

      const inheritedImport = await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        autoCreateBudgets: true,
        txns: [
          {
            id: asTxnId('itest_inherited_prule_txn_1'),
            externalId: 'itest-inherited-prule-ext-1',
            companyId,
            projectId,
            date: '2026-06-18',
            item: 'Microsoft 365',
            description: 'Monthly Microsoft 365 subscription',
            amountCents: 2499,
          },
        ],
      });
      assert.equal(inheritedImport.count, 1);

      const inheritedTxn = (
        await listTransactionsServer({ context, projectId })
      ).find((txn) => txn.externalId === 'itest-inherited-prule-ext-1');
      assert.equal(inheritedTxn?.companyDefaultMappingRuleId, defaultRuleId);
      assert.equal(inheritedTxn?.codingSource, 'company_default_rule');
      assert.equal(inheritedTxn?.codingPendingApproval, true);

      const projectCategory = await db
        .selectFrom('categories')
        .select(['id'])
        .where('project_id', '=', projectId)
        .where('origin_company_item_id', '=', defaultCategoryId)
        .executeTakeFirstOrThrow();
      await db
        .insertInto('sub_categories')
        .values({
          id: overrideSubCategoryId,
          company_id: companyId,
          project_id: projectId,
          category_id: projectCategory.id,
          name: 'VoIP',
          origin_scope: 'project',
          origin_company_item_id: null,
          sync_status: 'local',
          last_synced_at: new Date().toISOString(),
          source_updated_at_snapshot: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      const overriddenRule = await updateProjectAutoCodingRuleServer({
        context,
        projectId,
        input: {
          id: effectiveRules[0]!.id,
          subCategoryId: overrideSubCategoryId,
        },
      });
      assert.equal(overriddenRule.originScope, 'company');
      assert.equal(overriddenRule.syncStatus, 'overridden');
      assert.equal(overriddenRule.originCompanyItemId, defaultRuleId);

      const imported = await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        autoCreateBudgets: true,
        txns: [
          {
            id: asTxnId('itest_inherited_prule_txn_2'),
            externalId: 'itest-inherited-prule-ext-2',
            companyId,
            projectId,
            date: '2026-06-18',
            item: 'Microsoft 365',
            description: 'Monthly Microsoft 365 subscription',
            amountCents: 2499,
          },
        ],
      });
      assert.equal(imported.count, 1);

      const importedTxn = (
        await listTransactionsServer({ context, projectId })
      ).find((txn) => txn.externalId === 'itest-inherited-prule-ext-2');
      assert.equal(importedTxn?.companyDefaultMappingRuleId, undefined);
      assert.equal(importedTxn?.codingSource, 'project_rule');
      assert.equal(importedTxn?.codingPendingApproval, true);

      await createCompanyDefaultSubCategoryServer({
        context,
        companyId,
        input: {
          id: replacementDefaultSubCategoryId,
          companyId,
          companyDefaultCategoryId: movedDefaultCategoryId,
          name: 'Cloud Services',
        },
      });
      await deleteCompanyDefaultSubCategoryServer({
        context,
        companyId,
        subCategoryId: defaultSubCategoryId,
        replacementSubCategoryId: replacementDefaultSubCategoryId,
      });
      const reassignedCompanyRule = await db
        .selectFrom('company_default_mapping_rules')
        .select([
          'company_default_category_id',
          'company_default_sub_category_id',
        ])
        .where('company_id', '=', companyId)
        .where('id', '=', defaultRuleId)
        .executeTakeFirstOrThrow();
      assert.equal(
        reassignedCompanyRule.company_default_category_id,
        movedDefaultCategoryId
      );
      assert.equal(
        reassignedCompanyRule.company_default_sub_category_id,
        replacementDefaultSubCategoryId
      );

      await deleteCompanyDefaultMappingRuleServer({
        context,
        companyId,
        ruleId: defaultRuleId,
      });
      const afterDelete = await listProjectAutoCodingRulesServer({
        context,
        projectId,
      });
      assert.equal(afterDelete[0]?.syncStatus, 'detached');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'reverting an overridden inherited project auto-coding rule back to the company shape restores inherited status',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_prule_revert_co_1');
    const userId = asUserId('itest_prule_revert_usr_1');
    const projectId = asProjectId('itest_prule_revert_prj_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_prule_revert_dcat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_prule_revert_dsub_1'
    );
    const defaultRuleId = asCompanyDefaultMappingRuleId(
      'itest_prule_revert_rule_1'
    );
    const overrideSubCategoryId = asSubCategoryId(
      'itest_prule_revert_override_sub_1'
    );
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Project Rule Revert Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'project-rule-revert@example.com',
          name: 'Project Rule Revert User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'admin' })
        .execute();

      await createCompanyDefaultCategoryServer({
        context,
        companyId,
        input: {
          id: defaultCategoryId,
          companyId,
          name: 'IT',
        },
      });
      await createCompanyDefaultSubCategoryServer({
        context,
        companyId,
        input: {
          id: defaultSubCategoryId,
          companyId,
          companyDefaultCategoryId: defaultCategoryId,
          name: 'Software and Services',
        },
      });

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'Project Rule Revert Project',
        },
      });

      await createCompanyDefaultMappingRuleServer({
        context,
        companyId,
        input: {
          id: defaultRuleId,
          companyId,
          matchText: 'microsoft 365',
          companyDefaultSubCategoryId: defaultSubCategoryId,
          sortOrder: 10,
        },
      });

      const inheritedRules = await listProjectAutoCodingRulesServer({
        context,
        projectId,
      });
      const inheritedRule = inheritedRules[0];
      assert.ok(inheritedRule);
      assert.equal(inheritedRule?.syncStatus, 'inherited');

      const projectCategory = await db
        .selectFrom('categories')
        .select(['id'])
        .where('project_id', '=', projectId)
        .where('origin_company_item_id', '=', defaultCategoryId)
        .executeTakeFirstOrThrow();
      await db
        .insertInto('sub_categories')
        .values({
          id: overrideSubCategoryId,
          company_id: companyId,
          project_id: projectId,
          category_id: projectCategory.id,
          name: 'VoIP',
          origin_scope: 'project',
          origin_company_item_id: null,
          sync_status: 'local',
          last_synced_at: new Date().toISOString(),
          source_updated_at_snapshot: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();

      const overriddenRule = await updateProjectAutoCodingRuleServer({
        context,
        projectId,
        input: {
          id: inheritedRule!.id,
          subCategoryId: overrideSubCategoryId,
          sortOrder: 20,
        },
      });
      assert.equal(overriddenRule.syncStatus, 'overridden');

      const restoredRule = await updateProjectAutoCodingRuleServer({
        context,
        projectId,
        input: {
          id: inheritedRule!.id,
          matchText: 'microsoft 365',
          subCategoryId: inheritedRule!.subCategoryId,
          sortOrder: 10,
        },
      });
      assert.equal(restoredRule.matchText, 'microsoft 365');
      assert.equal(restoredRule.originScope, 'company');
      assert.equal(restoredRule.originCompanyItemId, defaultRuleId);
      assert.equal(restoredRule.syncStatus, 'inherited');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

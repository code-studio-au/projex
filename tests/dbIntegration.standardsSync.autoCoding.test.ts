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
  importTransactionsServer,
  listTransactionsServer,
} from '../src/server/fns/transactions.ts';
import {
  createCompanyDefaultCategoryServer,
  createCompanyDefaultMappingRuleServer,
  createCompanyDefaultSubCategoryServer,
  deleteCompanyDefaultMappingRuleServer,
} from '../src/server/fns/taxonomy.ts';
import type { ServerFnContextInput } from '../src/server/fns/runtime.ts';
import {
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
          categoryId: categoryAId,
          subCategoryId: subCategoryAId,
        },
      });
      const second = await createProjectAutoCodingRuleServer({
        context: { session: { userId } },
        projectId,
        input: {
          matchText: 'microsoft',
          categoryId: categoryBId,
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
          categoryId: categoryBId,
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
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_inherited_prule_dsub_1'
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
          companyDefaultCategoryId: defaultCategoryId,
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
          last_synced_at: null,
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
          categoryId: projectCategory.id as ReturnType<typeof asCategoryId>,
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
          companyDefaultCategoryId: defaultCategoryId,
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
          last_synced_at: null,
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
          categoryId: projectCategory.id as ReturnType<typeof asCategoryId>,
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
          categoryId: projectCategory.id as ReturnType<typeof asCategoryId>,
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

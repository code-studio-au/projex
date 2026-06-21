import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProjectAutoCodingRuleServer,
  deleteProjectAutoCodingRuleServer,
  listProjectAutoCodingRulesServer,
  updateProjectAutoCodingRuleServer,
} from '../src/server/fns/projectAutoCodingRules.ts';
import { createProjectServer, updateProjectServer } from '../src/server/fns/projects.ts';
import {
  importTransactionsServer,
  listTransactionsServer,
  previewImportTransactionsServer,
} from '../src/server/fns/transactions.ts';
import {
  createCompanyDefaultCategoryServer,
  createCompanyDefaultMappingRuleServer,
  createCompanyDefaultSubCategoryServer,
  deleteCompanyDefaultCategoryServer,
  deleteCompanyDefaultMappingRuleServer,
  listCategoriesServer,
  listSubCategoriesServer,
  promoteProjectSubCategoryToCompanyDefaultServer,
  updateCategoryServer,
  updateCompanyDefaultCategoryServer,
  updateSubCategoryServer,
} from '../src/server/fns/taxonomy.ts';
import {
  createImportRuleServer,
  createProjectImportRuleServer,
  deleteImportRuleServer,
  listImportRulesServer,
  listProjectImportRulesServer,
  promoteProjectImportRuleServer,
  updateImportRuleServer,
  updateProjectImportRuleServer,
} from '../src/server/fns/importRules.ts';
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
  assertAppErrorCode,
  createIntegrationDb,
  integrationDatabaseUrl,
} from './dbIntegration.helpers.ts';

test(
  'project import rules stay project-scoped until an admin promotes them',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_pimport_scope_co_1');
    const adminUserId = asUserId('itest_pimport_scope_admin_1');
    const leadUserId = asUserId('itest_pimport_scope_lead_1');
    const projectId = asProjectId('itest_pimport_scope_prj_1');

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [adminUserId, leadUserId])
        .execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Project Import Scope Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();

      await db
        .insertInto('users')
        .values([
          {
            id: adminUserId,
            email: 'project-import-admin@example.com',
            name: 'Project Import Admin',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: leadUserId,
            email: 'project-import-lead@example.com',
            name: 'Project Import Lead',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();

      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: adminUserId, role: 'admin' },
          { company_id: companyId, user_id: leadUserId, role: 'member' },
        ])
        .execute();

      await db
        .insertInto('projects')
        .values({
          id: projectId,
          company_id: companyId,
          name: 'Project Import Scope Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
          sync_company_defaults: false,
          allow_txn_transfers: false,
        })
        .execute();

      await db
        .insertInto('project_memberships')
        .values([
          { project_id: projectId, user_id: adminUserId, role: 'owner' },
          { project_id: projectId, user_id: leadUserId, role: 'lead' },
        ])
        .execute();

      const createdProjectRule = await createProjectImportRuleServer({
        context: { session: { userId: leadUserId } },
        projectId,
        input: {
          companyId,
          projectId,
          scope: 'project',
          name: 'Exclude internal recharge rows',
          action: 'exclude',
          field: 'journalLineDescription',
          operator: 'contains',
          value: 'internal recharge',
          sortOrder: 10,
          enabled: true,
        },
      });
      assert.equal(createdProjectRule.scope, 'project');
      assert.equal(createdProjectRule.projectId, projectId);

      const projectRules = await listProjectImportRulesServer({
        context: { session: { userId: leadUserId } },
        projectId,
      });
      assert.equal(projectRules.length, 1);
      assert.equal(projectRules[0]?.id, createdProjectRule.id);
      assert.equal(projectRules[0]?.scope, 'project');

      const companyRulesBeforePromotion = await listImportRulesServer({
        context: { session: { userId: leadUserId } },
        companyId,
      });
      assert.equal(
        companyRulesBeforePromotion.some(
          (rule) => rule.id === createdProjectRule.id
        ),
        false
      );
      assert.ok(
        companyRulesBeforePromotion.every((rule) => rule.scope === 'company')
      );

      await assertAppErrorCode(
        () =>
          promoteProjectImportRuleServer({
            context: { session: { userId: leadUserId } },
            projectId,
            ruleId: createdProjectRule.id,
          }),
        'FORBIDDEN',
        'project import rule promotion requires company defaults permission'
      );

      const promotedCompanyRule = await promoteProjectImportRuleServer({
        context: { session: { userId: adminUserId } },
        projectId,
        ruleId: createdProjectRule.id,
      });
      assert.equal(promotedCompanyRule.scope, 'company');
      assert.equal(promotedCompanyRule.projectId, undefined);
      assert.equal(promotedCompanyRule.name, createdProjectRule.name);

      const companyRulesAfterPromotion = await listImportRulesServer({
        context: { session: { userId: adminUserId } },
        companyId,
      });
      assert.equal(
        companyRulesAfterPromotion.some(
          (rule) =>
            rule.id === promotedCompanyRule.id && rule.scope === 'company'
        ),
        true
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [adminUserId, leadUserId])
        .execute();
      await db.destroy();
    }
  }
);

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

test(
  'enabling sync_company_defaults on an existing project backfills current company defaults and stores the flag',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_sync_toggle_co_1');
    const userId = asUserId('itest_sync_toggle_usr_1');
    const projectId = asProjectId('itest_sync_toggle_prj_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_sync_toggle_dcat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_sync_toggle_dsub_1'
    );
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Sync Toggle Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'sync-toggle@example.com',
          name: 'Sync Toggle User',
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
          name: 'Sync Toggle Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
          sync_company_defaults: false,
          allow_txn_transfers: false,
        })
        .execute();
      await db
        .insertInto('company_default_categories')
        .values({
          id: defaultCategoryId,
          company_id: companyId,
          name: 'Travel',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('company_default_sub_categories')
        .values({
          id: defaultSubCategoryId,
          company_id: companyId,
          company_default_category_id: defaultCategoryId,
          name: 'Flights',
          created_at: now,
          updated_at: now,
        })
        .execute();

      const updated = await updateProjectServer({
        context: { session: { userId } },
        input: {
          id: projectId,
          syncCompanyDefaults: true,
        },
      });
      assert.equal(updated.syncCompanyDefaults, true);

      const projectCategory = await db
        .selectFrom('categories')
        .select('name')
        .where('project_id', '=', projectId)
        .where('name', '=', 'Travel')
        .executeTakeFirst();
      const projectSubCategory = await db
        .selectFrom('sub_categories')
        .select('name')
        .where('project_id', '=', projectId)
        .where('name', '=', 'Flights')
        .executeTakeFirst();
      assert.equal(projectCategory?.name, 'Travel');
      assert.equal(projectSubCategory?.name, 'Flights');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'synced project taxonomy inherits provenance, allows project overrides, and detaches when company defaults are removed',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_taxonomy_sync_co_1');
    const userId = asUserId('itest_taxonomy_sync_usr_1');
    const projectId = asProjectId('itest_taxonomy_sync_prj_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_taxonomy_sync_dcat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_taxonomy_sync_dsub_1'
    );
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Taxonomy Sync Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'taxonomy-sync@example.com',
          name: 'Taxonomy Sync User',
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
          name: 'Travel',
        },
      });
      await createCompanyDefaultSubCategoryServer({
        context,
        companyId,
        input: {
          id: defaultSubCategoryId,
          companyId,
          companyDefaultCategoryId: defaultCategoryId,
          name: 'Flights',
        },
      });

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'Taxonomy Sync Project',
        },
      });

      const inheritedCategories = await listCategoriesServer({
        context,
        projectId,
      });
      const inheritedSubCategories = await listSubCategoriesServer({
        context,
        projectId,
      });

      assert.equal(inheritedCategories.length, 1);
      assert.equal(inheritedCategories[0]?.name, 'Travel');
      assert.equal(inheritedCategories[0]?.originScope, 'company');
      assert.equal(
        inheritedCategories[0]?.originCompanyItemId,
        defaultCategoryId
      );
      assert.equal(inheritedCategories[0]?.syncStatus, 'inherited');

      assert.equal(inheritedSubCategories.length, 1);
      assert.equal(inheritedSubCategories[0]?.name, 'Flights');
      assert.equal(inheritedSubCategories[0]?.originScope, 'company');
      assert.equal(
        inheritedSubCategories[0]?.originCompanyItemId,
        defaultSubCategoryId
      );
      assert.equal(inheritedSubCategories[0]?.syncStatus, 'inherited');

      await updateCompanyDefaultCategoryServer({
        context,
        companyId,
        input: {
          id: defaultCategoryId,
          name: 'Travel and Transport',
        },
      });

      const renamedCategories = await listCategoriesServer({
        context,
        projectId,
      });
      assert.equal(renamedCategories[0]?.name, 'Travel and Transport');
      assert.equal(renamedCategories[0]?.syncStatus, 'inherited');

      await updateCategoryServer({
        context,
        projectId,
        input: {
          id: inheritedCategories[0]!.id,
          name: 'Travel Local Override',
        },
      });

      const overriddenCategories = await listCategoriesServer({
        context,
        projectId,
      });
      assert.equal(overriddenCategories[0]?.name, 'Travel Local Override');
      assert.equal(overriddenCategories[0]?.syncStatus, 'overridden');

      await updateCompanyDefaultCategoryServer({
        context,
        companyId,
        input: {
          id: defaultCategoryId,
          name: 'Travel Final Canonical',
        },
      });

      const preservedOverrideCategories = await listCategoriesServer({
        context,
        projectId,
      });
      assert.equal(
        preservedOverrideCategories[0]?.name,
        'Travel Local Override'
      );
      assert.equal(preservedOverrideCategories[0]?.syncStatus, 'overridden');

      await deleteCompanyDefaultCategoryServer({
        context,
        companyId,
        categoryId: defaultCategoryId,
      });

      const detachedCategories = await listCategoriesServer({
        context,
        projectId,
      });
      assert.equal(detachedCategories.length, 1);
      assert.equal(detachedCategories[0]?.name, 'Travel Local Override');
      assert.equal(detachedCategories[0]?.originScope, 'company');
      assert.equal(
        detachedCategories[0]?.originCompanyItemId,
        defaultCategoryId
      );
      assert.equal(detachedCategories[0]?.syncStatus, 'detached');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'reverting an overridden inherited taxonomy item back to the company shape restores inherited status and avoids duplicate promotion',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_taxonomy_revert_co_1');
    const userId = asUserId('itest_taxonomy_revert_usr_1');
    const projectId = asProjectId('itest_taxonomy_revert_prj_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_taxonomy_revert_dcat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_taxonomy_revert_dsub_1'
    );
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Taxonomy Revert Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'taxonomy-revert@example.com',
          name: 'Taxonomy Revert User',
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
          name: 'Taxonomy Revert Project',
        },
      });

      const inheritedCategories = await listCategoriesServer({
        context,
        projectId,
      });
      const inheritedSubCategories = await listSubCategoriesServer({
        context,
        projectId,
      });
      const categoryId = inheritedCategories[0]!.id;
      const subCategoryId = inheritedSubCategories[0]!.id;

      await updateCategoryServer({
        context,
        projectId,
        input: { id: categoryId, name: 'IT Local' },
      });
      await updateSubCategoryServer({
        context,
        projectId,
        input: { id: subCategoryId, name: 'Software Local' },
      });

      await updateCategoryServer({
        context,
        projectId,
        input: { id: categoryId, name: 'IT' },
      });
      await updateSubCategoryServer({
        context,
        projectId,
        input: { id: subCategoryId, name: 'Software and Services' },
      });

      const revertedCategories = await listCategoriesServer({
        context,
        projectId,
      });
      const revertedSubCategories = await listSubCategoriesServer({
        context,
        projectId,
      });
      assert.equal(revertedCategories[0]?.syncStatus, 'inherited');
      assert.equal(revertedSubCategories[0]?.syncStatus, 'inherited');

      const promotionResult =
        await promoteProjectSubCategoryToCompanyDefaultServer({
          context,
          projectId,
          input: { subCategoryId },
        });
      assert.equal(promotionResult.categoryCreated, false);
      assert.equal(promotionResult.subCategoryCreated, false);

      const companyDefaultCategoryCount = await db
        .selectFrom('company_default_categories')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('company_id', '=', companyId)
        .executeTakeFirstOrThrow();
      const companyDefaultSubCategoryCount = await db
        .selectFrom('company_default_sub_categories')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('company_id', '=', companyId)
        .executeTakeFirstOrThrow();
      assert.equal(Number(companyDefaultCategoryCount.count), 1);
      assert.equal(Number(companyDefaultSubCategoryCount.count), 1);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'synced project import rules inherit provenance, support project overrides, and detach when company rules are removed',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_impr_sync_co_1');
    const userId = asUserId('itest_impr_sync_usr_1');
    const projectId = asProjectId('itest_impr_sync_prj_1');
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Import Rule Sync Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'impr-sync@example.com',
          name: 'Import Rule Sync User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'admin' })
        .execute();

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'Import Rule Sync Project',
        },
      });

      const createdCompanyRule = await createImportRuleServer({
        context,
        companyId,
        input: {
          companyId,
          scope: 'company',
          name: 'Exclude Internal Recharge',
          action: 'exclude',
          field: 'journalLineDescription',
          operator: 'contains',
          value: 'internal recharge',
          sortOrder: 90,
          enabled: true,
        },
      });

      const inheritedProjectRules = await listProjectImportRulesServer({
        context,
        projectId,
      });
      const inheritedProjectRule = inheritedProjectRules.find(
        (rule) => rule.originCompanyItemId === createdCompanyRule.id
      );
      assert.ok(inheritedProjectRule);
      assert.equal(inheritedProjectRule?.originScope, 'company');
      assert.equal(inheritedProjectRule?.syncStatus, 'inherited');
      assert.equal(inheritedProjectRule?.value, 'internal recharge');

      await updateImportRuleServer({
        context,
        companyId,
        input: {
          id: createdCompanyRule.id,
          value: 'internal recharge updated',
        },
      });

      const updatedProjectRules = await listProjectImportRulesServer({
        context,
        projectId,
      });
      const updatedInheritedRule = updatedProjectRules.find(
        (rule) => rule.originCompanyItemId === createdCompanyRule.id
      );
      assert.equal(updatedInheritedRule?.value, 'internal recharge updated');
      assert.equal(updatedInheritedRule?.syncStatus, 'inherited');

      await updateProjectImportRuleServer({
        context,
        projectId,
        input: {
          id: updatedInheritedRule!.id,
          value: 'project-local recharge override',
        },
      });

      const overriddenProjectRules = await listProjectImportRulesServer({
        context,
        projectId,
      });
      const overriddenRule = overriddenProjectRules.find(
        (rule) => rule.id === updatedInheritedRule!.id
      );
      assert.equal(overriddenRule?.value, 'project-local recharge override');
      assert.equal(overriddenRule?.syncStatus, 'overridden');

      await updateImportRuleServer({
        context,
        companyId,
        input: {
          id: createdCompanyRule.id,
          value: 'canonical recharge final',
        },
      });

      const preservedOverrideRules = await listProjectImportRulesServer({
        context,
        projectId,
      });
      const preservedOverrideRule = preservedOverrideRules.find(
        (rule) => rule.id === updatedInheritedRule!.id
      );
      assert.equal(
        preservedOverrideRule?.value,
        'project-local recharge override'
      );
      assert.equal(preservedOverrideRule?.syncStatus, 'overridden');

      await deleteImportRuleServer({
        context,
        companyId,
        ruleId: createdCompanyRule.id,
      });

      const detachedProjectRules = await listProjectImportRulesServer({
        context,
        projectId,
      });
      const detachedRule = detachedProjectRules.find(
        (rule) => rule.id === updatedInheritedRule!.id
      );
      assert.equal(detachedRule?.originScope, 'company');
      assert.equal(detachedRule?.originCompanyItemId, createdCompanyRule.id);
      assert.equal(detachedRule?.syncStatus, 'detached');
      assert.equal(detachedRule?.value, 'project-local recharge override');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'project import preview gives project-local exclude rules precedence over inherited company review rules',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_import_preview_precedence_co_1');
    const userId = asUserId('itest_import_preview_precedence_usr_1');
    const projectId = asProjectId('itest_import_preview_precedence_prj_1');
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Import Preview Precedence Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'import-preview-precedence@example.com',
          name: 'Import Preview Precedence User',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'admin' })
        .execute();

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'Import Preview Precedence Project',
        },
      });

      await createImportRuleServer({
        context,
        companyId,
        input: {
          companyId,
          scope: 'company',
          name: 'Review suspected salary transfer descriptions',
          action: 'review',
          field: 'journalLineDescription',
          operator: 'contains_any',
          value: 'sal,salary,salaries,payroll,wage,wages,suspense,trf',
          sortOrder: 60,
          enabled: true,
        },
      });

      await createProjectImportRuleServer({
        context,
        projectId,
        input: {
          companyId,
          projectId,
          scope: 'project',
          name: 'Exclude T02 source rows',
          action: 'exclude',
          field: 'source',
          operator: 'equals',
          value: 'T02',
          sortOrder: 10,
          enabled: true,
        },
      });

      const preview = await previewImportTransactionsServer({
        context,
        projectId,
        csvText: [
          'Ledger,Expenditure Actuals,Journal Line Description,Journal ID,Journal Date,Journal Line,Journal Line Ref,Source,Vendor Name,CC and Description',
          'Actuals,9338.26,15/12 Casuals General Sal,0000400200,2023-03-02,81,1156827,T02,15/12 Casuals General Sal,4103 (Casuals General Salary)',
        ].join('\n'),
        sourceType: 'powerbi_expenditure_actuals',
        fileName: 'precedence.csv',
        autoCreateStructures: true,
      });

      assert.equal(preview.rows.length, 1);
      assert.equal(preview.rows[0]?.importAction, 'exclude');
      assert.equal(preview.rows[0]?.importRuleName, 'Exclude T02 source rows');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

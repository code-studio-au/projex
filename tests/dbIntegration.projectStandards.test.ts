import assert from 'node:assert/strict';
import test from 'node:test';

import type { ServerFnContextInput } from '../src/server/fns/runtime.ts';
import { createProjectServer } from '../src/server/fns/projects.ts';
import {
  applyCompanyStandardsServer,
  bulkRecodeProjectTransactionsServer,
  createCategoryServer,
  createCompanyDefaultCategoryServer,
  createCompanyDefaultMappingRuleServer,
  createCompanyDefaultSubCategoryServer,
  createSubCategoryServer,
  listCategoriesServer,
  listCompanyDefaultCategoriesServer,
  listSubCategoriesServer,
  promoteProjectSubCategoryToCompanyDefaultServer,
} from '../src/server/fns/taxonomy.ts';
import {
  createImportRuleServer,
  listProjectImportRulesServer,
} from '../src/server/fns/importRules.ts';
import { listProjectAutoCodingRulesServer } from '../src/server/fns/projectAutoCodingRules.ts';
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
  'project creation applies company standards by default and supports opting out',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_project_defaults_co_1');
    const userId = asUserId('itest_project_defaults_usr_1');
    const projectWithDefaultsId = asProjectId('itest_project_defaults_prj_1');
    const projectWithoutDefaultsId = asProjectId(
      'itest_project_defaults_prj_2'
    );
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_project_defaults_dcat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_project_defaults_dsub_1'
    );
    const laterDefaultCategoryId = asCompanyDefaultCategoryId(
      'itest_project_defaults_dcat_2'
    );
    const laterDefaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_project_defaults_dsub_2'
    );
    const context = { session: { userId } } satisfies ServerFnContextInput;
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Project Defaults Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();

      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'project-defaults@example.com',
          name: 'Project Defaults User',
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

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectWithDefaultsId,
          name: 'Defaulted Project',
        },
      });
      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectWithoutDefaultsId,
          name: 'Custom Project',
          applyCompanyStandards: false,
        },
      });

      await createCompanyDefaultCategoryServer({
        context,
        companyId,
        input: {
          id: laterDefaultCategoryId,
          companyId,
          name: 'IT',
        },
      });
      await createCompanyDefaultSubCategoryServer({
        context,
        companyId,
        input: {
          id: laterDefaultSubCategoryId,
          companyId,
          companyDefaultCategoryId: laterDefaultCategoryId,
          name: 'Software and Services',
        },
      });

      const withDefaultsCategories = await db
        .selectFrom('categories')
        .select(['name'])
        .where('project_id', '=', projectWithDefaultsId)
        .execute();
      const withDefaultsSubCategories = await db
        .selectFrom('sub_categories')
        .select(['name'])
        .where('project_id', '=', projectWithDefaultsId)
        .execute();
      const withoutDefaultsCategories = await db
        .selectFrom('categories')
        .select(['name'])
        .where('project_id', '=', projectWithoutDefaultsId)
        .execute();
      const withoutDefaultsSubCategories = await db
        .selectFrom('sub_categories')
        .select(['name'])
        .where('project_id', '=', projectWithoutDefaultsId)
        .execute();

      assert.deepEqual(withDefaultsCategories.map((row) => row.name).sort(), [
        'IT',
        'Travel',
      ]);
      assert.deepEqual(
        withDefaultsSubCategories.map((row) => row.name).sort(),
        ['Flights', 'Software and Services']
      );
      const withDefaultsBudgetLines = await db
        .selectFrom('budget_lines')
        .select(['category_id', 'sub_category_id'])
        .where('project_id', '=', projectWithDefaultsId)
        .execute();
      assert.equal(withDefaultsBudgetLines.length, 2);
      assert.equal(withoutDefaultsCategories.length, 0);
      assert.equal(withoutDefaultsSubCategories.length, 0);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'bulk recode can align project transactions and project taxonomy can be promoted to company defaults',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_taxonomy_promote_co_1');
    const userId = asUserId('itest_taxonomy_promote_usr_1');
    const projectId = asProjectId('itest_taxonomy_promote_prj_1');
    const sourceCategoryId = asCategoryId('itest_taxonomy_promote_cat_1');
    const sourceSubCategoryId = asSubCategoryId('itest_taxonomy_promote_sub_1');
    const targetCategoryId = asCategoryId('itest_taxonomy_promote_cat_2');
    const targetSubCategoryId = asSubCategoryId('itest_taxonomy_promote_sub_2');
    const txnAId = asTxnId('itest_taxonomy_promote_txn_1');
    const txnBId = asTxnId('itest_taxonomy_promote_txn_2');
    const syncedProjectId = asProjectId('itest_taxonomy_promote_prj_2');
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Taxonomy Promote Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'taxonomy-promote@example.com',
          name: 'Taxonomy Promote User',
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
        .values([
          {
            id: projectId,
            company_id: companyId,
            name: 'Primary Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            sync_company_defaults: true,
            allow_txn_transfers: false,
          },
          {
            id: syncedProjectId,
            company_id: companyId,
            name: 'Synced Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            sync_company_defaults: true,
            allow_txn_transfers: false,
          },
        ])
        .execute();
      await db
        .insertInto('project_memberships')
        .values({ project_id: projectId, user_id: userId, role: 'lead' })
        .execute();

      await createCategoryServer({
        context: { session: { userId } },
        projectId,
        input: {
          id: sourceCategoryId,
          companyId,
          projectId,
          name: 'Telephone',
        },
      });
      await createCategoryServer({
        context: { session: { userId } },
        projectId,
        input: { id: targetCategoryId, companyId, projectId, name: 'IT' },
      });
      await createSubCategoryServer({
        context: { session: { userId } },
        projectId,
        input: {
          id: sourceSubCategoryId,
          companyId,
          projectId,
          categoryId: sourceCategoryId,
          name: 'Skype',
        },
      });
      await createSubCategoryServer({
        context: { session: { userId } },
        projectId,
        input: {
          id: targetSubCategoryId,
          companyId,
          projectId,
          categoryId: targetCategoryId,
          name: 'VoIP',
        },
      });

      await db
        .insertInto('txns')
        .values(
          [txnAId, txnBId].map((txnId, index) => ({
            public_id: txnId,
            external_id: `itest-taxonomy-promote-ext-${index + 1}`,
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-15',
            item: 'Comms Platform',
            description: `Legacy coding row ${index + 1}`,
            amount_cents: 1500 + index * 100,
            txn_type: 'standard' as const,
            parent_public_id: null,
            source_public_id: null,
            transfer_project_id: null,
            budget_impact: true,
            categorisable: true,
            import_batch_id: null,
            import_source_type: null,
            import_source_meta: null,
            category_id: sourceCategoryId,
            sub_category_id: sourceSubCategoryId,
            company_default_mapping_rule_id: null,
            coding_source: 'manual' as const,
            coding_pending_approval: false,
            reviewed_at: null,
            reviewed_by_user_id: null,
            locked_at: null,
            locked_by_user_id: null,
            created_at: now,
            updated_at: now,
          }))
        )
        .execute();

      const recodeResult = await bulkRecodeProjectTransactionsServer({
        context: { session: { userId } },
        projectId,
        input: {
          fromSubCategoryId: sourceSubCategoryId,
          toCategoryId: targetCategoryId,
          toSubCategoryId: targetSubCategoryId,
        },
      });
      assert.equal(recodeResult.updatedCount, 2);

      const promoted = await promoteProjectSubCategoryToCompanyDefaultServer({
        context: { session: { userId } },
        projectId,
        input: { subCategoryId: targetSubCategoryId },
      });
      assert.equal(promoted.categoryCreated, true);
      assert.equal(promoted.subCategoryCreated, true);

      const syncedDefaults = await listCompanyDefaultCategoriesServer({
        context: { session: { userId } },
        companyId,
      });
      assert.ok(
        syncedDefaults.some(
          (category) => category.id === promoted.companyDefaultCategoryId
        )
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'reapplying company standards manually syncs taxonomy, import rules, and auto-coding into an existing project',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_reapply_standards_co_1');
    const userId = asUserId('itest_reapply_standards_usr_1');
    const projectId = asProjectId('itest_reapply_standards_prj_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_reapply_standards_dcat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_reapply_standards_dsub_1'
    );
    const defaultRuleId = asCompanyDefaultMappingRuleId(
      'itest_reapply_standards_rule_1'
    );
    const context = { session: { userId } } satisfies ServerFnContextInput;

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Reapply Standards Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'reapply-standards@example.com',
          name: 'Reapply Standards User',
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
          name: 'Reapply Standards Project',
          applyCompanyStandards: false,
        },
      });

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
      await createImportRuleServer({
        context,
        companyId,
        input: {
          companyId,
          scope: 'company',
          name: 'Exclude test source',
          action: 'exclude',
          field: 'source',
          operator: 'equals',
          value: 'T99',
          sortOrder: 10,
          enabled: true,
        },
      });

      const result = await applyCompanyStandardsServer({
        context,
        projectId,
      });
      assert.equal(result.companyDefaultsConfigured, true);
      assert.equal(result.categoriesAdded, 1);
      assert.equal(result.subCategoriesAdded, 1);
      assert.equal(result.importRulesSynced, true);
      assert.equal(result.autoCodingRulesSynced, true);

      const categories = await listCategoriesServer({ context, projectId });
      const subCategories = await listSubCategoriesServer({
        context,
        projectId,
      });
      const projectImportRules = await listProjectImportRulesServer({
        context,
        projectId,
      });
      const projectAutoCodingRules = await listProjectAutoCodingRulesServer({
        context,
        projectId,
      });

      assert.equal(categories.length, 1);
      assert.equal(subCategories.length, 1);
      assert.equal(projectImportRules.length, 1);
      assert.equal(projectAutoCodingRules.length, 1);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

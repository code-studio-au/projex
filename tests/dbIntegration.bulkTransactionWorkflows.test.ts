import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectAutoCodingRuleServer, backfillProjectCodingServer, promoteProjectRuleToCompanyDefaultServer } from '../src/server/fns/projectAutoCodingRules.ts';
import { bulkTxnActionServer } from '../src/server/fns/transactions.ts';
import {
  asCategoryId,
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
  'project rule backfill can auto-code uncoded rows and promote a project rule to company defaults',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_prule_backfill_co_1');
    const userId = asUserId('itest_prule_backfill_usr_1');
    const projectId = asProjectId('itest_prule_backfill_prj_1');
    const categoryId = asCategoryId('itest_prule_backfill_cat_1');
    const subCategoryId = asSubCategoryId('itest_prule_backfill_sub_1');
    const uncodedTxnId = asTxnId('itest_prule_backfill_txn_1');
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Project Rule Backfill Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'prule-backfill@example.com',
          name: 'Project Rule Backfill User',
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
          name: 'Project Rule Backfill Project',
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
        })
        .execute();
      await db
        .insertInto('project_memberships')
        .values({ project_id: projectId, user_id: userId, role: 'lead' })
        .execute();
      await db
        .insertInto('categories')
        .values({
          id: categoryId,
          company_id: companyId,
          project_id: projectId,
          name: 'IT',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('sub_categories')
        .values({
          id: subCategoryId,
          company_id: companyId,
          project_id: projectId,
          category_id: categoryId,
          name: 'Software and Services',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txns')
        .values({
          public_id: uncodedTxnId,
          external_id: 'itest-prule-backfill-ext-1',
          company_id: companyId,
          project_id: projectId,
          txn_date: '2026-06-15',
          item: 'Microsoft 365 Subscription',
          description: 'Monthly M365 charge',
          amount_cents: 2499,
          txn_type: 'standard',
          parent_public_id: null,
          source_public_id: null,
          transfer_project_id: null,
          budget_impact: true,
          categorisable: true,
          import_batch_id: null,
          import_source_type: null,
          import_source_meta: null,
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          reviewed_at: null,
          reviewed_by_user_id: null,
          locked_at: null,
          locked_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const createdRule = await createProjectAutoCodingRuleServer({
        context: { session: { userId } },
        projectId,
        input: {
          matchText: 'microsoft 365',
          categoryId,
          subCategoryId,
        },
      });

      await db
        .updateTable('txns')
        .set({
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          updated_at: new Date().toISOString(),
        })
        .where('project_id', '=', projectId)
        .where('public_id', '=', uncodedTxnId)
        .execute();

      const backfillResult = await backfillProjectCodingServer({
        context: { session: { userId } },
        projectId,
        input: { mode: 'project_rules' },
      });
      assert.equal(backfillResult.updatedCount, 1);
      assert.equal(backfillResult.projectRuleMatches, 1);
      assert.equal(backfillResult.companyRuleMatches, 0);

      const backfilledTxn = await db
        .selectFrom('txns')
        .select([
          'category_id',
          'sub_category_id',
          'company_default_mapping_rule_id',
          'coding_source',
          'coding_pending_approval',
        ])
        .where('project_id', '=', projectId)
        .where('public_id', '=', uncodedTxnId)
        .executeTakeFirstOrThrow();
      assert.equal(backfilledTxn.category_id, categoryId);
      assert.equal(backfilledTxn.sub_category_id, subCategoryId);
      assert.equal(backfilledTxn.company_default_mapping_rule_id, null);
      assert.equal(backfilledTxn.coding_source, 'project_rule');
      assert.equal(backfilledTxn.coding_pending_approval, true);

      const promoted = await promoteProjectRuleToCompanyDefaultServer({
        context: { session: { userId } },
        projectId,
        input: { ruleId: createdRule.rule.id },
      });
      assert.equal(promoted.ruleCreated, true);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'bulk transaction actions handle mixed approval, recoding, workflow, and clear-coding states',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_bulk_txn_actions_co_1');
    const userId = asUserId('itest_bulk_txn_actions_usr_1');
    const projectId = asProjectId('itest_bulk_txn_actions_prj_1');
    const sourceCategoryId = asCategoryId('itest_bulk_txn_actions_cat_1');
    const sourceSubCategoryId = asSubCategoryId('itest_bulk_txn_actions_sub_1');
    const targetCategoryId = asCategoryId('itest_bulk_txn_actions_cat_2');
    const targetSubCategoryId = asSubCategoryId('itest_bulk_txn_actions_sub_2');
    const pendingTxnId = asTxnId('itest_bulk_txn_actions_txn_1');
    const lockedTxnId = asTxnId('itest_bulk_txn_actions_txn_2');
    const uncodedTxnId = asTxnId('itest_bulk_txn_actions_txn_3');
    const sourceOnlyTxnId = asTxnId('itest_bulk_txn_actions_txn_4');
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Bulk Txn Actions Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'bulk-txn-actions@example.com',
          name: 'Bulk Txn Actions User',
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
          name: 'Bulk Txn Project',
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
        })
        .execute();
      await db
        .insertInto('project_memberships')
        .values({ project_id: projectId, user_id: userId, role: 'lead' })
        .execute();
      await db
        .insertInto('categories')
        .values([
          {
            id: sourceCategoryId,
            company_id: companyId,
            project_id: projectId,
            name: 'Telephone',
            created_at: now,
            updated_at: now,
          },
          {
            id: targetCategoryId,
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
            id: sourceSubCategoryId,
            company_id: companyId,
            project_id: projectId,
            category_id: sourceCategoryId,
            name: 'Phones',
            created_at: now,
            updated_at: now,
          },
          {
            id: targetSubCategoryId,
            company_id: companyId,
            project_id: projectId,
            category_id: targetCategoryId,
            name: 'VoIP',
            created_at: now,
            updated_at: now,
          },
        ])
        .execute();
      await db
        .insertInto('txns')
        .values([
          {
            public_id: pendingTxnId,
            external_id: 'itest-bulk-txn-actions-ext-1',
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-20',
            item: 'Pending Coding',
            description: 'Pending coding approval',
            amount_cents: 1500,
            txn_type: 'standard',
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
            coding_source: 'project_rule',
            coding_pending_approval: true,
            reviewed_at: null,
            reviewed_by_user_id: null,
            locked_at: null,
            locked_by_user_id: null,
            created_at: now,
            updated_at: now,
          },
          {
            public_id: lockedTxnId,
            external_id: 'itest-bulk-txn-actions-ext-2',
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-20',
            item: 'Locked Coding',
            description: 'Locked and pending',
            amount_cents: 1600,
            txn_type: 'standard',
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
            coding_source: 'project_rule',
            coding_pending_approval: true,
            reviewed_at: now,
            reviewed_by_user_id: userId,
            locked_at: now,
            locked_by_user_id: userId,
            created_at: now,
            updated_at: now,
          },
          {
            public_id: uncodedTxnId,
            external_id: 'itest-bulk-txn-actions-ext-3',
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-20',
            item: 'Needs Coding',
            description: 'Uncoded row',
            amount_cents: 1700,
            txn_type: 'standard',
            parent_public_id: null,
            source_public_id: null,
            transfer_project_id: null,
            budget_impact: true,
            categorisable: true,
            import_batch_id: null,
            import_source_type: null,
            import_source_meta: null,
            category_id: null,
            sub_category_id: null,
            company_default_mapping_rule_id: null,
            coding_source: 'manual',
            coding_pending_approval: false,
            reviewed_at: null,
            reviewed_by_user_id: null,
            locked_at: null,
            locked_by_user_id: null,
            created_at: now,
            updated_at: now,
          },
          {
            public_id: sourceOnlyTxnId,
            external_id: 'itest-bulk-txn-actions-ext-4',
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-20',
            item: 'Source Only',
            description: 'Source-only row',
            amount_cents: 1800,
            txn_type: 'standard',
            parent_public_id: null,
            source_public_id: null,
            transfer_project_id: null,
            budget_impact: false,
            categorisable: false,
            import_batch_id: null,
            import_source_type: null,
            import_source_meta: null,
            category_id: null,
            sub_category_id: null,
            company_default_mapping_rule_id: null,
            coding_source: null,
            coding_pending_approval: false,
            reviewed_at: null,
            reviewed_by_user_id: null,
            locked_at: null,
            locked_by_user_id: null,
            created_at: now,
            updated_at: now,
          },
        ])
        .execute();

      const approveResult = await bulkTxnActionServer({
        context: { session: { userId } },
        projectId,
        input: {
          action: 'approveAutoMappings',
          txnIds: [pendingTxnId, lockedTxnId, sourceOnlyTxnId],
        },
      });
      assert.equal(approveResult.updatedCount, 1);

      const recodeResult = await bulkTxnActionServer({
        context: { session: { userId } },
        projectId,
        input: {
          action: 'recode',
          txnIds: [pendingTxnId, lockedTxnId, uncodedTxnId, sourceOnlyTxnId],
          categoryId: targetCategoryId,
          subCategoryId: targetSubCategoryId,
        },
      });
      assert.equal(recodeResult.updatedCount, 2);

      const lockResult = await bulkTxnActionServer({
        context: { session: { userId } },
        projectId,
        input: {
          action: 'setLocked',
          txnIds: [pendingTxnId, uncodedTxnId],
          locked: true,
        },
      });
      assert.equal(lockResult.updatedCount, 2);

      const unreviewResult = await bulkTxnActionServer({
        context: { session: { userId } },
        projectId,
        input: {
          action: 'setReviewed',
          txnIds: [pendingTxnId, uncodedTxnId],
          reviewed: false,
        },
      });
      assert.equal(unreviewResult.updatedCount, 2);

      const clearCodingResult = await bulkTxnActionServer({
        context: { session: { userId } },
        projectId,
        input: {
          action: 'clearCoding',
          txnIds: [pendingTxnId, lockedTxnId, sourceOnlyTxnId],
        },
      });
      assert.equal(clearCodingResult.updatedCount, 1);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

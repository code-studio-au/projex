import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acceptRuleSuggestionServer,
  dismissRuleSuggestionServer,
  listRuleSuggestionsServer,
} from '../src/server/fns/ruleSuggestions.ts';
import { listProjectAutoCodingRulesServer } from '../src/server/fns/projectAutoCodingRules.ts';
import { createProjectServer } from '../src/server/fns/projects.ts';
import {
  listCategoriesServer,
  listSubCategoriesServer,
} from '../src/server/fns/taxonomy.ts';
import { updateTxnServer } from '../src/server/fns/transactions.ts';
import {
  asCategoryId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asProjectId,
  asRuleSuggestionId,
  asSubCategoryId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';
import {
  createIntegrationDb,
  integrationDatabaseUrl,
} from './dbIntegration.helpers.ts';

test(
  'manual coding records company rule suggestion signals and aggregates repeated patterns',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_rulesuggest_co_1');
    const userId = asUserId('itest_rulesuggest_usr_1');
    const projectId = asProjectId('itest_rulesuggest_prj_1');
    const secondProjectId = asProjectId('itest_rulesuggest_prj_1b');
    const categoryId = asCategoryId('itest_rulesuggest_cat_1');
    const subCategoryId = asSubCategoryId('itest_rulesuggest_sub_1');
    const secondCategoryId = asCategoryId('itest_rulesuggest_cat_1b');
    const secondSubCategoryId = asSubCategoryId('itest_rulesuggest_sub_1b');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_rulesuggest_defcat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_rulesuggest_defsub_1'
    );
    const txnIds = [
      asTxnId('itest_rulesuggest_txn_1'),
      asTxnId('itest_rulesuggest_txn_2'),
      asTxnId('itest_rulesuggest_txn_3'),
    ];
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Rule Suggestion Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();

      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'rulesuggest@example.com',
          name: 'Rule Suggestion User',
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
            name: 'Rule Suggestion Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
            sync_company_defaults: true,
          },
          {
            id: secondProjectId,
            company_id: companyId,
            name: 'Second Rule Suggestion Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 0,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            allow_txn_transfers: false,
            sync_company_defaults: true,
          },
        ])
        .execute();

      await db
        .insertInto('project_memberships')
        .values([
          { project_id: projectId, user_id: userId, role: 'member' },
          { project_id: secondProjectId, user_id: userId, role: 'member' },
        ])
        .execute();

      await db
        .insertInto('categories')
        .values([
          {
            id: categoryId,
            company_id: companyId,
            project_id: projectId,
            name: 'Travel',
            created_at: now,
            updated_at: now,
          },
          {
            id: secondCategoryId,
            company_id: companyId,
            project_id: secondProjectId,
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
            id: subCategoryId,
            company_id: companyId,
            project_id: projectId,
            category_id: categoryId,
            name: 'Flights',
            created_at: now,
            updated_at: now,
          },
          {
            id: secondSubCategoryId,
            company_id: companyId,
            project_id: secondProjectId,
            category_id: secondCategoryId,
            name: 'Flights',
            created_at: now,
            updated_at: now,
          },
        ])
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

      await db
        .insertInto('txns')
        .values(
          txnIds.map((txnId, index) => ({
            public_id: txnId,
            external_id: `rule-suggest-ext-${index + 1}`,
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-01',
            item: 'Qantas Airways',
            description: `Flight charge ${index + 1}`,
            amount_cents: 1000 + index * 100,
            txn_type: 'standard' as const,
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
          }))
        )
        .execute();

      await Promise.all(
        txnIds.map((txnId) =>
          updateTxnServer({
            context: { session: { userId } },
            projectId,
            input: {
              id: txnId,
              categoryId,
              subCategoryId,
              companyDefaultMappingRuleId: null,
              codingSource: 'manual',
              codingPendingApproval: false,
            },
          })
        )
      );

      await db
        .insertInto('txns')
        .values({
          public_id: txnIds[0],
          external_id: 'rule-suggest-second-project-ext',
          company_id: companyId,
          project_id: secondProjectId,
          txn_date: '2026-06-02',
          item: 'Qantas Airways',
          description: 'Same public ID in another project',
          amount_cents: 1400,
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

      await updateTxnServer({
        context: { session: { userId } },
        projectId: secondProjectId,
        input: {
          id: txnIds[0],
          categoryId: secondCategoryId,
          subCategoryId: secondSubCategoryId,
          companyDefaultMappingRuleId: null,
          codingSource: 'manual',
          codingPendingApproval: false,
        },
      });

      await db
        .deleteFrom('sub_categories')
        .where('project_id', '=', secondProjectId)
        .where('id', '=', secondSubCategoryId)
        .executeTakeFirstOrThrow();

      const signals = await db
        .selectFrom('rule_suggestion_signals')
        .select([
          'txn_public_id',
          'pattern_text_normalized',
          'company_default_sub_category_id',
        ])
        .where('company_id', '=', companyId)
        .execute();
      assert.equal(signals.length, 4);
      assert.ok(
        signals.every(
          (row) =>
            row.pattern_text_normalized === 'qantas airways' &&
            row.company_default_sub_category_id === defaultSubCategoryId
        )
      );

      const suggestions = await db
        .selectFrom('rule_suggestions')
        .select([
          'status',
          'proposed_match_text',
          'sample_count',
          'distinct_project_count',
          'company_default_sub_category_id',
        ])
        .where('company_id', '=', companyId)
        .execute();
      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0]?.status, 'open');
      assert.equal(suggestions[0]?.proposed_match_text, 'Qantas Airways');
      assert.equal(suggestions[0]?.sample_count, 4);
      assert.equal(suggestions[0]?.distinct_project_count, 2);
      assert.equal(
        suggestions[0]?.company_default_sub_category_id,
        defaultSubCategoryId
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'manual rule suggestion signals dedupe per transaction and move when recoded to a new target',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_rulesuggest_co_2');
    const userId = asUserId('itest_rulesuggest_usr_2');
    const projectId = asProjectId('itest_rulesuggest_prj_2');
    const travelCategoryId = asCategoryId('itest_rulesuggest_cat_2a');
    const flightsSubCategoryId = asSubCategoryId('itest_rulesuggest_sub_2a');
    const hotelsSubCategoryId = asSubCategoryId('itest_rulesuggest_sub_2b');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_rulesuggest_defcat_2'
    );
    const defaultFlightsSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_rulesuggest_defsub_2a'
    );
    const defaultHotelsSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_rulesuggest_defsub_2b'
    );
    const txnId = asTxnId('itest_rulesuggest_txn_4');
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Rule Suggestion Co 2',
          status: 'active',
          deactivated_at: null,
        })
        .execute();

      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'rulesuggest2@example.com',
          name: 'Rule Suggestion User 2',
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
          name: 'Rule Suggestion Project 2',
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
        .values({
          id: travelCategoryId,
          company_id: companyId,
          project_id: projectId,
          name: 'Travel',
          created_at: now,
          updated_at: now,
        })
        .execute();

      await db
        .insertInto('sub_categories')
        .values([
          {
            id: flightsSubCategoryId,
            company_id: companyId,
            project_id: projectId,
            category_id: travelCategoryId,
            name: 'Flights',
            created_at: now,
            updated_at: now,
          },
          {
            id: hotelsSubCategoryId,
            company_id: companyId,
            project_id: projectId,
            category_id: travelCategoryId,
            name: 'Hotels',
            created_at: now,
            updated_at: now,
          },
        ])
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
        .values([
          {
            id: defaultFlightsSubCategoryId,
            company_id: companyId,
            company_default_category_id: defaultCategoryId,
            name: 'Flights',
            created_at: now,
            updated_at: now,
          },
          {
            id: defaultHotelsSubCategoryId,
            company_id: companyId,
            company_default_category_id: defaultCategoryId,
            name: 'Hotels',
            created_at: now,
            updated_at: now,
          },
        ])
        .execute();

      await db
        .insertInto('txns')
        .values({
          public_id: txnId,
          external_id: 'rule-suggest-ext-4',
          company_id: companyId,
          project_id: projectId,
          txn_date: '2026-06-02',
          item: 'Jetstar',
          description: 'Domestic travel charge',
          amount_cents: 1450,
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

      await updateTxnServer({
        context: { session: { userId } },
        projectId,
        input: {
          id: txnId,
          categoryId: travelCategoryId,
          subCategoryId: flightsSubCategoryId,
          companyDefaultMappingRuleId: null,
          codingSource: 'manual',
          codingPendingApproval: false,
        },
      });

      await updateTxnServer({
        context: { session: { userId } },
        projectId,
        input: {
          id: txnId,
          categoryId: travelCategoryId,
          subCategoryId: hotelsSubCategoryId,
          companyDefaultMappingRuleId: null,
          codingSource: 'manual',
          codingPendingApproval: false,
        },
      });

      const signals = await db
        .selectFrom('rule_suggestion_signals')
        .select([
          'txn_public_id',
          'project_id',
          'company_default_sub_category_id',
        ])
        .where('company_id', '=', companyId)
        .execute();
      assert.equal(signals.length, 1);
      assert.equal(signals[0]?.txn_public_id, txnId);
      assert.equal(signals[0]?.project_id, projectId);
      assert.equal(
        signals[0]?.company_default_sub_category_id,
        defaultHotelsSubCategoryId
      );

      const suggestions = await db
        .selectFrom('rule_suggestions')
        .select(['company_default_sub_category_id', 'sample_count', 'status'])
        .where('company_id', '=', companyId)
        .orderBy('company_default_sub_category_id', 'asc')
        .execute();
      assert.equal(suggestions.length, 1);
      assert.equal(
        suggestions[0]?.company_default_sub_category_id,
        defaultHotelsSubCategoryId
      );
      assert.equal(suggestions[0]?.sample_count, 1);
      assert.equal(suggestions[0]?.status, 'open');
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'rule suggestion review queue lists thresholded items and can accept or dismiss them',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_rulesuggest_co_3');
    const userId = asUserId('itest_rulesuggest_usr_3');
    const projectId = asProjectId('itest_rulesuggest_prj_3');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_rulesuggest_defcat_3'
    );
    const defaultFlightsSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_rulesuggest_defsub_3a'
    );
    const defaultHotelsSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_rulesuggest_defsub_3b'
    );
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Rule Suggestion Co 3',
          status: 'active',
          deactivated_at: null,
        })
        .execute();

      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'rulesuggest3@example.com',
          name: 'Rule Suggestion User 3',
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
        .values([
          {
            id: defaultFlightsSubCategoryId,
            company_id: companyId,
            company_default_category_id: defaultCategoryId,
            name: 'Flights',
            created_at: now,
            updated_at: now,
          },
          {
            id: defaultHotelsSubCategoryId,
            company_id: companyId,
            company_default_category_id: defaultCategoryId,
            name: 'Hotels',
            created_at: now,
            updated_at: now,
          },
        ])
        .execute();

      const context = { session: { userId } };
      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'Rule Suggestion Project 3',
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
      const categoryId = inheritedCategories.find(
        (category) => category.name === 'Travel'
      )?.id;
      const flightsSubCategoryId = inheritedSubCategories.find(
        (subCategory) => subCategory.name === 'Flights'
      )?.id;
      const hotelsSubCategoryId = inheritedSubCategories.find(
        (subCategory) => subCategory.name === 'Hotels'
      )?.id;
      assert.ok(categoryId);
      assert.ok(flightsSubCategoryId);
      assert.ok(hotelsSubCategoryId);

      const readyTxnIds = [
        asTxnId('itest_rulesuggest_txn_5'),
        asTxnId('itest_rulesuggest_txn_6'),
        asTxnId('itest_rulesuggest_txn_7'),
      ];
      const hiddenTxnIds = [
        asTxnId('itest_rulesuggest_txn_8'),
        asTxnId('itest_rulesuggest_txn_9'),
      ];

      await db
        .insertInto('txns')
        .values(
          [...readyTxnIds, ...hiddenTxnIds].map((txnId, index) => ({
            public_id: txnId,
            external_id: `rule-suggest-ext-queue-${index + 1}`,
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-03',
            item: index < 3 ? 'Virgin Australia' : 'Accor Hotels',
            description: `Travel queue sample ${index + 1}`,
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
          }))
        )
        .execute();

      for (const txnId of readyTxnIds) {
        await updateTxnServer({
          context,
          projectId,
          input: {
            id: txnId,
            categoryId,
            subCategoryId: flightsSubCategoryId,
            companyDefaultMappingRuleId: null,
            codingSource: 'manual',
            codingPendingApproval: false,
          },
        });
      }

      for (const txnId of hiddenTxnIds) {
        await updateTxnServer({
          context,
          projectId,
          input: {
            id: txnId,
            categoryId,
            subCategoryId: hotelsSubCategoryId,
            companyDefaultMappingRuleId: null,
            codingSource: 'manual',
            codingPendingApproval: false,
          },
        });
      }

      const listedBefore = await listRuleSuggestionsServer({
        context,
        companyId,
      });
      assert.equal(listedBefore.length, 1);
      assert.equal(listedBefore[0]?.sampleCount, 3);
      assert.equal(listedBefore[0]?.proposedMatchText, 'Virgin Australia');
      assert.ok((listedBefore[0]?.evidence.length ?? 0) >= 1);

      const accepted = await acceptRuleSuggestionServer({
        context,
        companyId,
        input: {
          id: listedBefore[0]!.id,
          action: 'create_rule',
          proposedMatchText: 'virgin',
          companyDefaultSubCategoryId: defaultFlightsSubCategoryId,
        },
      });
      assert.ok(accepted.ruleId);

      const acceptedRule = await db
        .selectFrom('company_default_mapping_rules')
        .select(['id', 'match_text', 'company_default_sub_category_id'])
        .where('company_id', '=', companyId)
        .where('id', '=', accepted.ruleId)
        .executeTakeFirst();
      assert.equal(acceptedRule?.match_text, 'virgin');
      assert.equal(
        acceptedRule?.company_default_sub_category_id,
        defaultFlightsSubCategoryId
      );

      const syncedProjectRules = await listProjectAutoCodingRulesServer({
        context,
        projectId,
      });
      assert.equal(syncedProjectRules.length, 1);
      assert.equal(syncedProjectRules[0]?.matchText, 'virgin');
      assert.equal(syncedProjectRules[0]?.originScope, 'company');
      assert.equal(syncedProjectRules[0]?.originCompanyItemId, accepted.ruleId);
      assert.equal(syncedProjectRules[0]?.syncStatus, 'inherited');

      const listedAfterAccept = await listRuleSuggestionsServer({
        context,
        companyId,
      });
      assert.equal(listedAfterAccept.length, 0);

      const hotelSuggestion = await db
        .selectFrom('rule_suggestions')
        .select(['id'])
        .where('company_id', '=', companyId)
        .where(
          'company_default_sub_category_id',
          '=',
          defaultHotelsSubCategoryId
        )
        .executeTakeFirst();
      assert.ok(hotelSuggestion?.id);

      await db
        .updateTable('rule_suggestions')
        .set({
          sample_count: 3,
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', hotelSuggestion!.id)
        .execute();

      const listedForDismiss = await listRuleSuggestionsServer({
        context: { session: { userId } },
        companyId,
      });
      assert.equal(listedForDismiss.length, 1);

      await dismissRuleSuggestionServer({
        context: { session: { userId } },
        companyId,
        input: {
          id: hotelSuggestion!.id as ReturnType<typeof asRuleSuggestionId>,
          reason: 'one_off',
        },
      });

      const listedAfterDismiss = await listRuleSuggestionsServer({
        context: { session: { userId } },
        companyId,
      });
      assert.equal(listedAfterDismiss.length, 0);

      const dismissed = await db
        .selectFrom('rule_suggestions')
        .select(['dismissed_reason', 'dismissed_sample_count'])
        .where('id', '=', hotelSuggestion!.id)
        .executeTakeFirstOrThrow();
      assert.equal(dismissed.dismissed_reason, 'one_off');
      assert.equal(dismissed.dismissed_sample_count, 3);

      const cooldownTxnIds = [
        asTxnId('itest_rulesuggest_txn_10'),
        asTxnId('itest_rulesuggest_txn_11'),
        asTxnId('itest_rulesuggest_txn_12'),
        asTxnId('itest_rulesuggest_txn_13'),
      ];
      await db
        .insertInto('txns')
        .values(
          cooldownTxnIds.map((txnId, index) => ({
            public_id: txnId,
            external_id: `rule-suggest-cooldown-${index + 1}`,
            company_id: companyId,
            project_id: projectId,
            txn_date: `2026-06-${10 + index}`,
            item: 'Accor Hotels',
            description: `Cooldown sample ${index + 1}`,
            amount_cents: 2200 + index * 100,
            txn_type: 'standard' as const,
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
          }))
        )
        .execute();

      for (const txnId of cooldownTxnIds.slice(0, 3)) {
        await updateTxnServer({
          context,
          projectId,
          input: {
            id: txnId,
            categoryId,
            subCategoryId: hotelsSubCategoryId,
            companyDefaultMappingRuleId: null,
            codingSource: 'manual',
            codingPendingApproval: false,
          },
        });
      }

      const stillCoolingDown = await listRuleSuggestionsServer({
        context,
        companyId,
      });
      assert.equal(stillCoolingDown.length, 0);

      await updateTxnServer({
        context,
        projectId,
        input: {
          id: cooldownTxnIds[3]!,
          categoryId,
          subCategoryId: hotelsSubCategoryId,
          companyDefaultMappingRuleId: null,
          codingSource: 'manual',
          codingPendingApproval: false,
        },
      });

      const reopenedAfterMoreEvidence = await listRuleSuggestionsServer({
        context,
        companyId,
      });
      assert.equal(reopenedAfterMoreEvidence.length, 1);
      assert.equal(reopenedAfterMoreEvidence[0]?.sampleCount, 6);
      assert.equal(reopenedAfterMoreEvidence[0]?.dismissedReason, undefined);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

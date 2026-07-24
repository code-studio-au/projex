import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acceptRuleSuggestionServer,
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
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asCompanyId,
  asProjectId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';
import {
  createIntegrationDb,
  integrationDatabaseUrl,
} from './dbIntegration.helpers.ts';

test(
  'repeated company-rule overrides can create a narrower rule or update the source rule',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_rulesuggest_refine_co_1');
    const userId = asUserId('itest_rulesuggest_refine_usr_1');
    const projectId = asProjectId('itest_rulesuggest_refine_prj_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_rulesuggest_refine_defcat_1'
    );
    const flightsDefaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_rulesuggest_refine_defsub_1a'
    );
    const hotelsDefaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_rulesuggest_refine_defsub_1b'
    );
    const sourceRuleId = asCompanyDefaultMappingRuleId(
      'itest_rulesuggest_refine_rule_1'
    );
    const context = { session: { userId } };
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Rule Suggestion Refinement Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'rulesuggest-refinement@example.com',
          name: 'Rule Suggestion Refinement User',
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
            id: flightsDefaultSubCategoryId,
            company_id: companyId,
            company_default_category_id: defaultCategoryId,
            name: 'Flights',
            created_at: now,
            updated_at: now,
          },
          {
            id: hotelsDefaultSubCategoryId,
            company_id: companyId,
            company_default_category_id: defaultCategoryId,
            name: 'Hotels',
            created_at: now,
            updated_at: now,
          },
        ])
        .execute();
      await db
        .insertInto('company_default_mapping_rules')
        .values({
          id: sourceRuleId,
          company_id: companyId,
          match_text: 'Acme',
          company_default_category_id: defaultCategoryId,
          company_default_sub_category_id: flightsDefaultSubCategoryId,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        })
        .execute();

      await createProjectServer({
        context,
        companyId,
        input: {
          id: projectId,
          name: 'Rule Suggestion Refinement Project',
        },
      });

      const categories = await listCategoriesServer({ context, projectId });
      const subCategories = await listSubCategoriesServer({
        context,
        projectId,
      });
      const travelCategoryId = categories.find(
        (category) => category.name === 'Travel'
      )?.id;
      const flightsSubCategoryId = subCategories.find(
        (subCategory) => subCategory.name === 'Flights'
      )?.id;
      const hotelsSubCategoryId = subCategories.find(
        (subCategory) => subCategory.name === 'Hotels'
      )?.id;
      assert.ok(travelCategoryId);
      assert.ok(flightsSubCategoryId);
      assert.ok(hotelsSubCategoryId);

      const narrowerTxnIds = [
        asTxnId('itest_rulesuggest_refine_txn_1'),
        asTxnId('itest_rulesuggest_refine_txn_2'),
        asTxnId('itest_rulesuggest_refine_txn_3'),
      ];
      await db
        .insertInto('txns')
        .values(
          narrowerTxnIds.map((txnId, index) => ({
            public_id: txnId,
            external_id: `rule-suggest-refine-${index + 1}`,
            company_id: companyId,
            project_id: projectId,
            txn_date: `2026-06-0${index + 1}`,
            item: `Acme Consulting invoice INV-${1000 + index}`,
            description: 'Professional services correction',
            amount_cents: 2000 + index * 100,
            txn_type: 'standard' as const,
            parent_public_id: null,
            source_public_id: null,
            transfer_project_id: null,
            budget_impact: true,
            categorisable: true,
            import_batch_id: null,
            import_source_type: null,
            import_source_meta: null,
            category_id: travelCategoryId,
            sub_category_id: flightsSubCategoryId,
            company_default_mapping_rule_id: sourceRuleId,
            coding_source: 'company_default_rule' as const,
            coding_pending_approval: true,
            reviewed_at: null,
            reviewed_by_user_id: null,
            locked_at: null,
            locked_by_user_id: null,
            created_at: now,
            updated_at: now,
          }))
        )
        .execute();

      for (const txnId of narrowerTxnIds) {
        await updateTxnServer({
          context,
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
      }

      const narrowerSuggestions = await listRuleSuggestionsServer({
        context,
        companyId,
      });
      assert.equal(narrowerSuggestions.length, 1);
      const narrowerSuggestion = narrowerSuggestions[0]!;
      assert.equal(narrowerSuggestion.suggestionType, 'update_rule');
      assert.equal(narrowerSuggestion.sourceRuleId, sourceRuleId);
      assert.equal(narrowerSuggestion.sourceRule?.matchText, 'Acme');
      assert.equal(narrowerSuggestion.recommendedAction, 'create_narrower');
      assert.equal(narrowerSuggestion.confidence, 'high');
      assert.equal(narrowerSuggestion.confidenceScore, 80);
      assert.equal(narrowerSuggestion.distinctTxnDateCount, 3);
      assert.equal(
        narrowerSuggestion.evidence[0]?.projectName,
        'Rule Suggestion Refinement Project'
      );
      assert.equal(narrowerSuggestion.evidence[0]?.currency, 'AUD');
      assert.equal(
        narrowerSuggestion.proposedMatchText,
        'acme consulting invoice'
      );

      const narrowerAccepted = await acceptRuleSuggestionServer({
        context,
        companyId,
        input: {
          id: narrowerSuggestion.id,
          action: 'create_narrower',
          proposedMatchText: 'acme consulting',
          companyDefaultSubCategoryId: hotelsDefaultSubCategoryId,
        },
      });
      assert.notEqual(narrowerAccepted.ruleId, sourceRuleId);

      const reorderedRules = await db
        .selectFrom('company_default_mapping_rules')
        .select([
          'id',
          'match_text',
          'company_default_sub_category_id',
          'sort_order',
        ])
        .where('company_id', '=', companyId)
        .orderBy('sort_order', 'asc')
        .execute();
      assert.deepEqual(
        reorderedRules.map((rule) => ({
          id: rule.id,
          matchText: rule.match_text,
          target: rule.company_default_sub_category_id,
          sortOrder: rule.sort_order,
        })),
        [
          {
            id: narrowerAccepted.ruleId,
            matchText: 'acme consulting',
            target: hotelsDefaultSubCategoryId,
            sortOrder: 0,
          },
          {
            id: sourceRuleId,
            matchText: 'Acme',
            target: flightsDefaultSubCategoryId,
            sortOrder: 1,
          },
        ]
      );

      const remainingSignals = await db
        .selectFrom('rule_suggestion_signals')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('company_id', '=', companyId)
        .executeTakeFirstOrThrow();
      assert.equal(Number(remainingSignals.count), 0);

      const updateTxnIds = [
        asTxnId('itest_rulesuggest_refine_txn_4'),
        asTxnId('itest_rulesuggest_refine_txn_5'),
        asTxnId('itest_rulesuggest_refine_txn_6'),
      ];
      await db
        .insertInto('txns')
        .values(
          updateTxnIds.map((txnId, index) => ({
            public_id: txnId,
            external_id: `rule-suggest-update-${index + 1}`,
            company_id: companyId,
            project_id: projectId,
            txn_date: `2026-07-0${index + 1}`,
            item: 'Acme',
            description: `General Acme charge ${index + 1}`,
            amount_cents: 3000 + index * 100,
            txn_type: 'standard' as const,
            parent_public_id: null,
            source_public_id: null,
            transfer_project_id: null,
            budget_impact: true,
            categorisable: true,
            import_batch_id: null,
            import_source_type: null,
            import_source_meta: null,
            category_id: travelCategoryId,
            sub_category_id: flightsSubCategoryId,
            company_default_mapping_rule_id: sourceRuleId,
            coding_source: 'company_default_rule' as const,
            coding_pending_approval: true,
            reviewed_at: null,
            reviewed_by_user_id: null,
            locked_at: null,
            locked_by_user_id: null,
            created_at: now,
            updated_at: now,
          }))
        )
        .execute();

      for (const txnId of updateTxnIds) {
        await updateTxnServer({
          context,
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
      }

      const updateSuggestions = await listRuleSuggestionsServer({
        context,
        companyId,
      });
      assert.equal(updateSuggestions.length, 1);
      const updateSuggestion = updateSuggestions[0]!;
      assert.equal(updateSuggestion.recommendedAction, 'update_existing');

      const updated = await acceptRuleSuggestionServer({
        context,
        companyId,
        input: {
          id: updateSuggestion.id,
          action: 'update_existing',
          proposedMatchText: 'Acme',
          companyDefaultSubCategoryId: hotelsDefaultSubCategoryId,
        },
      });
      assert.equal(updated.ruleId, sourceRuleId);

      const updatedSourceRule = await db
        .selectFrom('company_default_mapping_rules')
        .select(['match_text', 'company_default_sub_category_id'])
        .where('company_id', '=', companyId)
        .where('id', '=', sourceRuleId)
        .executeTakeFirstOrThrow();
      assert.equal(updatedSourceRule.match_text, 'Acme');
      assert.equal(
        updatedSourceRule.company_default_sub_category_id,
        hotelsDefaultSubCategoryId
      );

      const syncedRules = await listProjectAutoCodingRulesServer({
        context,
        projectId,
      });
      assert.equal(
        syncedRules.find((rule) => rule.originCompanyItemId === sourceRuleId)
          ?.subCategoryId,
        hotelsSubCategoryId
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

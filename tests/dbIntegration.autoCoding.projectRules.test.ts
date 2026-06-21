import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProjectAutoCodingRuleServer,
  getProjectRuleSuggestionPromptServer,
} from '../src/server/fns/projectAutoCodingRules.ts';
import { updateTxnServer } from '../src/server/fns/transactions.ts';
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
  deleteTestRowsByIds,
  integrationDatabaseUrl,
  insertTestRows,
} from './dbIntegration.helpers.ts';

test(
  'project auto-coding rules prompt after repeated manual coding and bulk-apply to uncoded matches',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_prule_co_1');
    const userId = asUserId('itest_prule_usr_1');
    const projectId = asProjectId('itest_prule_prj_1');
    const categoryId = asCategoryId('itest_prule_cat_1');
    const subCategoryId = asSubCategoryId('itest_prule_sub_1');
    const manualTxnIds = [
      asTxnId('itest_prule_txn_1'),
      asTxnId('itest_prule_txn_2'),
      asTxnId('itest_prule_txn_3'),
      asTxnId('itest_prule_txn_4'),
    ];
    const uncodedTxnId = asTxnId('itest_prule_txn_5');
    const now = new Date().toISOString();

    try {
      await deleteTestRowsByIds({
        db,
        companies: [companyId],
        users: [userId],
      });

      await insertTestRows(db, 'companies', {
        id: companyId,
        name: 'Project Rule Co',
        status: 'active',
        deactivated_at: null,
      });

      await insertTestRows(db, 'users', {
        id: userId,
        email: 'prule@example.com',
        name: 'Project Rule User',
        disabled: false,
        disabled_reason: null,
        is_global_superadmin: false,
      });

      await insertTestRows(db, 'company_memberships', {
        company_id: companyId,
        user_id: userId,
        role: 'management',
      });

      await insertTestRows(db, 'projects', {
        id: projectId,
        company_id: companyId,
        name: 'Project Rule Project',
        project_type: 'project',
        parent_project_id: null,
        budget_total_cents: 0,
        currency: 'AUD',
        status: 'active',
        deactivated_at: null,
        visibility: 'private',
        allow_superadmin_access: true,
        allow_txn_transfers: false,
      });

      await insertTestRows(db, 'project_memberships', {
        project_id: projectId,
        user_id: userId,
        role: 'member',
      });

      await insertTestRows(db, 'categories', {
        id: categoryId,
        company_id: companyId,
        project_id: projectId,
        name: 'Travel',
        created_at: now,
        updated_at: now,
      });

      await insertTestRows(db, 'sub_categories', {
        id: subCategoryId,
        company_id: companyId,
        project_id: projectId,
        category_id: categoryId,
        name: 'Flights',
        created_at: now,
        updated_at: now,
      });

      await insertTestRows(
        db,
        'txns',
        [...manualTxnIds, uncodedTxnId].map((txnId, index) => ({
          public_id: txnId,
          external_id: `prule-ext-${index + 1}`,
          company_id: companyId,
          project_id: projectId,
          txn_date: '2026-06-04',
          item: 'Qantas Airways',
          description:
            index < manualTxnIds.length
              ? `Repeated manual coding ${index + 1}`
              : 'Pending uncoded match',
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
      );

      for (const txnId of manualTxnIds.slice(0, 3)) {
        const updateResult = await updateTxnServer({
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
        });
        if (txnId === manualTxnIds[2]) {
          assert.ok(updateResult.projectRulePrompt);
          assert.equal(updateResult.projectRulePrompt?.supportingCount, 3);
          assert.equal(
            updateResult.projectRulePrompt?.suggestedMatchText,
            'Qantas Airways'
          );
        }
      }

      const prompt = await getProjectRuleSuggestionPromptServer({
        context: { session: { userId } },
        projectId,
        txnId: manualTxnIds[2]!,
      });
      assert.ok(prompt);
      assert.equal(prompt?.supportingCount, 3);
      assert.equal(prompt?.suggestedMatchText, 'Qantas Airways');

      const fourthUpdate = await updateTxnServer({
        context: { session: { userId } },
        projectId,
        input: {
          id: manualTxnIds[3]!,
          categoryId,
          subCategoryId,
          companyDefaultMappingRuleId: null,
          codingSource: 'manual',
          codingPendingApproval: false,
        },
      });
      assert.ok(fourthUpdate.projectRulePrompt);
      assert.equal(fourthUpdate.projectRulePrompt?.supportingCount, 4);
      assert.equal(
        fourthUpdate.projectRulePrompt?.suggestedMatchText,
        'Qantas Airways'
      );

      const promptAfterThreshold = await getProjectRuleSuggestionPromptServer({
        context: { session: { userId } },
        projectId,
        txnId: manualTxnIds[3]!,
      });
      assert.ok(promptAfterThreshold);
      assert.equal(promptAfterThreshold?.supportingCount, 4);
      assert.equal(promptAfterThreshold?.suggestedMatchText, 'Qantas Airways');

      const created = await createProjectAutoCodingRuleServer({
        context: { session: { userId } },
        projectId,
        input: {
          matchText: 'qantas',
          categoryId,
          subCategoryId,
        },
      });
      assert.equal(created.rule.matchText, 'qantas');
      assert.equal(created.matchedTxnCount, 1);

      const uncodedTxn = await db
        .selectFrom('txns')
        .select([
          'category_id',
          'sub_category_id',
          'coding_source',
          'coding_pending_approval',
        ])
        .where('project_id', '=', projectId)
        .where('public_id', '=', uncodedTxnId)
        .executeTakeFirst();
      assert.equal(uncodedTxn?.category_id, categoryId);
      assert.equal(uncodedTxn?.sub_category_id, subCategoryId);
      assert.equal(uncodedTxn?.coding_source, 'project_rule');
      assert.equal(uncodedTxn?.coding_pending_approval, true);

      const seededBudgetLine = await db
        .selectFrom('budget_lines')
        .select(['category_id', 'sub_category_id', 'allocated_cents'])
        .where('project_id', '=', projectId)
        .where('sub_category_id', '=', subCategoryId)
        .executeTakeFirst();
      assert.equal(seededBudgetLine?.category_id, categoryId);
      assert.equal(seededBudgetLine?.sub_category_id, subCategoryId);
      assert.equal(Number(seededBudgetLine?.allocated_cents ?? -1), 0);
    } finally {
      await deleteTestRowsByIds({
        db,
        companies: [companyId],
        users: [userId],
      });
      await db.destroy();
    }
  }
);

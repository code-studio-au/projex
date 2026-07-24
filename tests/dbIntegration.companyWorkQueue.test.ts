import assert from 'node:assert/strict';
import test from 'node:test';

import { getCompanyWorkQueueServer } from '../src/server/fns/companies.ts';
import { listTransactionsPageServer } from '../src/server/fns/transactions.ts';
import {
  asCategoryId,
  asCompanyDefaultCategoryId,
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
  'company work queue aggregates actionable project workflows and links to exact transaction views',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_work_queue_co_1');
    const adminUserId = asUserId('itest_work_queue_usr_admin');
    const memberUserId = asUserId('itest_work_queue_usr_member');
    const projectId = asProjectId('itest_work_queue_prj_active');
    const archivedProjectId = asProjectId('itest_work_queue_prj_archived');
    const categoryId = asCategoryId('itest_work_queue_cat_1');
    const subCategoryId = asSubCategoryId('itest_work_queue_sub_1');
    const defaultCategoryId = asCompanyDefaultCategoryId(
      'itest_work_queue_default_cat_1'
    );
    const defaultSubCategoryId = asCompanyDefaultSubCategoryId(
      'itest_work_queue_default_sub_1'
    );
    const uncodedTxnId = asTxnId('itest_work_queue_txn_uncoded');
    const approvalTxnId = asTxnId('itest_work_queue_txn_approval');
    const reversalSourceTxnId = asTxnId('itest_work_queue_txn_reversal_source');
    const reversalTxnId = asTxnId('itest_work_queue_txn_reversal');
    const unlockTxnId = asTxnId('itest_work_queue_txn_unlock');
    const archivedTxnId = asTxnId('itest_work_queue_txn_archived');
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [adminUserId, memberUserId])
        .execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Work Queue Company',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values([
          {
            id: adminUserId,
            email: 'work-queue-admin@example.com',
            name: 'Work Queue Admin',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: memberUserId,
            email: 'work-queue-member@example.com',
            name: 'Work Queue Member',
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
          { company_id: companyId, user_id: memberUserId, role: 'member' },
        ])
        .execute();
      await db
        .insertInto('projects')
        .values([
          {
            id: projectId,
            company_id: companyId,
            name: 'Active Work Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 100_000,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'company',
            allow_superadmin_access: true,
            sync_company_defaults: true,
            allow_txn_transfers: false,
          },
          {
            id: archivedProjectId,
            company_id: companyId,
            name: 'Archived Work Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 100_000,
            currency: 'AUD',
            status: 'archived',
            deactivated_at: now,
            visibility: 'company',
            allow_superadmin_access: true,
            sync_company_defaults: true,
            allow_txn_transfers: false,
          },
        ])
        .execute();
      await db
        .insertInto('categories')
        .values({
          id: categoryId,
          company_id: companyId,
          project_id: projectId,
          name: 'Operations',
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
          name: 'Software',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('company_default_categories')
        .values({
          id: defaultCategoryId,
          company_id: companyId,
          name: 'Operations',
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
          name: 'Software',
          created_at: now,
          updated_at: now,
        })
        .execute();

      const baseTxn = {
        company_id: companyId,
        txn_type: 'standard' as const,
        parent_public_id: null,
        source_public_id: null,
        transfer_project_id: null,
        budget_impact: true,
        categorisable: true,
        import_batch_id: null,
        import_source_type: null,
        import_source_meta: null,
        company_default_mapping_rule_id: null,
        reviewed_at: null,
        reviewed_by_user_id: null,
        locked_by_user_id: null,
        created_at: now,
        updated_at: now,
      };
      await db
        .insertInto('txns')
        .values([
          {
            ...baseTxn,
            public_id: uncodedTxnId,
            external_id: 'work-queue-uncoded',
            project_id: projectId,
            txn_date: '2026-01-10',
            item: 'Uncoded transaction',
            description: 'Needs coding',
            amount_cents: 1_000,
            category_id: null,
            sub_category_id: null,
            coding_source: null,
            coding_pending_approval: false,
            locked_at: null,
          },
          {
            ...baseTxn,
            public_id: approvalTxnId,
            external_id: 'work-queue-approval',
            project_id: projectId,
            txn_date: '2026-01-11',
            item: 'Auto-coded transaction',
            description: 'Needs coding approval',
            amount_cents: 2_000,
            category_id: categoryId,
            sub_category_id: subCategoryId,
            coding_source: 'project_rule' as const,
            coding_pending_approval: true,
            locked_at: null,
          },
          {
            ...baseTxn,
            public_id: reversalSourceTxnId,
            external_id: 'work-queue-reversal-source',
            project_id: projectId,
            txn_date: '2026-01-12',
            item: 'Reversal source',
            description: 'Needs reversal decision',
            amount_cents: 3_000,
            category_id: categoryId,
            sub_category_id: subCategoryId,
            coding_source: 'manual' as const,
            coding_pending_approval: false,
            locked_at: null,
          },
          {
            ...baseTxn,
            public_id: reversalTxnId,
            external_id: 'work-queue-reversal',
            project_id: projectId,
            txn_date: '2026-01-13',
            item: 'Reversal transaction',
            description: 'Suggested reversal',
            amount_cents: -3_000,
            category_id: categoryId,
            sub_category_id: subCategoryId,
            coding_source: 'manual' as const,
            coding_pending_approval: false,
            locked_at: null,
          },
          {
            ...baseTxn,
            public_id: unlockTxnId,
            external_id: 'work-queue-unlock',
            project_id: projectId,
            txn_date: '2026-01-14',
            item: 'Locked transaction',
            description: 'Needs unlock decision',
            amount_cents: 4_000,
            category_id: categoryId,
            sub_category_id: subCategoryId,
            coding_source: 'manual' as const,
            coding_pending_approval: false,
            reviewed_at: now,
            reviewed_by_user_id: adminUserId,
            locked_at: now,
            locked_by_user_id: adminUserId,
          },
          {
            ...baseTxn,
            public_id: archivedTxnId,
            external_id: 'work-queue-archived',
            project_id: archivedProjectId,
            txn_date: '2025-01-01',
            item: 'Archived uncoded transaction',
            description: 'Must not be queued',
            amount_cents: 5_000,
            category_id: null,
            sub_category_id: null,
            coding_source: null,
            coding_pending_approval: false,
            locked_at: null,
          },
        ])
        .execute();
      await db
        .insertInto('txn_reversals')
        .values({
          id: 'itest_work_queue_reversal_1',
          company_id: companyId,
          project_id: projectId,
          source_txn_public_id: reversalSourceTxnId,
          matched_reversal_txn_public_id: reversalTxnId,
          expected_project_id: null,
          status: 'auto_matched_pending_approval',
          match_method: 'auto_clear',
          candidate_count: 1,
          match_evidence: {
            amountExact: true,
            oppositeSign: true,
            dayDelta: 1,
            withinAutoWindow: true,
            sourceCandidateCount: 1,
            counterpartCandidateCount: 1,
            reasons: ['Exact negative amount in a later transaction'],
          },
          source_snapshot: {
            txnId: reversalSourceTxnId,
            externalId: 'work-queue-reversal-source',
            date: '2026-01-12',
            item: 'Reversal source',
            description: 'Needs reversal decision',
            amountCents: 3_000,
          },
          counterpart_snapshot: {
            txnId: reversalTxnId,
            externalId: 'work-queue-reversal',
            date: '2026-01-13',
            item: 'Reversal transaction',
            description: 'Suggested reversal',
            amountCents: -3_000,
          },
          marked_at: now,
          marked_by_user_id: adminUserId,
          proposed_at: now,
          proposed_by_user_id: adminUserId,
          matched_at: null,
          matched_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txn_unlock_requests')
        .values({
          id: 'itest_work_queue_unlock_1',
          company_id: companyId,
          project_id: projectId,
          txn_public_id: unlockTxnId,
          requested_by_user_id: memberUserId,
          reason: 'Coding needs correction',
          status: 'pending',
          requested_at: now,
          resolved_at: null,
          resolved_by_user_id: null,
          resolution_reason: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('rule_suggestions')
        .values({
          id: 'itest_work_queue_suggestion_1',
          company_id: companyId,
          status: 'open',
          suggestion_type: 'create_rule',
          source_rule_id: null,
          pattern_basis: 'item',
          pattern_text_normalized: 'monthly software',
          proposed_match_text: 'Monthly Software',
          match_text_alternatives: [],
          project_category_id: categoryId,
          project_sub_category_id: subCategoryId,
          company_default_category_id: defaultCategoryId,
          company_default_sub_category_id: defaultSubCategoryId,
          sample_count: 3,
          distinct_txn_date_count: 3,
          distinct_project_count: 1,
          confidence_score: 90,
          recommended_action: 'create_rule',
          first_seen_at: now,
          last_seen_at: now,
          accepted_rule_id: null,
          accepted_action: null,
          accepted_at: null,
          accepted_by_user_id: null,
          dismissed_reason: null,
          dismissed_sample_count: null,
          dismissed_at: null,
          dismissed_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const context = { session: { userId: adminUserId } };
      const queue = await getCompanyWorkQueueServer({
        context,
        companyId,
      });

      assert.equal(queue.ruleSuggestionCount, 1);
      assert.deepEqual(queue.projects, [
        {
          projectId,
          projectName: 'Active Work Project',
          needsCodingCount: 1,
          oldestNeedsCodingDate: '2026-01-10',
          codingApprovalCount: 1,
          oldestCodingApprovalDate: '2026-01-11',
          reversalReviewCount: 1,
          oldestReversalReviewDate: '2026-01-12',
          unlockRequestCount: 1,
          oldestUnlockRequestAt: now,
        },
      ]);

      const reversalPage = await listTransactionsPageServer({
        context,
        projectId,
        input: {
          pageIndex: 0,
          pageSize: 20,
          transactionView: 'reversal-review',
        },
      });
      assert.deepEqual(
        reversalPage.rows.map((txn) => txn.id),
        [reversalSourceTxnId]
      );

      const unlockPage = await listTransactionsPageServer({
        context,
        projectId,
        input: {
          pageIndex: 0,
          pageSize: 20,
          transactionView: 'unlock-requests',
        },
      });
      assert.deepEqual(
        unlockPage.rows.map((txn) => txn.id),
        [unlockTxnId]
      );

      await assertAppErrorCode(
        () =>
          getCompanyWorkQueueServer({
            context: { session: { userId: memberUserId } },
            companyId,
          }),
        'FORBIDDEN',
        'company work queue member access'
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [adminUserId, memberUserId])
        .execute();
      await db.destroy();
    }
  }
);

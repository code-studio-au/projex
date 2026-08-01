import assert from 'node:assert/strict';
import test from 'node:test';

import { listTransactionCommentSummariesServer } from '../src/server/fns/transactionComments.ts';
import {
  listProjectTransactionSummaryServer,
  listTransactionsPageServer,
  listTransactionsSelectionServer,
} from '../src/server/fns/transactions.ts';
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
  'project transaction summary returns rollup data without loading the full transaction list',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_txn_summary_co_1');
    const userId = asUserId('itest_txn_summary_usr_1');
    const projectId = asProjectId('itest_txn_summary_prj_1');
    const categoryId = asCategoryId('itest_txn_summary_cat_1');
    const subCategoryId = asSubCategoryId('itest_txn_summary_sub_1');
    const codedTxnId = asTxnId('itest_txn_summary_txn_1');
    const autoMappedTxnId = asTxnId('itest_txn_summary_txn_2');
    const uncodedTxnId = asTxnId('itest_txn_summary_txn_3');
    const sourceOnlyTxnId = asTxnId('itest_txn_summary_txn_4');
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Txn Summary Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'txn-summary@example.com',
          name: 'Txn Summary Lead',
          disabled: false,
          disabled_reason: null,
          is_global_superadmin: false,
        })
        .execute();
      await db
        .insertInto('company_memberships')
        .values({ company_id: companyId, user_id: userId, role: 'member' })
        .execute();
      await db
        .insertInto('projects')
        .values({
          id: projectId,
          company_id: companyId,
          name: 'Txn Summary Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 100000,
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
          name: 'Consulting',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txns')
        .values([
          {
            public_id: codedTxnId,
            external_id: 'itest-txn-summary-ext-1',
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-05-10',
            item: 'Coded May actual',
            description: 'Coded transaction for May',
            amount_cents: 10000,
            txn_type: 'standard',
            parent_public_id: null,
            source_public_id: null,
            transfer_project_id: null,
            budget_impact: true,
            categorisable: true,
            import_batch_id: null,
            import_source_type: 'powerbi_expenditure_actuals',
            import_source_meta: {
              referenceNum: 'REF-ALPHA-42',
              source: 'Concur',
            },
            category_id: categoryId,
            sub_category_id: subCategoryId,
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
            public_id: autoMappedTxnId,
            external_id: 'itest-txn-summary-ext-2',
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-12',
            item: 'Auto-mapped June actual',
            description: 'Pending approval auto-map',
            amount_cents: 15000,
            txn_type: 'standard',
            parent_public_id: null,
            source_public_id: null,
            transfer_project_id: null,
            budget_impact: true,
            categorisable: true,
            import_batch_id: null,
            import_source_type: null,
            import_source_meta: null,
            category_id: categoryId,
            sub_category_id: subCategoryId,
            company_default_mapping_rule_id: null,
            coding_source: 'company_default_rule',
            coding_pending_approval: true,
            reviewed_at: null,
            reviewed_by_user_id: null,
            locked_at: null,
            locked_by_user_id: null,
            created_at: now,
            updated_at: now,
          },
          {
            public_id: uncodedTxnId,
            external_id: 'itest-txn-summary-ext-3',
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-13',
            item: 'Uncoded June actual',
            description: 'Still uncoded',
            amount_cents: 4000,
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
          },
          {
            public_id: sourceOnlyTxnId,
            external_id: 'itest-txn-summary-ext-4',
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-15',
            item: 'Source-only metadata row',
            description: 'Should not affect budget rollups',
            amount_cents: 9999,
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
      await db
        .insertInto('txn_comments')
        .values({
          id: 'itest_txn_summary_comment_1',
          company_id: companyId,
          project_id: projectId,
          txn_public_id: codedTxnId,
          parent_comment_id: null,
          body: 'Assigned summary fixture',
          assigned_to_user_id: userId,
          created_by_user_id: userId,
          resolved_at: null,
          resolved_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const summary = await listProjectTransactionSummaryServer({
        context: { session: { userId } },
        projectId,
      });

      assert.deepEqual(summary.monthKeys, ['2026-05', '2026-06']);
      assert.deepEqual(summary.rows, [
        {
          subCategoryId,
          monthKey: '2026-05',
          actualCents: 10000,
        },
        {
          subCategoryId,
          monthKey: '2026-06',
          actualCents: 15000,
        },
      ]);
      assert.deepEqual(summary.periodSummaries, [
        {
          monthKey: '2026-05',
          uncodedCount: 0,
          uncodedAmountCents: 0,
          pendingReversalCount: 0,
          pendingReversalCents: 0,
        },
        {
          monthKey: '2026-06',
          uncodedCount: 1,
          uncodedAmountCents: 4000,
          pendingReversalCount: 0,
          pendingReversalCents: 0,
        },
      ]);
      assert.equal(summary.uncodedCount, 1);
      assert.equal(summary.uncodedAmountCents, 4000);
      assert.equal(summary.pendingReversalCount, 0);
      assert.equal(summary.pendingReversalCents, 0);
      assert.equal(summary.autoMappedPendingCount, 1);
      assert.equal(summary.invalidDateCount, 0);

      const page = await listTransactionsPageServer({
        context: { session: { userId } },
        projectId,
        input: { pageIndex: 0, pageSize: 20 },
      });
      assert.deepEqual(page.summary, {
        totalCount: 4,
        budgetImpactCents: 29000,
        pendingReversalCount: 0,
        pendingReversalCents: 0,
        adjustedBudgetImpactCents: 29000,
        uncodedCount: 1,
        uncodedCents: 4000,
        codingApprovalCount: 1,
        reversalReviewCount: 0,
        reversalMatchReviewCount: 0,
        awaitingReversalCount: 0,
        sourceOnlyCount: 1,
        assignedToMeCount: 1,
        reviewedCount: 0,
        lockedCount: 0,
        invalidDateCount: 0,
      });

      const searchCases = [
        {
          search: 'pending APPROVAL',
          expectedTxnIds: [autoMappedTxnId],
        },
        {
          search: 'ext-3',
          expectedTxnIds: [uncodedTxnId],
        },
        {
          search: 'ref-alpha-42',
          expectedTxnIds: [codedTxnId],
        },
        {
          search: 'consulting',
          expectedTxnIds: [autoMappedTxnId, codedTxnId],
        },
      ];
      for (const searchCase of searchCases) {
        const searchedPage = await listTransactionsPageServer({
          context: { session: { userId } },
          projectId,
          input: {
            pageIndex: 0,
            pageSize: 20,
            search: searchCase.search,
          },
        });
        assert.deepEqual(
          searchedPage.rows.map((txn) => txn.id),
          searchCase.expectedTxnIds
        );
        assert.equal(
          searchedPage.summary.totalCount,
          searchCase.expectedTxnIds.length
        );
      }

      const selection = await listTransactionsSelectionServer({
        context: { session: { userId } },
        projectId,
        input: {
          monthFilterKey: '2026-06',
          transactionView: 'auto-mapped-pending',
          search: 'pending approval',
        },
      });
      assert.deepEqual(selection.rows, [
        {
          id: autoMappedTxnId,
          categorisable: true,
          subCategoryId,
          codingPendingApproval: true,
          locked: false,
          workflowVersion: 0,
        },
      ]);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'transaction comment summaries can be scoped to the visible transaction ids',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_txn_comment_summary_co_1');
    const authorUserId = asUserId('itest_txn_comment_summary_usr_1');
    const assigneeUserId = asUserId('itest_txn_comment_summary_usr_2');
    const projectId = asProjectId('itest_txn_comment_summary_prj_1');
    const visibleTxnId = asTxnId('itest_txn_comment_summary_txn_1');
    const otherVisibleTxnId = asTxnId('itest_txn_comment_summary_txn_2');
    const hiddenTxnId = asTxnId('itest_txn_comment_summary_txn_3');
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [authorUserId, assigneeUserId])
        .execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Txn Comment Summary Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values([
          {
            id: authorUserId,
            email: 'txn-comment-author@example.com',
            name: 'Txn Comment Author',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: assigneeUserId,
            email: 'txn-comment-assignee@example.com',
            name: 'Txn Comment Assignee',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();
      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: authorUserId, role: 'member' },
          { company_id: companyId, user_id: assigneeUserId, role: 'member' },
        ])
        .execute();
      await db
        .insertInto('projects')
        .values({
          id: projectId,
          company_id: companyId,
          name: 'Txn Comment Summary Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 100000,
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
        .values([
          { project_id: projectId, user_id: authorUserId, role: 'lead' },
          { project_id: projectId, user_id: assigneeUserId, role: 'member' },
        ])
        .execute();
      await db
        .insertInto('txns')
        .values([
          {
            public_id: visibleTxnId,
            external_id: 'itest-txn-comment-summary-ext-1',
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-10',
            item: 'Visible txn A',
            description: 'Visible transaction A',
            amount_cents: 5000,
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
          },
          {
            public_id: otherVisibleTxnId,
            external_id: 'itest-txn-comment-summary-ext-2',
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-11',
            item: 'Visible txn B',
            description: 'Visible transaction B',
            amount_cents: 6000,
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
          },
          {
            public_id: hiddenTxnId,
            external_id: 'itest-txn-comment-summary-ext-3',
            company_id: companyId,
            project_id: projectId,
            txn_date: '2026-06-12',
            item: 'Hidden txn',
            description: 'Should be excluded from visible summaries',
            amount_cents: 7000,
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
          },
        ])
        .execute();
      await db
        .insertInto('txn_comments')
        .values([
          {
            id: 'itest_txn_comment_summary_comment_1',
            company_id: companyId,
            project_id: projectId,
            txn_public_id: visibleTxnId,
            parent_comment_id: null,
            body: 'First unresolved visible comment',
            assigned_to_user_id: authorUserId,
            created_by_user_id: assigneeUserId,
            resolved_at: null,
            resolved_by_user_id: null,
            created_at: '2026-06-14T09:00:00.000Z',
            updated_at: '2026-06-14T09:00:00.000Z',
          },
          {
            id: 'itest_txn_comment_summary_comment_2',
            company_id: companyId,
            project_id: projectId,
            txn_public_id: visibleTxnId,
            parent_comment_id: null,
            body: 'Latest resolved visible comment',
            assigned_to_user_id: null,
            created_by_user_id: authorUserId,
            resolved_at: '2026-06-15T09:00:00.000Z',
            resolved_by_user_id: assigneeUserId,
            created_at: '2026-06-15T08:00:00.000Z',
            updated_at: '2026-06-15T09:00:00.000Z',
          },
          {
            id: 'itest_txn_comment_summary_comment_3',
            company_id: companyId,
            project_id: projectId,
            txn_public_id: otherVisibleTxnId,
            parent_comment_id: null,
            body: 'Other visible unresolved comment',
            assigned_to_user_id: authorUserId,
            created_by_user_id: assigneeUserId,
            resolved_at: null,
            resolved_by_user_id: null,
            created_at: '2026-06-16T08:00:00.000Z',
            updated_at: '2026-06-16T08:00:00.000Z',
          },
          {
            id: 'itest_txn_comment_summary_comment_4',
            company_id: companyId,
            project_id: projectId,
            txn_public_id: hiddenTxnId,
            parent_comment_id: null,
            body: 'Hidden comment should not be included',
            assigned_to_user_id: authorUserId,
            created_by_user_id: assigneeUserId,
            resolved_at: null,
            resolved_by_user_id: null,
            created_at: '2026-06-17T08:00:00.000Z',
            updated_at: '2026-06-17T08:00:00.000Z',
          },
        ])
        .execute();

      const scopedSummaries = await listTransactionCommentSummariesServer({
        context: { session: { userId: authorUserId } },
        projectId,
        txnIds: [visibleTxnId, otherVisibleTxnId],
      });
      const scopedByTxnId = new Map(
        scopedSummaries.map((summary) => [summary.txnId, summary] as const)
      );

      assert.equal(scopedSummaries.length, 2);
      assert.equal(scopedByTxnId.has(hiddenTxnId), false);
      assert.deepEqual(scopedByTxnId.get(visibleTxnId), {
        txnId: visibleTxnId,
        totalCount: 2,
        unresolvedCount: 1,
        resolvedCount: 1,
        assignedToMeUnresolvedCount: 1,
        latestCommentBody: 'Latest resolved visible comment',
        latestCommentCreatedAt: new Date('2026-06-15T08:00:00.000Z'),
        latestCommentAuthorName: 'Txn Comment Author',
      });
      assert.deepEqual(scopedByTxnId.get(otherVisibleTxnId), {
        txnId: otherVisibleTxnId,
        totalCount: 1,
        unresolvedCount: 1,
        resolvedCount: 0,
        assignedToMeUnresolvedCount: 1,
        latestCommentBody: 'Other visible unresolved comment',
        latestCommentCreatedAt: new Date('2026-06-16T08:00:00.000Z'),
        latestCommentAuthorName: 'Txn Comment Assignee',
      });

      const fullSummaries = await listTransactionCommentSummariesServer({
        context: { session: { userId: authorUserId } },
        projectId,
      });
      assert.equal(fullSummaries.length, 3);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [authorUserId, assigneeUserId])
        .execute();
      await db.destroy();
    }
  }
);

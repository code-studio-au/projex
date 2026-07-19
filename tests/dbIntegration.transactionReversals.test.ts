import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTxnReversalActionServer,
  listTransactionsPageServer,
  listTxnReversalMatchSuggestionsServer,
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
  'pending reversal workflow marks, suggests, matches, and unmatches reversal pairs',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_txn_reversal_co_1');
    const userId = asUserId('itest_txn_reversal_usr_1');
    const sourceProjectId = asProjectId('itest_txn_reversal_prj_1');
    const expectedProjectId = asProjectId('itest_txn_reversal_prj_2');
    const categoryId = asCategoryId('itest_txn_reversal_cat_1');
    const subCategoryId = asSubCategoryId('itest_txn_reversal_sub_1');
    const sourceTxnId = asTxnId('itest_txn_reversal_txn_1');
    const reversalTxnId = asTxnId('itest_txn_reversal_txn_2');
    const now = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Txn Reversal Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'txn-reversal@example.com',
          name: 'Txn Reversal Lead',
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
        .values([
          {
            id: sourceProjectId,
            company_id: companyId,
            name: 'Source Project',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 200000,
            currency: 'AUD',
            status: 'active',
            deactivated_at: null,
            visibility: 'private',
            allow_superadmin_access: true,
            sync_company_defaults: true,
            allow_txn_transfers: false,
          },
          {
            id: expectedProjectId,
            company_id: companyId,
            name: 'Expected Destination',
            project_type: 'project',
            parent_project_id: null,
            budget_total_cents: 150000,
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
        .values([
          { project_id: sourceProjectId, user_id: userId, role: 'lead' },
          { project_id: expectedProjectId, user_id: userId, role: 'member' },
        ])
        .execute();
      await db
        .insertInto('categories')
        .values({
          id: categoryId,
          company_id: companyId,
          project_id: sourceProjectId,
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
          project_id: sourceProjectId,
          category_id: categoryId,
          name: 'Contractors',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txns')
        .values([
          {
            public_id: sourceTxnId,
            external_id: 'PAIR-1',
            company_id: companyId,
            project_id: sourceProjectId,
            txn_date: '2026-07-01',
            item: 'Consulting invoice',
            description: 'Needs to be moved in Power BI',
            amount_cents: 10000,
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
            public_id: reversalTxnId,
            external_id: 'PAIR-1-REVERSAL',
            company_id: companyId,
            project_id: sourceProjectId,
            txn_date: '2026-07-08',
            item: 'Consulting reversal',
            description: 'Refund after Power BI reassignment',
            amount_cents: -10000,
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
            coding_source: 'manual',
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

      const context = { session: { userId } };

      const markedPending = await applyTxnReversalActionServer({
        context,
        projectId: sourceProjectId,
        input: {
          action: 'markPending',
          txnId: sourceTxnId,
          expectedProjectId,
          commentBody: 'Waiting for the Power BI reversal import.',
        },
      });

      assert.equal(markedPending.txn.reversal?.status, 'pending_reversal');
      assert.equal(markedPending.txn.reversal?.side, 'source');
      assert.equal(
        markedPending.txn.reversal?.expectedProjectId,
        expectedProjectId
      );

      const pendingPage = await listTransactionsPageServer({
        context,
        projectId: sourceProjectId,
        input: {
          pageIndex: 0,
          pageSize: 10,
          transactionView: 'pending-reversal',
        },
      });
      assert.equal(pendingPage.rows.length, 1);
      assert.equal(pendingPage.rows[0]?.id, sourceTxnId);
      assert.equal(pendingPage.summary.pendingReversalCount, 1);
      assert.equal(pendingPage.summary.pendingReversalCents, 10000);

      const suggestions = await listTxnReversalMatchSuggestionsServer({
        context,
        projectId: sourceProjectId,
        txnId: sourceTxnId,
      });
      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0]?.txnId, reversalTxnId);
      assert.ok(suggestions[0]?.reasons.includes('Same absolute amount'));

      const matched = await applyTxnReversalActionServer({
        context,
        projectId: sourceProjectId,
        input: {
          action: 'match',
          txnId: sourceTxnId,
          reversalTxnId,
          commentBody: 'Matched after the refund arrived.',
        },
      });

      assert.equal(matched.txn.reversal?.status, 'reversed_matched');
      assert.equal(matched.txn.reversal?.counterpartTxnId, reversalTxnId);
      assert.equal(matched.counterpartTxn?.reversal?.side, 'reversal');
      assert.equal(
        matched.counterpartTxn?.reversal?.counterpartTxnId,
        sourceTxnId
      );

      const commentsAfterMatch = await db
        .selectFrom('txn_comments')
        .select(['txn_public_id', 'body'])
        .where('project_id', '=', sourceProjectId)
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      assert.ok(
        commentsAfterMatch.some(
          (row) =>
            row.txn_public_id === sourceTxnId &&
            row.body.includes('[Pending reversal]')
        )
      );
      assert.ok(
        commentsAfterMatch.some(
          (row) =>
            row.txn_public_id === sourceTxnId &&
            row.body.includes('[Reversal matched]')
        )
      );
      assert.ok(
        commentsAfterMatch.some(
          (row) =>
            row.txn_public_id === reversalTxnId &&
            row.body.includes('[Matched as reversal]')
        )
      );

      const unmatched = await applyTxnReversalActionServer({
        context,
        projectId: sourceProjectId,
        input: {
          action: 'unmatch',
          txnId: sourceTxnId,
          commentBody: 'Reopened for manual review.',
        },
      });

      assert.equal(unmatched.txn.reversal?.status, 'pending_reversal');
      assert.equal(unmatched.txn.reversal?.counterpartTxnId, undefined);
      assert.equal(unmatched.counterpartTxn?.reversal, undefined);

      const commentsAfterUnmatch = await db
        .selectFrom('txn_comments')
        .select(['txn_public_id', 'body'])
        .where('project_id', '=', sourceProjectId)
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      assert.ok(
        commentsAfterUnmatch.some(
          (row) =>
            row.txn_public_id === sourceTxnId &&
            row.body.includes('[Reversal match removed]')
        )
      );
      assert.ok(
        commentsAfterUnmatch.some(
          (row) =>
            row.txn_public_id === reversalTxnId &&
            row.body.includes('[Removed as reversal match]')
        )
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

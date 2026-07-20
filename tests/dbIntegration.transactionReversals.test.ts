import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTxnReversalActionServer,
  importTransactionsServer,
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

test(
  'month-two EXA import auto-suggests a pending reversal and can be approved',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_txn_reversal_auto_co_1');
    const userId = asUserId('itest_txn_reversal_auto_usr_1');
    const projectId = asProjectId('itest_txn_reversal_auto_prj_1');
    const sourceTxnId = asTxnId('itest_txn_reversal_auto_txn_1');
    const reversalTxnId = asTxnId('itest_txn_reversal_auto_txn_2');
    const context = { session: { userId } };

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Txn Reversal Auto Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'txn-reversal-auto@example.com',
          name: 'Txn Reversal Auto Lead',
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
          name: 'Auto Match Project',
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
        })
        .execute();
      await db
        .insertInto('project_memberships')
        .values({ project_id: projectId, user_id: userId, role: 'lead' })
        .execute();

      const monthOneImport = await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        txns: [
          {
            id: sourceTxnId,
            externalId: 'AUTO-EXA-1',
            companyId,
            projectId,
            date: '2026-05-30',
            item: '1181853 Monthly accrual',
            description:
              '1181853 Monthly accrual | CC100 Team | Source: EXA | Reference: REF-1181853',
            amountCents: 12500,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 Monthly accrual',
              'CC and Description': 'CC100 Team',
              'Reference Num': 'REF-1181853',
            },
          },
        ],
      });
      assert.equal(monthOneImport.count, 1);

      const markedPending = await applyTxnReversalActionServer({
        context,
        projectId,
        input: {
          action: 'markPending',
          txnId: sourceTxnId,
          commentBody: 'Expected to reverse in the next monthly EXA import.',
        },
      });
      assert.equal(markedPending.txn.reversal?.status, 'pending_reversal');

      const monthTwoImport = await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        txns: [
          {
            id: reversalTxnId,
            externalId: 'AUTO-EXA-2',
            companyId,
            projectId,
            date: '2026-06-28',
            item: '1181853 Monthly accrual reversal',
            description:
              '1181853 Monthly accrual | CC100 Team | Source: EXA | Reference: REF-1181853',
            amountCents: -12500,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 Monthly accrual',
              'CC and Description': 'CC100 Team',
              'Reference Num': 'REF-1181853',
            },
          },
        ],
      });
      assert.equal(monthTwoImport.count, 1);

      const pendingPage = await listTransactionsPageServer({
        context,
        projectId,
        input: {
          pageIndex: 0,
          pageSize: 20,
          transactionView: 'pending-reversal',
        },
      });
      assert.equal(pendingPage.rows.length, 1);
      assert.equal(pendingPage.rows[0]?.id, sourceTxnId);
      assert.equal(
        pendingPage.rows[0]?.reversal?.status,
        'auto_matched_pending_approval'
      );

      const suggestedReversal = await db
        .selectFrom('txn_reversals')
        .select([
          'status',
          'source_txn_public_id',
          'matched_reversal_txn_public_id',
          'matched_at',
          'matched_by_user_id',
        ])
        .where('project_id', '=', projectId)
        .where('source_txn_public_id', '=', sourceTxnId)
        .executeTakeFirstOrThrow();
      assert.equal(suggestedReversal.status, 'auto_matched_pending_approval');
      assert.equal(
        suggestedReversal.matched_reversal_txn_public_id,
        reversalTxnId
      );
      assert.equal(suggestedReversal.matched_at, null);
      assert.equal(suggestedReversal.matched_by_user_id, null);

      const suggestedComments = await db
        .selectFrom('txn_comments')
        .select(['txn_public_id', 'body'])
        .where('project_id', '=', projectId)
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      assert.ok(
        suggestedComments.some(
          (row) =>
            row.txn_public_id === sourceTxnId &&
            row.body.includes('[Reversal match suggested]')
        )
      );
      assert.ok(
        suggestedComments.some(
          (row) =>
            row.txn_public_id === reversalTxnId &&
            row.body.includes('[Suggested as reversal]')
        )
      );

      const approved = await applyTxnReversalActionServer({
        context,
        projectId,
        input: {
          action: 'approveSuggestedMatch',
          txnId: reversalTxnId,
          commentBody: 'Reviewed and approved after month-two import.',
        },
      });
      assert.equal(approved.txn.id, sourceTxnId);
      assert.equal(approved.txn.reversal?.status, 'reversed_matched');
      assert.equal(approved.txn.reversal?.counterpartTxnId, reversalTxnId);
      assert.equal(
        approved.counterpartTxn?.reversal?.status,
        'reversed_matched'
      );
      assert.equal(approved.counterpartTxn?.reversal?.side, 'reversal');

      const approvedComments = await db
        .selectFrom('txn_comments')
        .select(['txn_public_id', 'body'])
        .where('project_id', '=', projectId)
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      assert.ok(
        approvedComments.some(
          (row) =>
            row.txn_public_id === sourceTxnId &&
            row.body.includes('Approved auto-matched reversal')
        )
      );
      assert.ok(
        approvedComments.some(
          (row) =>
            row.txn_public_id === reversalTxnId &&
            row.body.includes(
              'Approved auto-match to pending reversal transaction'
            )
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
  'rejecting an auto-suggested EXA reversal returns it to manual matching',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_txn_reversal_reject_co_1');
    const userId = asUserId('itest_txn_reversal_reject_usr_1');
    const projectId = asProjectId('itest_txn_reversal_reject_prj_1');
    const sourceTxnId = asTxnId('itest_txn_reversal_reject_txn_1');
    const reversalTxnId = asTxnId('itest_txn_reversal_reject_txn_2');
    const context = { session: { userId } };

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Txn Reversal Reject Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'txn-reversal-reject@example.com',
          name: 'Txn Reversal Reject Lead',
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
          name: 'Reject Match Project',
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
        })
        .execute();
      await db
        .insertInto('project_memberships')
        .values({ project_id: projectId, user_id: userId, role: 'lead' })
        .execute();

      await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        txns: [
          {
            id: sourceTxnId,
            externalId: 'REJECT-EXA-1',
            companyId,
            projectId,
            date: '2026-04-30',
            item: '1181853 Contingency accrual',
            description:
              '1181853 Contingency accrual | CC200 Ops | Source: EXA | Reference: REF-REJECT',
            amountCents: 9900,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 Contingency accrual',
              'CC and Description': 'CC200 Ops',
              'Reference Num': 'REF-REJECT',
            },
          },
        ],
      });

      await applyTxnReversalActionServer({
        context,
        projectId,
        input: {
          action: 'markPending',
          txnId: sourceTxnId,
          commentBody: 'Waiting for the next import to confirm the reversal.',
        },
      });

      await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        txns: [
          {
            id: reversalTxnId,
            externalId: 'REJECT-EXA-2',
            companyId,
            projectId,
            date: '2026-05-31',
            item: '1181853 Contingency accrual reversal',
            description:
              '1181853 Contingency accrual | CC200 Ops | Source: EXA | Reference: REF-REJECT',
            amountCents: -9900,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 Contingency accrual',
              'CC and Description': 'CC200 Ops',
              'Reference Num': 'REF-REJECT',
            },
          },
        ],
      });

      const rejected = await applyTxnReversalActionServer({
        context,
        projectId,
        input: {
          action: 'rejectSuggestedMatch',
          txnId: reversalTxnId,
          commentBody: 'Leaving this one for manual confirmation.',
        },
      });
      assert.equal(rejected.txn.id, sourceTxnId);
      assert.equal(rejected.txn.reversal?.status, 'pending_reversal');
      assert.equal(rejected.txn.reversal?.counterpartTxnId, undefined);
      assert.equal(rejected.counterpartTxn?.reversal, undefined);

      const followUpSuggestions = await listTxnReversalMatchSuggestionsServer({
        context,
        projectId,
        txnId: sourceTxnId,
      });
      assert.equal(followUpSuggestions.length, 1);
      assert.equal(followUpSuggestions[0]?.txnId, reversalTxnId);

      const rejectedComments = await db
        .selectFrom('txn_comments')
        .select(['txn_public_id', 'body'])
        .where('project_id', '=', projectId)
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      assert.ok(
        rejectedComments.some(
          (row) =>
            row.txn_public_id === sourceTxnId &&
            row.body.includes('[Suggested reversal rejected]')
        )
      );
      assert.ok(
        rejectedComments.some(
          (row) =>
            row.txn_public_id === reversalTxnId &&
            row.body.includes('[Removed as suggested reversal]')
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
  'ambiguous EXA reversal imports become visible manual review exceptions',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_txn_reversal_ambiguous_co_1');
    const userId = asUserId('itest_txn_reversal_ambiguous_usr_1');
    const projectId = asProjectId('itest_txn_reversal_ambiguous_prj_1');
    const sourceTxnAId = asTxnId('itest_txn_reversal_ambiguous_txn_1');
    const sourceTxnBId = asTxnId('itest_txn_reversal_ambiguous_txn_2');
    const reversalTxnAId = asTxnId('itest_txn_reversal_ambiguous_txn_3');
    const reversalTxnBId = asTxnId('itest_txn_reversal_ambiguous_txn_4');
    const context = { session: { userId } };

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Txn Reversal Ambiguous Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'txn-reversal-ambiguous@example.com',
          name: 'Txn Reversal Ambiguous Lead',
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
          name: 'Ambiguous Match Project',
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
        })
        .execute();
      await db
        .insertInto('project_memberships')
        .values({ project_id: projectId, user_id: userId, role: 'lead' })
        .execute();

      await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        txns: [
          {
            id: sourceTxnAId,
            externalId: 'AMB-EXA-1',
            companyId,
            projectId,
            date: '2026-05-31',
            item: '1181853 - CONFERENCES & FUNCTI',
            description:
              '1181853 - CONFERENCES & FUNCTI | 5800 (Conference & Function) | Source: EXA',
            amountCents: 123596,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 - CONFERENCES & FUNCTI',
              'CC and Description': '5800 (Conference & Function)',
              'Reference Num': '',
            },
          },
          {
            id: sourceTxnBId,
            externalId: 'AMB-EXA-2',
            companyId,
            projectId,
            date: '2026-05-31',
            item: '1181853 - CONFERENCES & FUNCTI',
            description:
              '1181853 - CONFERENCES & FUNCTI | 5800 (Conference & Function) | Source: EXA',
            amountCents: 123596,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 - CONFERENCES & FUNCTI',
              'CC and Description': '5800 (Conference & Function)',
              'Reference Num': '',
            },
          },
        ],
      });

      await applyTxnReversalActionServer({
        context,
        projectId,
        input: {
          action: 'markPending',
          txnId: sourceTxnAId,
          commentBody: 'Pending reversal A.',
        },
      });
      await applyTxnReversalActionServer({
        context,
        projectId,
        input: {
          action: 'markPending',
          txnId: sourceTxnBId,
          commentBody: 'Pending reversal B.',
        },
      });

      await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        txns: [
          {
            id: reversalTxnAId,
            externalId: 'AMB-EXA-3',
            companyId,
            projectId,
            date: '2026-06-01',
            item: '1181853 - CONFERENCES & FUNCTI',
            description:
              '1181853 - CONFERENCES & FUNCTI | 5800 (Conference & Function) | Source: EXA',
            amountCents: -123596,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 - CONFERENCES & FUNCTI',
              'CC and Description': '5800 (Conference & Function)',
              'Reference Num': '',
            },
          },
          {
            id: reversalTxnBId,
            externalId: 'AMB-EXA-4',
            companyId,
            projectId,
            date: '2026-06-01',
            item: '1181853 - CONFERENCES & FUNCTI',
            description:
              '1181853 - CONFERENCES & FUNCTI | 5800 (Conference & Function) | Source: EXA',
            amountCents: -123596,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 - CONFERENCES & FUNCTI',
              'CC and Description': '5800 (Conference & Function)',
              'Reference Num': '',
            },
          },
        ],
      });

      const pendingPage = await listTransactionsPageServer({
        context,
        projectId,
        input: {
          pageIndex: 0,
          pageSize: 20,
          transactionView: 'pending-reversal',
        },
      });
      assert.equal(pendingPage.rows.length, 2);
      assert.equal(pendingPage.rows[0]?.reversal?.status, 'reversal_exception');
      assert.equal(pendingPage.rows[1]?.reversal?.status, 'reversal_exception');

      const sourceSuggestions = await listTxnReversalMatchSuggestionsServer({
        context,
        projectId,
        txnId: sourceTxnAId,
      });
      assert.equal(sourceSuggestions.length, 2);
      assert.deepEqual(
        new Set(sourceSuggestions.map((suggestion) => suggestion.txnId)),
        new Set([reversalTxnAId, reversalTxnBId])
      );

      const exceptionComments = await db
        .selectFrom('txn_comments')
        .select(['txn_public_id', 'body'])
        .where('project_id', '=', projectId)
        .where('txn_public_id', 'in', [sourceTxnAId, sourceTxnBId])
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      assert.ok(
        exceptionComments.some(
          (row) =>
            row.txn_public_id === sourceTxnAId &&
            row.body.includes('[Auto-match review needed]')
        )
      );
      assert.ok(
        exceptionComments.some(
          (row) =>
            row.txn_public_id === sourceTxnBId &&
            row.body.includes('[Auto-match review needed]')
        )
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

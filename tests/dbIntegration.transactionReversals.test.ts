import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTxnReversalActionServer,
  bulkTxnActionServer,
  deleteTxnServer,
  listProjectTransactionSummaryServer,
  listTransactionsSelectionServer,
  listTransactionsPageServer,
  listTxnReversalMatchSuggestionsServer,
  splitTxnServer,
  updateTxnServer,
} from '../src/server/fns/transactions.ts';
import { importTrustedTransactionsServer as importTransactionsServer } from '../src/server/testing/importTrustedTransactions.ts';
import {
  asCategoryId,
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
  'pending reversal workflow marks, suggests, matches, and unmatches reversal pairs',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const auditLogs: Array<Record<string, unknown>> = [];
    const originalConsoleInfo = console.info;
    const originalAuditLogging = process.env.PROJEX_AUDIT_LOGGING;
    process.env.PROJEX_AUDIT_LOGGING = 'true';
    console.info = (message?: unknown) => {
      if (typeof message === 'string') {
        auditLogs.push(JSON.parse(message) as Record<string, unknown>);
      }
    };
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
      await assertAppErrorCode(
        () =>
          updateTxnServer({
            context,
            projectId: sourceProjectId,
            input: { id: sourceTxnId, amountCents: 10001 },
          }),
        'CONFLICT',
        'reversal source matching identity cannot be edited'
      );
      await assertAppErrorCode(
        () =>
          deleteTxnServer({
            context,
            projectId: sourceProjectId,
            txnId: sourceTxnId,
          }),
        'CONFLICT',
        'reversal source cannot be deleted independently'
      );
      await assertAppErrorCode(
        () =>
          splitTxnServer({
            context,
            projectId: sourceProjectId,
            input: {
              txnId: sourceTxnId,
              children: [{ amountCents: 6000 }, { amountCents: 4000 }],
            },
          }),
        'CONFLICT',
        'reversal source cannot be split while pending'
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
      assert.equal(suggestions[0]?.evidence.amountExact, true);

      await assertAppErrorCode(
        () =>
          applyTxnReversalActionServer({
            context,
            projectId: sourceProjectId,
            input: {
              action: 'match',
              txnId: sourceTxnId,
              reversalTxnId,
              expectedReversalVersion: 999,
            },
          }),
        'CONFLICT',
        'stale reversal version is rejected'
      );

      const matched = await applyTxnReversalActionServer({
        context,
        projectId: sourceProjectId,
        input: {
          action: 'match',
          txnId: sourceTxnId,
          reversalTxnId,
          commentBody: 'Matched after the refund arrived.',
          expectedReversalVersion: markedPending.txn.reversal?.version,
        },
      });

      assert.equal(matched.txn.reversal?.status, 'reversed_matched');
      assert.equal(matched.txn.reversal?.counterpartTxnId, reversalTxnId);
      assert.equal(matched.counterpartTxn?.reversal?.side, 'reversal');
      assert.equal(
        matched.counterpartTxn?.reversal?.counterpartTxnId,
        sourceTxnId
      );
      assert.equal(matched.txn.reversal?.matchMethod, 'manual');
      assert.equal(matched.txn.reversal?.sourceTxn?.item, 'Consulting invoice');
      assert.equal(
        matched.txn.reversal?.counterpartTxn?.item,
        'Consulting reversal'
      );
      assert.equal(matched.txn.reversal?.matchEvidence?.amountExact, true);
      await assertAppErrorCode(
        () =>
          deleteTxnServer({
            context,
            projectId: sourceProjectId,
            txnId: reversalTxnId,
          }),
        'CONFLICT',
        'matched reversal counterpart cannot be deleted independently'
      );

      const reversalAuditEvents = auditLogs.filter(
        (event) =>
          event.category === 'audit' &&
          event.projectId === sourceProjectId &&
          event.entityType === 'txn_reversal'
      );
      assert.deepEqual(
        reversalAuditEvents.map((event) => event.type),
        ['txn_reversal.pending_created', 'txn_reversal.matched_manually']
      );

      const matchedPairsPage = await listTransactionsPageServer({
        context,
        projectId: sourceProjectId,
        input: {
          pageIndex: 0,
          pageSize: 10,
          transactionView: 'matched-reversal-pairs',
        },
      });
      assert.deepEqual(
        new Set(matchedPairsPage.rows.map((row) => row.id)),
        new Set([sourceTxnId, reversalTxnId])
      );

      const commentsAfterMatch = await db
        .selectFrom('txn_comments')
        .select([
          'txn_public_id',
          'body',
          'comment_origin',
          'resolved_at',
          'resolved_by_user_id',
        ])
        .where('project_id', '=', sourceProjectId)
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      assert.deepEqual(
        commentsAfterMatch.map((row) => ({
          txnId: row.txn_public_id,
          body: row.body,
          origin: row.comment_origin,
          closed: Boolean(row.resolved_at),
          closedBy: row.resolved_by_user_id,
        })),
        [
          {
            txnId: sourceTxnId,
            body: 'Waiting for the Power BI reversal import.',
            origin: 'reversal_workflow',
            closed: true,
            closedBy: userId,
          },
          {
            txnId: sourceTxnId,
            body: 'Matched after the refund arrived.',
            origin: 'reversal_workflow',
            closed: true,
            closedBy: userId,
          },
          {
            txnId: reversalTxnId,
            body: 'Matched after the refund arrived.',
            origin: 'reversal_workflow',
            closed: true,
            closedBy: userId,
          },
        ]
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
        .select(['txn_public_id', 'body', 'comment_origin', 'resolved_at'])
        .where('project_id', '=', sourceProjectId)
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      assert.deepEqual(
        commentsAfterUnmatch.find(
          (row) => row.body === 'Reopened for manual review.'
        ),
        {
          txn_public_id: sourceTxnId,
          body: 'Reopened for manual review.',
          comment_origin: 'reversal_workflow',
          resolved_at: null,
        }
      );
      assert.ok(commentsAfterUnmatch.every((row) => !row.body.startsWith('[')));

      const exception = await applyTxnReversalActionServer({
        context,
        projectId: sourceProjectId,
        input: {
          action: 'markException',
          txnId: sourceTxnId,
          commentBody: 'Needs a manual follow-up.',
          expectedReversalVersion: unmatched.txn.reversal?.version,
        },
      });
      assert.equal(exception.txn.reversal?.status, 'reversal_exception');

      const returnedToPending = await applyTxnReversalActionServer({
        context,
        projectId: sourceProjectId,
        input: {
          action: 'clearException',
          txnId: sourceTxnId,
          commentBody: 'Ready to search again.',
          expectedReversalVersion: exception.txn.reversal?.version,
        },
      });
      assert.equal(returnedToPending.txn.reversal?.status, 'pending_reversal');
      assert.equal(
        returnedToPending.txn.reversal?.id,
        unmatched.txn.reversal?.id
      );
      const openReversalComments = await db
        .selectFrom('txn_comments')
        .select(['body', 'resolved_at'])
        .where('project_id', '=', sourceProjectId)
        .where('txn_public_id', '=', sourceTxnId)
        .where('comment_origin', '=', 'reversal_workflow')
        .where('resolved_at', 'is', null)
        .execute();
      assert.deepEqual(openReversalComments, [
        {
          body: 'Ready to search again.',
          resolved_at: null,
        },
      ]);
    } finally {
      console.info = originalConsoleInfo;
      if (typeof originalAuditLogging === 'undefined') {
        delete process.env.PROJEX_AUDIT_LOGGING;
      } else {
        process.env.PROJEX_AUDIT_LOGGING = originalAuditLogging;
      }
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

      const budgetSummary = await listProjectTransactionSummaryServer({
        context,
        projectId,
      });
      assert.equal(budgetSummary.pendingReversalCount, 1);
      assert.equal(budgetSummary.pendingReversalCents, 0);
      assert.deepEqual(
        budgetSummary.periodSummaries.map((period) => ({
          monthKey: period.monthKey,
          pendingReversalCount: period.pendingReversalCount,
          pendingReversalCents: period.pendingReversalCents,
        })),
        [
          {
            monthKey: '2026-05',
            pendingReversalCount: 1,
            pendingReversalCents: 0,
          },
          {
            monthKey: '2026-06',
            pendingReversalCount: 0,
            pendingReversalCents: 0,
          },
        ]
      );

      const suggestedReversal = await db
        .selectFrom('txn_reversals')
        .select([
          'status',
          'source_txn_public_id',
          'matched_reversal_txn_public_id',
          'matched_at',
          'matched_by_user_id',
          'match_method',
          'match_score',
          'candidate_count',
          'match_evidence',
          'source_snapshot',
          'counterpart_snapshot',
          'version',
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
      assert.equal(suggestedReversal.match_method, 'auto_clear');
      assert.ok(suggestedReversal.match_score);
      assert.equal(suggestedReversal.candidate_count, 1);
      assert.equal(suggestedReversal.match_evidence?.amountExact, true);
      assert.equal(suggestedReversal.source_snapshot?.txnId, sourceTxnId);
      assert.equal(
        suggestedReversal.counterpart_snapshot?.txnId,
        reversalTxnId
      );

      const bulkSelection = await listTransactionsSelectionServer({
        context,
        projectId,
        input: { transactionView: 'all' },
      });
      const selectedPairRows = bulkSelection.rows.filter(
        (row) => row.reversal?.id === pendingPage.rows[0]?.reversal?.id
      );
      assert.equal(selectedPairRows.length, 2);
      assert.equal(
        new Set(selectedPairRows.map((row) => row.reversal?.id)).size,
        1
      );
      assert.ok(
        selectedPairRows.every(
          (row) =>
            row.reversal?.sourceTxn?.item === '1181853 Monthly accrual' &&
            row.reversal.counterpartTxn?.item ===
              '1181853 Monthly accrual reversal'
        )
      );

      const suggestedComments = await db
        .selectFrom('txn_comments')
        .select(['txn_public_id', 'body', 'comment_origin', 'resolved_at'])
        .where('project_id', '=', projectId)
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      assert.deepEqual(suggestedComments, [
        {
          txn_public_id: sourceTxnId,
          body: 'Expected to reverse in the next monthly EXA import.',
          comment_origin: 'reversal_workflow',
          resolved_at: null,
        },
      ]);

      await db
        .insertInto('txn_comments')
        .values({
          id: 'itest_txn_reversal_auto_comment_1',
          company_id: companyId,
          project_id: projectId,
          txn_public_id: sourceTxnId,
          parent_comment_id: null,
          body: 'Unrelated coding question.',
          assigned_to_user_id: null,
          created_by_user_id: userId,
          resolved_at: null,
          resolved_by_user_id: null,
        })
        .execute();

      await assert.rejects(
        db
          .updateTable('txns')
          .set({
            import_source_meta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 Monthly accrual',
              'CC and Description': 'CC100 Team',
              'Reference Num': 'REF-CHANGED',
            },
          })
          .where('project_id', '=', projectId)
          .where('public_id', '=', reversalTxnId)
          .executeTakeFirstOrThrow(),
        /Reversal-linked transaction identity cannot be changed/
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
        .select([
          'txn_public_id',
          'body',
          'comment_origin',
          'resolved_at',
          'resolved_by_user_id',
        ])
        .where('project_id', '=', projectId)
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      const reversalWorkflowComments = approvedComments.filter(
        (row) => row.comment_origin === 'reversal_workflow'
      );
      assert.equal(reversalWorkflowComments.length, 3);
      assert.ok(
        reversalWorkflowComments.every(
          (row) =>
            row.resolved_at !== null && row.resolved_by_user_id === userId
        )
      );
      assert.equal(
        reversalWorkflowComments.filter(
          (row) => row.body === 'Reviewed and approved after month-two import.'
        ).length,
        2
      );
      assert.ok(
        reversalWorkflowComments.every((row) => !row.body.startsWith('['))
      );
      assert.deepEqual(
        approvedComments.find(
          (row) => row.body === 'Unrelated coding question.'
        ),
        {
          txn_public_id: sourceTxnId,
          body: 'Unrelated coding question.',
          comment_origin: 'user',
          resolved_at: null,
          resolved_by_user_id: null,
        }
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'multi-month imports from arbitrary same-source systems reconcile when pending is marked later',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_txn_reconcile_co_1');
    const userId = asUserId('itest_txn_reconcile_usr_1');
    const projectId = asProjectId('itest_txn_reconcile_prj_1');
    const sourceTxnAId = asTxnId('itest_txn_reconcile_source_1');
    const sourceTxnBId = asTxnId('itest_txn_reconcile_source_2');
    const counterpartTxnAId = asTxnId('itest_txn_reconcile_counterpart_1');
    const counterpartTxnBId = asTxnId('itest_txn_reconcile_counterpart_2');
    const earlierCounterpartTxnId = asTxnId(
      'itest_txn_reconcile_counterpart_earlier'
    );
    const context = { session: { userId } };

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Txn Reconciliation Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'txn-reconcile@example.com',
          name: 'Txn Reconciliation Lead',
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
          name: 'Reconciliation Project',
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

      const imported = await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        txns: [
          {
            id: earlierCounterpartTxnId,
            externalId: 'RECONCILE-A-APRIL',
            companyId,
            projectId,
            date: '2026-04-20',
            item: 'Earlier May accrual A credit',
            description: 'Earlier May accrual A credit',
            amountCents: -12500,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'CUSTOMER_LEDGER_V2',
              'Journal Line Description': 'May accrual A',
              'CC and Description': 'CC100 Team',
              'Reference Num': 'REF-A',
            },
          },
          {
            id: sourceTxnAId,
            externalId: 'RECONCILE-A-MAY',
            companyId,
            projectId,
            date: '2026-05-20',
            item: 'May accrual A',
            description: 'May accrual A',
            amountCents: 12500,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'CUSTOMER_LEDGER_V2',
              'Journal Line Description': 'May accrual A',
              'CC and Description': 'CC100 Team',
              'Reference Num': 'REF-A',
            },
          },
          {
            id: counterpartTxnAId,
            externalId: 'RECONCILE-A-JUNE',
            companyId,
            projectId,
            date: '2026-06-20',
            item: 'May accrual A reversal',
            description: 'May accrual A reversal',
            amountCents: -12500,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'CUSTOMER_LEDGER_V2',
              'Journal Line Description': 'May accrual A',
              'CC and Description': 'CC100 Team',
              'Reference Num': 'REF-A',
            },
          },
          {
            id: sourceTxnBId,
            externalId: 'RECONCILE-B-MAY',
            companyId,
            projectId,
            date: '2026-05-25',
            item: 'May accrual B',
            description: 'May accrual B',
            amountCents: 9900,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'CUSTOMER_LEDGER_V2',
              'Journal Line Description': 'May accrual B',
              'CC and Description': 'CC200 Team',
              'Reference Num': 'REF-B',
            },
          },
          {
            id: counterpartTxnBId,
            externalId: 'RECONCILE-B-JUNE',
            companyId,
            projectId,
            date: '2026-06-25',
            item: 'May accrual B reversal',
            description: 'May accrual B reversal',
            amountCents: -9900,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'CUSTOMER_LEDGER_V2',
              'Journal Line Description': 'May accrual B',
              'CC and Description': 'CC200 Team',
              'Reference Num': 'REF-B',
            },
          },
        ],
      });
      assert.equal(imported.count, 5);

      const markedAfterImport = await applyTxnReversalActionServer({
        context,
        projectId,
        input: {
          action: 'markPending',
          txnId: sourceTxnAId,
          commentBody: 'Marked after the multi-month import.',
        },
      });
      assert.equal(
        markedAfterImport.txn.reversal?.status,
        'auto_matched_pending_approval'
      );
      assert.equal(
        markedAfterImport.txn.reversal?.counterpartTxnId,
        counterpartTxnAId
      );

      const now = new Date().toISOString();
      await db
        .insertInto('txn_reversals')
        .values({
          id: 'itest_txn_reconcile_workflow_2',
          company_id: companyId,
          project_id: projectId,
          source_txn_public_id: sourceTxnBId,
          matched_reversal_txn_public_id: null,
          expected_project_id: null,
          status: 'pending_reversal',
          marked_at: now,
          marked_by_user_id: userId,
          matched_at: null,
          matched_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const recovered = await bulkTxnActionServer({
        context,
        projectId,
        input: { action: 'reconcilePendingReversals' },
      });
      assert.equal(recovered.requestedCount, 2);
      assert.equal(recovered.updatedCount, 1);

      const recoveredRow = await db
        .selectFrom('txn_reversals')
        .select(['status', 'matched_reversal_txn_public_id'])
        .where('project_id', '=', projectId)
        .where('source_txn_public_id', '=', sourceTxnBId)
        .executeTakeFirstOrThrow();
      assert.equal(recoveredRow.status, 'auto_matched_pending_approval');
      assert.equal(
        recoveredRow.matched_reversal_txn_public_id,
        counterpartTxnBId
      );
      const suggestionCommentCountBefore = await db
        .selectFrom('txn_comments')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('project_id', '=', projectId)
        .executeTakeFirstOrThrow();
      const repeatedRecovery = await bulkTxnActionServer({
        context,
        projectId,
        input: { action: 'reconcilePendingReversals' },
      });
      assert.equal(repeatedRecovery.requestedCount, 2);
      assert.equal(repeatedRecovery.updatedCount, 0);
      const suggestionCommentCountAfter = await db
        .selectFrom('txn_comments')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('project_id', '=', projectId)
        .executeTakeFirstOrThrow();
      assert.equal(
        Number(suggestionCommentCountAfter.count),
        Number(suggestionCommentCountBefore.count)
      );

      const rejected = await applyTxnReversalActionServer({
        context,
        projectId,
        input: {
          action: 'rejectSuggestedMatch',
          txnId: sourceTxnAId,
        },
      });
      assert.equal(rejected.txn.reversal?.status, 'pending_reversal');

      const rerun = await bulkTxnActionServer({
        context,
        projectId,
        input: { action: 'reconcilePendingReversals' },
      });
      assert.equal(rerun.requestedCount, 2);
      assert.equal(rerun.updatedCount, 0);

      const rejection = await db
        .selectFrom('txn_reversal_match_rejections')
        .select(['source_txn_public_id', 'counterpart_txn_public_id'])
        .where('project_id', '=', projectId)
        .where('source_txn_public_id', '=', sourceTxnAId)
        .executeTakeFirstOrThrow();
      assert.equal(rejection.counterpart_txn_public_id, counterpartTxnAId);
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
        .select([
          'txn_public_id',
          'body',
          'comment_origin',
          'resolved_at',
          'resolved_by_user_id',
        ])
        .where('project_id', '=', projectId)
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      assert.deepEqual(
        rejectedComments.map((row) => ({
          txnId: row.txn_public_id,
          body: row.body,
          origin: row.comment_origin,
          closed: Boolean(row.resolved_at),
          closedBy: row.resolved_by_user_id,
        })),
        [
          {
            txnId: sourceTxnId,
            body: 'Waiting for the next import to confirm the reversal.',
            origin: 'reversal_workflow',
            closed: true,
            closedBy: userId,
          },
          {
            txnId: sourceTxnId,
            body: 'Leaving this one for manual confirmation.',
            origin: 'reversal_workflow',
            closed: false,
            closedBy: null,
          },
        ]
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'bulk approval can approve selected suggested reversal matches',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_txn_reversal_bulk_approve_co_1');
    const userId = asUserId('itest_txn_reversal_bulk_approve_usr_1');
    const projectId = asProjectId('itest_txn_reversal_bulk_approve_prj_1');
    const sourceTxnAId = asTxnId('itest_txn_reversal_bulk_approve_txn_1');
    const sourceTxnBId = asTxnId('itest_txn_reversal_bulk_approve_txn_2');
    const reversalTxnAId = asTxnId('itest_txn_reversal_bulk_approve_txn_3');
    const reversalTxnBId = asTxnId('itest_txn_reversal_bulk_approve_txn_4');
    const context = { session: { userId } };

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Txn Reversal Bulk Approve Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'txn-reversal-bulk-approve@example.com',
          name: 'Txn Reversal Bulk Approve Lead',
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
          name: 'Bulk Approve Project',
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
            externalId: 'BULK-REV-1',
            companyId,
            projectId,
            date: '2026-05-30',
            item: '1181853 Source A',
            description:
              '1181853 Source A | CC100 Team | Source: EXA | Reference: REF-A',
            amountCents: 12500,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 Source A',
              'CC and Description': 'CC100 Team',
              'Reference Num': 'REF-A',
            },
          },
          {
            id: sourceTxnBId,
            externalId: 'BULK-REV-2',
            companyId,
            projectId,
            date: '2026-05-30',
            item: '1181853 Source B',
            description:
              '1181853 Source B | CC200 Team | Source: EXA | Reference: REF-B',
            amountCents: 13000,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 Source B',
              'CC and Description': 'CC200 Team',
              'Reference Num': 'REF-B',
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
          commentBody: 'Pending A',
        },
      });
      await applyTxnReversalActionServer({
        context,
        projectId,
        input: {
          action: 'markPending',
          txnId: sourceTxnBId,
          commentBody: 'Pending B',
        },
      });
      await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        txns: [
          {
            id: reversalTxnAId,
            externalId: 'BULK-REV-3',
            companyId,
            projectId,
            date: '2026-06-28',
            item: '1181853 Reversal A',
            description:
              '1181853 Source A | CC100 Team | Source: EXA | Reference: REF-A',
            amountCents: -12500,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 Source A',
              'CC and Description': 'CC100 Team',
              'Reference Num': 'REF-A',
            },
          },
          {
            id: reversalTxnBId,
            externalId: 'BULK-REV-4',
            companyId,
            projectId,
            date: '2026-06-28',
            item: '1181853 Reversal B',
            description:
              '1181853 Source B | CC200 Team | Source: EXA | Reference: REF-B',
            amountCents: -13000,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 Source B',
              'CC and Description': 'CC200 Team',
              'Reference Num': 'REF-B',
            },
          },
        ],
      });

      const bulkResult = await bulkTxnActionServer({
        context,
        projectId,
        input: {
          action: 'approveSuggestedReversals',
          txnIds: [sourceTxnAId, sourceTxnBId],
        },
      });
      assert.equal(bulkResult.updatedCount, 2);
      assert.equal(bulkResult.lockedCount, 0);
      assert.equal(bulkResult.ineligibleCount, 0);

      const reversals = await db
        .selectFrom('txn_reversals')
        .select([
          'source_txn_public_id',
          'matched_reversal_txn_public_id',
          'status',
          'matched_at',
          'matched_by_user_id',
        ])
        .where('project_id', '=', projectId)
        .orderBy('source_txn_public_id', 'asc')
        .execute();
      const reversalBySourceTxnId = new Map(
        reversals.map((row) => [row.source_txn_public_id, row] as const)
      );
      assert.equal(
        reversalBySourceTxnId.get(sourceTxnAId)?.status,
        'reversed_matched'
      );
      assert.equal(
        reversalBySourceTxnId.get(sourceTxnBId)?.status,
        'reversed_matched'
      );
      assert.ok(reversalBySourceTxnId.get(sourceTxnAId)?.matched_at);
      assert.ok(reversalBySourceTxnId.get(sourceTxnBId)?.matched_at);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

test(
  'ambiguous EXA reversal imports default to reviewable matches that can be bulk approved',
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
      const pendingByTxnId = new Map(
        pendingPage.rows.map((row) => [row.id, row] as const)
      );
      assert.equal(
        pendingByTxnId.get(sourceTxnAId)?.reversal?.status,
        'auto_matched_ambiguous_pending_approval'
      );
      assert.equal(
        pendingByTxnId.get(sourceTxnAId)?.reversal?.counterpartTxnId,
        reversalTxnAId
      );
      assert.equal(
        pendingByTxnId.get(sourceTxnBId)?.reversal?.status,
        'auto_matched_ambiguous_pending_approval'
      );
      assert.equal(
        pendingByTxnId.get(sourceTxnBId)?.reversal?.counterpartTxnId,
        reversalTxnBId
      );

      const reviewComments = await db
        .selectFrom('txn_comments')
        .select(['txn_public_id', 'body', 'comment_origin', 'resolved_at'])
        .where('project_id', '=', projectId)
        .where('txn_public_id', 'in', [sourceTxnAId, sourceTxnBId])
        .orderBy('txn_public_id', 'asc')
        .orderBy('created_at', 'asc')
        .execute();
      assert.deepEqual(
        reviewComments.map((row) => ({
          body: row.body,
          origin: row.comment_origin,
          closed: Boolean(row.resolved_at),
        })),
        [
          {
            body: 'Pending reversal A.',
            origin: 'reversal_workflow',
            closed: false,
          },
          {
            body: 'Pending reversal B.',
            origin: 'reversal_workflow',
            closed: false,
          },
        ]
      );

      await assert.rejects(
        db
          .updateTable('txns')
          .set({ amount_cents: -123595 })
          .where('project_id', '=', projectId)
          .where('public_id', '=', reversalTxnBId)
          .executeTakeFirst(),
        /Reversal-linked transaction identity cannot be changed/
      );

      const suggestedPairRows = await db
        .selectFrom('txn_reversals')
        .select('id')
        .where('project_id', '=', projectId)
        .where('source_txn_public_id', 'in', [sourceTxnAId, sourceTxnBId])
        .orderBy('id', 'asc')
        .execute();
      const bulkResult = await bulkTxnActionServer({
        context,
        projectId,
        input: {
          action: 'approveSuggestedReversals',
          reversalIds: suggestedPairRows.map((row) => row.id),
        },
      });
      assert.equal(bulkResult.updatedCount, 2);
      assert.equal(bulkResult.lockedCount, 0);
      assert.equal(bulkResult.ineligibleCount, 0);

      const approvedReversals = await db
        .selectFrom('txn_reversals')
        .select(['source_txn_public_id', 'status'])
        .where('project_id', '=', projectId)
        .execute();
      const approvedByTxnId = new Map(
        approvedReversals.map((row) => [row.source_txn_public_id, row] as const)
      );
      assert.equal(
        approvedByTxnId.get(sourceTxnAId)?.status,
        'reversed_matched'
      );
      assert.equal(
        approvedByTxnId.get(sourceTxnBId)?.status,
        'reversed_matched'
      );
      const closedBulkReviewComments = await db
        .selectFrom('txn_comments')
        .select(['comment_origin', 'resolved_at', 'resolved_by_user_id'])
        .where('project_id', '=', projectId)
        .where('txn_public_id', 'in', [sourceTxnAId, sourceTxnBId])
        .execute();
      assert.ok(
        closedBulkReviewComments.every(
          (row) =>
            row.comment_origin === 'reversal_workflow' &&
            row.resolved_at !== null &&
            row.resolved_by_user_id === userId
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
  'needs-review view combines coding approvals and reversal review workflows',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_txn_needs_review_co_1');
    const userId = asUserId('itest_txn_needs_review_usr_1');
    const projectId = asProjectId('itest_txn_needs_review_prj_1');
    const categoryId = asCategoryId('itest_txn_needs_review_cat_1');
    const subCategoryId = asSubCategoryId('itest_txn_needs_review_sub_1');
    const codingTxnId = asTxnId('itest_txn_needs_review_txn_1');
    const pendingSourceTxnId = asTxnId('itest_txn_needs_review_txn_2');
    const reversalTxnId = asTxnId('itest_txn_needs_review_txn_3');
    const exceptionSourceTxnId = asTxnId('itest_txn_needs_review_txn_4');
    const exceptionReversalTxnAId = asTxnId('itest_txn_needs_review_txn_5');
    const exceptionReversalTxnBId = asTxnId('itest_txn_needs_review_txn_6');
    const now = new Date().toISOString();
    const context = { session: { userId } };

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();

      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Txn Needs Review Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'txn-needs-review@example.com',
          name: 'Txn Needs Review Lead',
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
          name: 'Needs Review Project',
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
          name: 'Services',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('txns')
        .values({
          public_id: codingTxnId,
          external_id: 'itest-txn-needs-review-ext-1',
          company_id: companyId,
          project_id: projectId,
          txn_date: '2026-06-01',
          item: 'Coding pending',
          description: 'Auto-coded and awaiting approval',
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
          category_id: categoryId,
          sub_category_id: subCategoryId,
          company_default_mapping_rule_id: null,
          coding_source: 'project_rule',
          coding_pending_approval: true,
          reviewed_at: null,
          reviewed_by_user_id: null,
          locked_at: null,
          locked_by_user_id: null,
          created_at: now,
          updated_at: now,
        })
        .execute();

      await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        txns: [
          {
            id: pendingSourceTxnId,
            externalId: 'NEEDS-REVIEW-EXA-1',
            companyId,
            projectId,
            date: '2026-05-30',
            item: '1181853 Monthly accrual',
            description:
              '1181853 Monthly accrual | CC100 Team | Source: EXA | Reference: REF-ONE',
            amountCents: 12500,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 Monthly accrual',
              'CC and Description': 'CC100 Team',
              'Reference Num': 'REF-ONE',
            },
          },
          {
            id: exceptionSourceTxnId,
            externalId: 'NEEDS-REVIEW-EXA-2',
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
          txnId: pendingSourceTxnId,
          commentBody: 'Waiting for matching June reversal.',
        },
      });
      await applyTxnReversalActionServer({
        context,
        projectId,
        input: {
          action: 'markPending',
          txnId: exceptionSourceTxnId,
          commentBody: 'Ambiguous reversal expected.',
        },
      });

      await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        txns: [
          {
            id: reversalTxnId,
            externalId: 'NEEDS-REVIEW-EXA-3',
            companyId,
            projectId,
            date: '2026-06-28',
            item: '1181853 Monthly accrual reversal',
            description:
              '1181853 Monthly accrual | CC100 Team | Source: EXA | Reference: REF-ONE',
            amountCents: -12500,
            importSourceType: 'powerbi_expenditure_actuals',
            importSourceMeta: {
              Source: 'EXA',
              'Journal Line Description': '1181853 Monthly accrual',
              'CC and Description': 'CC100 Team',
              'Reference Num': 'REF-ONE',
            },
          },
          {
            id: exceptionReversalTxnAId,
            externalId: 'NEEDS-REVIEW-EXA-4',
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
            id: exceptionReversalTxnBId,
            externalId: 'NEEDS-REVIEW-EXA-5',
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

      const reviewPage = await listTransactionsPageServer({
        context,
        projectId,
        input: {
          pageIndex: 0,
          pageSize: 20,
          transactionView: 'needs-review',
        },
      });
      assert.deepEqual(
        new Set(reviewPage.rows.map((row) => row.id)),
        new Set([codingTxnId, pendingSourceTxnId, exceptionSourceTxnId])
      );
      assert.equal(reviewPage.rows.length, 3);
      assert.equal(reviewPage.summary.totalCount, 3);
      assert.equal(reviewPage.summary.codingApprovalCount, 1);
      assert.equal(reviewPage.summary.reversalReviewCount, 2);
      assert.equal(reviewPage.summary.reversalMatchReviewCount, 2);
      assert.equal(reviewPage.summary.awaitingReversalCount, 0);
      assert.ok(
        reviewPage.rows.some(
          (row) => row.id === codingTxnId && row.codingPendingApproval
        )
      );
      assert.ok(
        reviewPage.rows.some(
          (row) =>
            row.id === pendingSourceTxnId &&
            row.reversal?.status === 'auto_matched_pending_approval'
        )
      );
      assert.ok(
        reviewPage.rows.some(
          (row) =>
            row.id === exceptionSourceTxnId &&
            row.reversal?.status === 'auto_matched_ambiguous_pending_approval'
        )
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  importTransactionsServer,
  previewImportTransactionsServer,
} from '../src/server/fns/transactions.ts';
import {
  asCategoryId,
  asCompanyId,
  asImportRuleId,
  asProjectAutoCodingRuleId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
  asUserId,
} from '../src/types/index.ts';
import {
  assertAppError,
  createIntegrationDb,
  integrationDatabaseUrl,
} from './dbIntegration.helpers.ts';

const csvHeader =
  'Ledger,Fiscal Year,Period,CC and Description,RC and Description,PC and Description,AC,Expenditure Actuals,Journal Line Description,Journal ID,Reference Num,Journal Date,Journal Line,Journal Line Ref,Posted Date,Unpost Seq,Source,Operator ID,PO ID,Vendor ID,Vendor Name';

function csvRow(args: {
  description: string;
  journalId: string;
  line: string;
  source: string;
}) {
  return `ACTUALS,2026,5,4041 Operations,Research Centre,Programme Code,EXP,125.00,${args.description},${args.journalId},REF-${args.line},2026-05-01,${args.line},A,2026-05-02,0,${args.source},OP-1,,,`;
}

test(
  'import preview review decisions are blocking, audited, and forced uncoded',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_import_review_co_1');
    const userId = asUserId('itest_import_review_usr_1');
    const projectId = asProjectId('itest_import_review_prj_1');
    const categoryId = asCategoryId('itest_import_review_cat_1');
    const subCategoryId = asSubCategoryId('itest_import_review_sub_1');
    const importRuleId = asImportRuleId('itest_import_review_rule_1');
    const autoCodingRuleId = asProjectAutoCodingRuleId(
      'itest_import_review_auto_rule_1'
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
          name: 'Import Review Decisions Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values({
          id: userId,
          email: 'import-review-decisions@example.com',
          name: 'Import Review Lead',
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
          name: 'Import Review Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 100_000,
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
          name: 'Payroll',
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('project_auto_coding_rules')
        .values({
          id: autoCodingRuleId,
          company_id: companyId,
          project_id: projectId,
          match_text: 'salary transfer',
          category_id: categoryId,
          sub_category_id: subCategoryId,
          origin_scope: 'project',
          origin_company_item_id: null,
          sync_status: 'local',
          last_synced_at: now,
          source_updated_at_snapshot: null,
          sort_order: 10,
          created_by_user_id: userId,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await db
        .insertInto('import_rules')
        .values({
          id: importRuleId,
          company_id: companyId,
          project_id: projectId,
          name: 'Review REV source',
          origin_scope: 'project',
          origin_company_item_id: null,
          sync_status: 'local',
          last_synced_at: now,
          source_updated_at_snapshot: null,
          action: 'review',
          field: 'source',
          operator: 'equals',
          value: 'REV',
          sort_order: 1,
          enabled: true,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const preview = await previewImportTransactionsServer({
        context,
        projectId,
        csvText: [
          csvHeader,
          csvRow({
            description: 'Salary transfer for review',
            journalId: 'REVIEW-1',
            line: '1',
            source: 'REV',
          }),
          csvRow({
            description: 'Ordinary project expense',
            journalId: 'IMPORT-1',
            line: '2',
            source: 'EXA',
          }),
        ].join('\n'),
      });
      const previewBatchId = preview.importBatchId;
      assert.ok(previewBatchId);
      const reviewRow = preview.rows.find(
        (row) => row.importAction === 'review'
      );
      const ordinaryRow = preview.rows.find(
        (row) => row.importAction === 'import'
      );
      assert.ok(reviewRow);
      assert.ok(ordinaryRow);

      // The response object is browser-owned. Mutating it must not alter the
      // canonical row persisted by preview.
      ordinaryRow.amountCents = 999_999_99;

      await assertAppError(
        () =>
          importTransactionsServer({
            context,
            projectId,
            mode: 'append',
            importBatchId: previewBatchId,
          }),
        'CONFLICT',
        'Resolve every review row before committing the import'
      );

      const reviewedTxnId = asTxnId(reviewRow.importId);
      const result = await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        importBatchId: previewBatchId,
        reviewDecisions: [
          {
            previewImportId: reviewedTxnId,
            decision: 'import_uncoded',
          },
        ],
      });
      assert.equal(result.count, 2);

      const importedOrdinaryTxn = await db
        .selectFrom('txns')
        .select('amount_cents')
        .where('public_id', '=', ordinaryRow.importId)
        .executeTakeFirstOrThrow();
      assert.equal(Number(importedOrdinaryTxn.amount_cents), 12_500);

      const importedReviewTxn = await db
        .selectFrom('txns')
        .select([
          'category_id',
          'sub_category_id',
          'coding_source',
          'coding_pending_approval',
        ])
        .where('public_id', '=', reviewedTxnId)
        .executeTakeFirstOrThrow();
      assert.equal(importedReviewTxn.category_id, null);
      assert.equal(importedReviewTxn.sub_category_id, null);
      assert.equal(importedReviewTxn.coding_source, null);
      assert.equal(importedReviewTxn.coding_pending_approval, false);

      const importedBatch = await db
        .selectFrom('txns')
        .select('import_batch_id')
        .where('public_id', '=', reviewedTxnId)
        .executeTakeFirstOrThrow();
      assert.equal(importedBatch.import_batch_id, previewBatchId);

      const reviewCandidate = await db
        .selectFrom('import_candidates')
        .select(['status', 'reviewed_by_user_id', 'reviewed_at'])
        .where('batch_id', '=', previewBatchId)
        .where('preview_import_id', '=', reviewedTxnId)
        .executeTakeFirstOrThrow();
      assert.equal(reviewCandidate.status, 'imported');
      assert.equal(reviewCandidate.reviewed_by_user_id, userId);
      assert.ok(reviewCandidate.reviewed_at);

      const batch = await db
        .selectFrom('import_batches')
        .select('status')
        .where('id', '=', previewBatchId)
        .executeTakeFirstOrThrow();
      assert.equal(batch.status, 'imported');

      await assertAppError(
        () =>
          importTransactionsServer({
            context,
            projectId,
            mode: 'append',
            importBatchId: previewBatchId,
            reviewDecisions: [
              {
                previewImportId: reviewedTxnId,
                decision: 'import_uncoded',
              },
            ],
          }),
        'CONFLICT',
        'This import preview was already committed'
      );

      const excludedPreview = await previewImportTransactionsServer({
        context,
        projectId,
        csvText: [
          csvHeader,
          csvRow({
            description: 'Salary transfer to exclude',
            journalId: 'REVIEW-2',
            line: '3',
            source: 'REV',
          }),
        ].join('\n'),
      });
      assert.ok(excludedPreview.importBatchId);
      const excludedRow = excludedPreview.rows[0];
      assert.ok(excludedRow);
      const excludedId = asTxnId(excludedRow.importId);

      const excludedResult = await importTransactionsServer({
        context,
        projectId,
        mode: 'append',
        importBatchId: excludedPreview.importBatchId,
        excludedImportIds: [excludedId],
        reviewDecisions: [{ previewImportId: excludedId, decision: 'exclude' }],
      });
      assert.equal(excludedResult.count, 0);

      const excludedCandidate = await db
        .selectFrom('import_candidates')
        .select(['status', 'reviewed_by_user_id', 'reviewed_at'])
        .where('batch_id', '=', excludedPreview.importBatchId)
        .executeTakeFirstOrThrow();
      assert.equal(excludedCandidate.status, 'excluded');
      assert.equal(excludedCandidate.reviewed_by_user_id, userId);
      assert.ok(excludedCandidate.reviewed_at);
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db.deleteFrom('users').where('id', '=', userId).execute();
      await db.destroy();
    }
  }
);

import assert from 'node:assert/strict';
import { test } from 'vitest';

import { AppError } from '../src/api/errors.ts';
import {
  createImportRuleInputSchema,
  splitTxnInputSchema,
  txnBulkActionInputSchema,
  txnListPageQuerySchema,
  txnListSelectionQuerySchema,
  txnImportInputSchema,
  txnImportPreviewInputSchema,
} from '../src/validation/apiSchemas.ts';
import { persistedImportPreviewRowSchema } from '../src/validation/importPreviewSchemas.ts';
import { planImportPreview } from '../src/utils/importPreviewPlan.ts';
import {
  MAX_IMPORT_PREVIEW_CSV_TEXT_LENGTH,
  MAX_IMPORT_PREVIEW_ROW_COUNT,
  MAX_IMPORT_TXN_COUNT,
} from '../src/utils/importLimits.ts';
import { MAX_BULK_TXN_COUNT } from '../src/utils/transactionLimits.ts';
test('transaction import schema limits the number of row decisions', () => {
  const result = txnImportInputSchema.safeParse({
    mode: 'append',
    importBatchId: 'impb_1',
    excludedSourceRowIndexes: Array.from(
      { length: MAX_IMPORT_TXN_COUNT + 1 },
      (_, index) => index + 1
    ),
  });
  assert.equal(result.success, false);
});

test('transaction import schema requires a preview batch for review decisions', () => {
  const result = txnImportInputSchema.safeParse({
    mode: 'append',
    reviewDecisions: [{ sourceRowIndex: 1, decision: 'exclude' }],
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.issues[0]?.path[0], 'importBatchId');
});

test('transaction import schema accepts an uncoded review decision', () => {
  const result = txnImportInputSchema.safeParse({
    mode: 'append',
    importBatchId: 'impb_1',
    reviewDecisions: [{ sourceRowIndex: 1, decision: 'import_uncoded' }],
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.importBatchId, 'impb_1');
});

test('transaction import commit rejects client-supplied transaction data', () => {
  const result = txnImportInputSchema.safeParse({
    mode: 'append',
    importBatchId: 'impb_1',
    txns: [
      {
        id: 'txn_tampered_1',
        date: '2026-05-01',
        amountCents: 999_999_99,
      },
    ],
  });

  assert.equal(result.success, false);
});

test('persisted import preview schema validates the canonical financial plan', () => {
  const valid = persistedImportPreviewRowSchema.safeParse({
    sourceRowIndex: 1,
    importId: 'txn_preview_1',
    parsedDate: '2026-05-01',
    amountCents: 12_500,
    item: 'Salary transfer',
    description: 'Canonical preview row',
    duplicate: false,
    importAction: 'import',
    mappingStatus: 'uncoded',
    codingPendingApproval: false,
    willCreateCategory: false,
    willCreateSubCategory: false,
    willCreateBudgetLine: false,
    sourceType: 'powerbi_expenditure_actuals',
    rawSourceRow: { Source: 'EXA' },
    warnings: [],
  });
  assert.equal(valid.success, true);
  if (!valid.success) return;

  const tampered = persistedImportPreviewRowSchema.safeParse({
    ...valid.data,
    amountCents: 125.5,
  });
  assert.equal(tampered.success, false);
});

test('transaction import preview schema limits CSV payload size', () => {
  const result = txnImportPreviewInputSchema.safeParse({
    csvText: 'a'.repeat(MAX_IMPORT_PREVIEW_CSV_TEXT_LENGTH + 1),
  });
  assert.equal(result.success, false);
});

test('import preview planning rejects CSVs with too many rows', () => {
  const header =
    'Ledger,Fiscal Year,Period,CC and Description,RC and Description,PC and Description,AC,Expenditure Actuals,Journal Line Description,Journal ID,Reference Num,Journal Date,Journal Line,Journal Line Ref,Posted Date,Unpost Seq,Source,Operator ID,PO ID,Vendor ID,Vendor Name';
  const row =
    'ACTUALS,2026,4,4041 Upskilling,Research Centre,Programme Code,EXP,125.00,Flight Sydney to Melbourne,JRNL-100,REF-1,2026-05-01,12,A,2026-05-02,0,EXP,OP-1,PO-44,VEN-10,Flight Vendor';

  assert.throws(
    () =>
      planImportPreview({
        csvText: [header]
          .concat(
            Array.from({ length: MAX_IMPORT_PREVIEW_ROW_COUNT + 1 }, () => row)
          )
          .join('\n'),
        existingTransactions: [],
        categories: [],
        subCategories: [],
        budgets: [],
        autoCreateStructures: false,
        canEditTaxonomy: false,
        canEditBudgets: false,
      }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.match(error.message, /limited to/);
      return true;
    }
  );
});

test('transaction import preview schema accepts a header-only payload but server planning rejects empty rows later', () => {
  const result = txnImportPreviewInputSchema.safeParse({
    csvText:
      'Ledger,Fiscal Year,Period,CC and Description,RC and Description,PC and Description,AC,Expenditure Actuals,Journal Line Description,Journal ID,Reference Num,Journal Date,Journal Line,Journal Line Ref,Posted Date,Unpost Seq,Source,Operator ID,PO ID,Vendor ID,Vendor Name',
  });
  assert.equal(result.success, true);
});

test('transaction list page query schema coerces pagination and validates supported filters', () => {
  const result = txnListPageQuerySchema.safeParse({
    mode: 'page',
    pageIndex: '2',
    pageSize: '25',
    sortField: 'amountCents',
    sortDirection: 'asc',
    yearFilter: '2026',
    quarterFilter: 'Q2',
    transactionView: 'assigned-to-me',
    search: 'supplier reference',
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.pageIndex, 2);
  assert.equal(result.data.pageSize, 25);
  assert.equal(result.data.search, 'supplier reference');
  assert.equal(
    txnListPageQuerySchema.safeParse({
      mode: 'page',
      search: 'x'.repeat(201),
    }).success,
    false
  );
});

test('import rule schema enforces company/project scope consistency', () => {
  assert.equal(
    createImportRuleInputSchema.safeParse({
      companyId: 'co_1',
      projectId: 'prj_1',
      scope: 'company',
      name: 'Rule',
      action: 'exclude',
      field: 'source',
      operator: 'equals',
      value: 'SAL',
      sortOrder: 0,
      enabled: true,
    }).success,
    false
  );

  assert.equal(
    createImportRuleInputSchema.safeParse({
      companyId: 'co_1',
      scope: 'project',
      name: 'Rule',
      action: 'exclude',
      field: 'source',
      operator: 'equals',
      value: 'SAL',
      sortOrder: 0,
      enabled: true,
    }).success,
    false
  );
});

test('split transaction schema rejects zero-value children and bulk actions reject duplicate transaction ids', () => {
  assert.equal(
    splitTxnInputSchema.safeParse({
      txnId: 'txn_1',
      children: [{ amountCents: 0 }, { amountCents: 100 }],
    }).success,
    false
  );

  assert.equal(
    txnBulkActionInputSchema.safeParse({
      action: 'approveAutoMappings',
      txnIds: ['txn_1', 'txn_1'],
    }).success,
    false
  );

  assert.equal(
    txnBulkActionInputSchema.safeParse({
      action: 'recode',
      txnIds: ['txn_1'],
      categoryId: 'cat_1',
      subCategoryId: 'sub_1',
    }).success,
    true
  );

  assert.equal(
    txnBulkActionInputSchema.safeParse({
      action: 'approveSuggestedReversals',
      txnIds: ['txn_1'],
    }).success,
    true
  );
  assert.equal(
    txnBulkActionInputSchema.safeParse({
      action: 'approveSuggestedReversals',
      reversalIds: ['txnr_1', 'txnr_2'],
    }).success,
    true
  );
  assert.equal(
    txnBulkActionInputSchema.safeParse({
      action: 'approveSuggestedReversals',
    }).success,
    false
  );

  assert.equal(
    txnBulkActionInputSchema.safeParse({
      action: 'approveAllAutoMappings',
    }).success,
    true
  );

  assert.equal(
    txnBulkActionInputSchema.safeParse({
      action: 'reconcilePendingReversals',
    }).success,
    true
  );

  assert.equal(
    txnBulkActionInputSchema.safeParse({
      action: 'delete',
      txnIds: ['txn_1'],
    }).success,
    true
  );
});

test('transaction selection schema preserves filters and bulk actions enforce the selection limit', () => {
  const selection = txnListSelectionQuerySchema.safeParse({
    mode: 'selection',
    yearFilter: '2026',
    transactionView: 'needs-review',
    sortField: 'date',
    sortDirection: 'asc',
  });
  assert.equal(selection.success, true);
  assert.deepEqual(selection.data?.sortField, 'date');
  assert.deepEqual(selection.data?.sortDirection, 'asc');

  const oversizedSelection = Array.from(
    { length: MAX_BULK_TXN_COUNT + 1 },
    (_, index) => `txn_${index}`
  );
  assert.equal(
    txnBulkActionInputSchema.safeParse({
      action: 'setReviewed',
      txnIds: oversizedSelection,
      reviewed: true,
    }).success,
    false
  );
});

test('company export query schema rejects inverted date ranges', async () => {
  const { companyExportQuerySchema } =
    await import('../src/validation/apiSchemas.ts');
  assert.equal(
    companyExportQuerySchema.safeParse({
      from: '2026-07-01',
      to: '2026-06-01',
    }).success,
    false
  );
});

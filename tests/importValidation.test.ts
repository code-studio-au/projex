import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../src/api/errors.ts';
import {
  txnListPageQuerySchema,
  txnImportInputSchema,
  txnImportPreviewInputSchema,
} from '../src/validation/apiSchemas.ts';
import { planImportPreview } from '../src/utils/importPreviewPlan.ts';
import {
  MAX_IMPORT_PREVIEW_CSV_TEXT_LENGTH,
  MAX_IMPORT_PREVIEW_ROW_COUNT,
  MAX_IMPORT_TXN_COUNT,
} from '../src/utils/importLimits.ts';
import { asCompanyId, asProjectId, asTxnId } from '../src/types/index.ts';

test('transaction import schema limits the number of imported transactions', () => {
  const companyId = asCompanyId('co_1');
  const projectId = asProjectId('prj_1');
  const txns = Array.from({ length: MAX_IMPORT_TXN_COUNT + 1 }, (_, index) => ({
    id: asTxnId(`txn_${index}`),
    companyId,
    projectId,
    date: '2026-05-01',
    item: `Item ${index}`,
    description: 'Imported row',
    amountCents: 100,
  }));

  const result = txnImportInputSchema.safeParse({
    txns,
    mode: 'append',
  });
  assert.equal(result.success, false);
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
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.pageIndex, 2);
  assert.equal(result.data.pageSize, 25);
});

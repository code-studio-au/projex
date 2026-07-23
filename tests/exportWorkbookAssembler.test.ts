import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import ExcelJS from 'exceljs';
import { test } from 'vitest';

import { assembleCompanyWorkbook } from '../src/server/fns/exportWorkbookAssembler.ts';
import type { LoadedCompanyExportData } from '../src/server/fns/exportWorkbookData.ts';

function buildExportFixture(
  detail: 'summary' | 'full'
): LoadedCompanyExportData {
  return {
    company: {
      id: 'co_1',
      name: 'Acme Delivery',
      status: 'active',
      deactivated_at: null,
    },
    options: {
      scope: 'all',
      detail,
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    },
    isSuperadmin: false,
    projectRows: [
      {
        id: 'prog_1',
        company_id: 'co_1',
        name: 'Operations Programme',
        project_type: 'programme',
        parent_project_id: null,
        budget_total_cents: 0,
        currency: 'AUD',
        status: 'active',
        deactivated_at: null,
        visibility: 'company',
        allow_superadmin_access: true,
        sync_company_defaults: true,
        allow_txn_transfers: true,
      },
      {
        id: 'prj_1',
        company_id: 'co_1',
        name: 'Delivery Project',
        project_type: 'project',
        parent_project_id: 'prog_1',
        budget_total_cents: 250000,
        currency: 'AUD',
        status: 'active',
        deactivated_at: null,
        visibility: 'company',
        allow_superadmin_access: true,
        sync_company_defaults: true,
        allow_txn_transfers: true,
      },
    ],
    companyMembers: [
      {
        company_id: 'co_1',
        user_id: 'usr_1',
        role: 'admin',
        user_name: 'Pat Manager',
        user_email: 'pat@example.com',
        user_disabled: false,
        is_global_superadmin: false,
      },
    ],
    projectMemberships: [
      {
        project_id: 'prj_1',
        user_id: 'usr_1',
        role: 'owner',
        user_name: 'Pat Manager',
        user_email: 'pat@example.com',
      },
    ],
    categories: [
      {
        id: 'cat_1',
        company_id: 'co_1',
        project_id: 'prj_1',
        name: 'Travel',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    subCategories: [
      {
        id: 'sub_1',
        company_id: 'co_1',
        project_id: 'prj_1',
        category_id: 'cat_1',
        name: 'Flights',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    budgetLines: [
      {
        id: 'budget_1',
        company_id: 'co_1',
        project_id: 'prj_1',
        category_id: 'cat_1',
        sub_category_id: 'sub_1',
        allocated_cents: 250000,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    txns: [
      {
        id: 'internal_1',
        public_id: 'txn_1',
        external_id: 'EXT-1',
        company_id: 'co_1',
        project_id: 'prj_1',
        txn_date: '2026-05-10',
        item: 'Flight',
        description: 'Sydney to Melbourne',
        amount_cents: 12500,
        txn_type: 'standard',
        parent_public_id: null,
        source_public_id: null,
        transfer_project_id: null,
        budget_impact: true,
        categorisable: true,
        import_batch_id: 'batch_1',
        import_source_type: 'powerbi_expenditure_actuals',
        import_source_meta: { vendor: 'Acme Air' },
        category_id: 'cat_1',
        sub_category_id: 'sub_1',
        company_default_mapping_rule_id: 'map_1',
        coding_source: 'manual',
        coding_pending_approval: true,
        reviewed_at: '2026-05-11T00:00:00.000Z',
        reviewed_by_user_id: 'usr_1',
        locked_at: '2026-05-12T00:00:00.000Z',
        locked_by_user_id: 'usr_1',
        reversal_id: 'rev_1',
        reversal_status: 'pending_reversal',
        reversal_side: 'source',
        reversal_counterpart_txn_public_id: null,
        reversal_expected_project_id: 'prj_2',
        reversal_marked_at: '2026-05-13T00:00:00.000Z',
        reversal_marked_by_user_id: 'usr_1',
        reversal_matched_at: null,
        reversal_matched_by_user_id: null,
        reversal_created_at: '2026-05-13T00:00:00.000Z',
        reversal_updated_at: '2026-05-13T00:00:00.000Z',
        created_at: '2026-05-10T00:00:00.000Z',
        updated_at: '2026-05-12T00:00:00.000Z',
      },
      {
        id: 'internal_2',
        public_id: 'txn_2',
        external_id: null,
        company_id: 'co_1',
        project_id: 'prj_1',
        txn_date: '2026-05-15',
        item: 'Hotel',
        description: 'Uncoded stay',
        amount_cents: 8800,
        txn_type: 'standard',
        parent_public_id: null,
        source_public_id: null,
        transfer_project_id: 'outside_scope',
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
        reversal_id: null,
        reversal_status: null,
        reversal_side: null,
        reversal_counterpart_txn_public_id: null,
        reversal_expected_project_id: null,
        reversal_marked_at: null,
        reversal_marked_by_user_id: null,
        reversal_matched_at: null,
        reversal_matched_by_user_id: null,
        reversal_created_at: null,
        reversal_updated_at: null,
        created_at: '2026-05-15T00:00:00.000Z',
        updated_at: '2026-05-15T00:00:00.000Z',
      },
    ],
    companyDefaultCategories: [
      {
        id: 'dcat_1',
        company_id: 'co_1',
        name: 'Travel',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    companyDefaultSubCategories: [
      {
        id: 'dsub_1',
        company_id: 'co_1',
        company_default_category_id: 'dcat_1',
        name: 'Flights',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    companyDefaultMappingRules: [
      {
        id: 'map_1',
        company_id: 'co_1',
        match_text: 'flight',
        company_default_category_id: 'dcat_1',
        company_default_sub_category_id: 'dsub_1',
        sort_order: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    importRules: [
      {
        id: 'rule_1',
        company_id: 'co_1',
        project_id: null,
        name: 'Flight import',
        action: 'import',
        field: 'vendorName',
        operator: 'contains',
        value: 'air',
        sort_order: 1,
        enabled: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
}

async function loadWorkbook(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.from(bytes) as unknown as Parameters<
    typeof workbook.xlsx.load
  >[0];
  await workbook.xlsx.load(buffer);
  return workbook;
}

test('assembleCompanyWorkbook builds summary workbook metadata and omits detail tabs', async () => {
  const result = await assembleCompanyWorkbook(buildExportFixture('summary'));
  const workbook = await loadWorkbook(result.bytes);

  assert.equal(
    result.fileName,
    'acme-delivery-summary-from-2026-01-01-to-2026-12-31-export.xlsx'
  );
  assert.ok(workbook.getWorksheet('Overview'));
  assert.ok(workbook.getWorksheet('Executive Summary'));
  assert.ok(workbook.getWorksheet('Budget vs Actual'));
  assert.ok(workbook.getWorksheet('Monthly Spend'));
  assert.ok(workbook.getWorksheet('Pending Reversal'));
  assert.ok(!workbook.getWorksheet('Transactions'));

  const metadataSheet = workbook.getWorksheet('Export Metadata');
  const overviewSheet = workbook.getWorksheet('Overview');
  assert.ok(metadataSheet);
  assert.ok(overviewSheet);
  assert.equal(metadataSheet?.state, 'hidden');
  assert.equal(metadataSheet?.getCell('B3').value, 'company_workbook');
  const overviewLines = Array.from(
    { length: overviewSheet?.rowCount ?? 0 },
    (_, index) => String(overviewSheet?.getCell(`A${index + 1}`).value ?? '')
  );
  assert.ok(
    overviewLines.some((line) =>
      line.includes('125.00 unrecorded pending reversal amount')
    )
  );

  const budgetHeaders = (
    workbook.getWorksheet('Budget vs Actual')?.getRow(1).values as unknown[]
  ).slice(1);
  const monthlyHeaders = (
    workbook.getWorksheet('Monthly Spend')?.getRow(1).values as unknown[]
  ).slice(1);
  assert.ok(budgetHeaders.includes('Recorded spend'));
  assert.ok(budgetHeaders.includes('Budget headroom'));
  assert.ok(budgetHeaders.includes('Budget health'));
  assert.ok(monthlyHeaders.includes('Recorded spend'));
  assert.ok(!monthlyHeaders.includes('Budget amount'));
});

test('assembleCompanyWorkbook builds full detail tabs and keeps scoped transfer links blank', async () => {
  const result = await assembleCompanyWorkbook(buildExportFixture('full'));
  const workbook = await loadWorkbook(result.bytes);

  const transactionSheet = workbook.getWorksheet('Transactions');
  const reviewedSheet = workbook.getWorksheet('Reviewed Transactions');
  const lockedSheet = workbook.getWorksheet('Locked Transactions');
  const membersSheet = workbook.getWorksheet('Company Members');
  const pendingReversalSheet = workbook.getWorksheet('Pending Reversal');

  assert.ok(transactionSheet);
  assert.ok(reviewedSheet);
  assert.ok(lockedSheet);
  assert.ok(membersSheet);
  assert.ok(pendingReversalSheet);
  assert.equal(transactionSheet?.rowCount, 3);
  assert.equal(reviewedSheet?.rowCount, 2);
  assert.equal(lockedSheet?.rowCount, 2);
  assert.equal(pendingReversalSheet?.rowCount, 2);

  const headers = (transactionSheet?.getRow(1).values as Array<unknown>).slice(
    1
  );
  const transferProjectNameIndex = headers.findIndex(
    (value) => value === 'Transfer project name'
  );
  assert.notEqual(transferProjectNameIndex, -1);
  const secondDataRow = transactionSheet?.getRow(3).values as Array<unknown>;
  assert.equal(secondDataRow[transferProjectNameIndex + 1], '');
});

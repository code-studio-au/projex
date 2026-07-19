import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { test } from 'vitest';

import {
  buildExportFileName,
  buildTransactionColumns,
  centsToMajorUnits,
  createWorksheet,
  flattenSummaryProjects,
  sumProjectMonths,
  toProject,
  type ProjectExportRow,
} from '../src/server/fns/exportWorkbookShared.ts';
import { asProjectId, type CompanySummaryProject } from '../src/types/index.ts';

test('buildExportFileName slugifies company names and includes active/date filters', () => {
  const fileName = buildExportFileName({
    companyName: '  ACME & Sons / Delivery  ',
    options: {
      scope: 'active',
      detail: 'summary',
      fromDate: '2026-01-01',
      toDate: '2026-06-30',
    },
  });

  assert.equal(
    fileName,
    'acme-sons-delivery-active-summary-from-2026-01-01-to-2026-06-30-export.xlsx'
  );
});

test('toProject preserves parent linkage and project flags', () => {
  const row: ProjectExportRow = {
    id: 'prj_1',
    company_id: 'co_1',
    name: 'Delivery Project',
    project_type: 'project',
    parent_project_id: 'prog_1',
    budget_total_cents: 250000,
    currency: 'AUD',
    status: 'active',
    deactivated_at: null,
    visibility: 'private',
    allow_superadmin_access: true,
    sync_company_defaults: false,
    allow_txn_transfers: true,
  };

  const project = toProject(row);

  assert.equal(project.id, 'prj_1');
  assert.equal(project.companyId, 'co_1');
  assert.equal(project.parentProjectId, 'prog_1');
  assert.equal(project.visibility, 'private');
  assert.equal(project.syncCompanyDefaults, false);
  assert.equal(project.allowTxnTransfers, true);
});

test('flattenSummaryProjects and sumProjectMonths handle nested company summary rows', () => {
  const nested: CompanySummaryProject[] = [
    {
      id: asProjectId('prog_1'),
      name: 'Programme',
      projectType: 'programme',
      status: 'active',
      visibility: 'company',
      currency: 'AUD',
      budgetCents: 0,
      months: [
        {
          monthKey: '2026-01',
          actualCodedCents: 0,
          pendingReversalCents: 0,
          adjustedActualCodedCents: 0,
          uncodedCount: 0,
          uncodedAmountCents: 0,
        },
      ],
      children: [
        {
          id: asProjectId('prj_1'),
          name: 'Project A',
          projectType: 'project',
          parentProjectId: asProjectId('prog_1'),
          status: 'active',
          visibility: 'company',
          currency: 'AUD',
          budgetCents: 1000,
          months: [
            {
              monthKey: '2026-01',
              actualCodedCents: 250,
              pendingReversalCents: 0,
              adjustedActualCodedCents: 250,
              uncodedCount: 1,
              uncodedAmountCents: 75,
            },
          ],
        },
      ],
    },
  ];

  const flat = flattenSummaryProjects(nested);

  assert.deepEqual(
    flat.map((project) => project.id),
    ['prog_1', 'prj_1']
  );
  assert.equal(
    sumProjectMonths(flat[1], (month) => month.actualCodedCents),
    250
  );
  assert.equal(
    sumProjectMonths(flat[1], (month) => month.uncodedAmountCents),
    75
  );
});

test('createWorksheet applies headers, auto filter, and preserves row values', () => {
  const workbook = new ExcelJS.Workbook();
  const columns = buildTransactionColumns().slice(0, 3);
  const worksheet = createWorksheet(workbook, 'Transactions', columns, [
    {
      transactionId: 'txn_1',
      internalId: 'internal_1',
      projectId: 'prj_1',
    },
  ]);

  assert.equal(worksheet.name, 'Transactions');
  assert.equal(worksheet.rowCount, 2);
  assert.equal(worksheet.getRow(2).getCell(1).value, 'txn_1');
  assert.deepEqual(worksheet.autoFilter, {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  });
  assert.equal(worksheet.views[0]?.state, 'frozen');
  assert.equal(centsToMajorUnits(12345), 123.45);
});

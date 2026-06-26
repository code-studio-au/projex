import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { ImportPreviewRow } from '../src/types/index.ts';
import { suggestImportExclusionRuleFromPreviewRow } from '../src/utils/importRuleSuggestions.ts';

function previewRow(
  overrides: Partial<ImportPreviewRow> = {}
): ImportPreviewRow {
  return {
    sourceRowIndex: 1,
    importId: 'row_1',
    externalId: 'JRNL-100:1:A',
    parsedDate: '2026-04-25',
    amountCents: 12345,
    item: 'Learning Vendor',
    description: 'External training course',
    duplicate: false,
    importAction: 'import',
    mappingStatus: 'uncoded',
    codingPendingApproval: false,
    willCreateCategory: false,
    willCreateSubCategory: false,
    willCreateBudgetLine: false,
    warnings: [],
    rawSourceRow: {
      Ledger: 'ACTUALS',
      'Fiscal Year': '2026',
      Period: '4',
      'CC and Description': '4041 Upskilling',
      'RC and Description': 'Research Centre',
      'PC and Description': 'Programme Code',
      AC: 'EXP',
      'Expenditure Actuals': '123.45',
      'Journal Line Description': 'External training course',
      'Journal ID': 'JRNL-100',
      'Reference Num': 'REF-9',
      'Journal Date': '46137',
      'Journal Line': '1',
      'Journal Line Ref': 'A',
      'Posted Date': '46138',
      'Unpost Seq': '0',
      Source: 'EXP',
      'Operator ID': 'OP-1',
      'PO ID': 'PO-44',
      'Vendor ID': 'VEN-10',
      'Vendor Name': 'Learning Vendor',
    },
    ...overrides,
  };
}

test('suggestImportExclusionRuleFromPreviewRow prefers a specific source code', () => {
  const baseRow = previewRow();
  const suggestion = suggestImportExclusionRuleFromPreviewRow(
    previewRow({
      rawSourceRow: {
        ...baseRow.rawSourceRow!,
        Source: 'SAL',
      },
    })
  );

  assert.deepEqual(suggestion, {
    name: 'Exclude Sal source',
    action: 'exclude',
    field: 'source',
    operator: 'equals',
    value: 'SAL',
  });
});

test('suggestImportExclusionRuleFromPreviewRow skips generic EXP and falls back to vendor', () => {
  const suggestion = suggestImportExclusionRuleFromPreviewRow(previewRow());

  assert.deepEqual(suggestion, {
    name: 'Exclude Learning Vendor vendor rows',
    action: 'exclude',
    field: 'vendorName',
    operator: 'equals',
    value: 'Learning Vendor',
  });
});

test('suggestImportExclusionRuleFromPreviewRow falls back to journal description text', () => {
  const baseRow = previewRow();
  const suggestion = suggestImportExclusionRuleFromPreviewRow(
    previewRow({
      item: '',
      rawSourceRow: {
        ...baseRow.rawSourceRow!,
        'Vendor Name': '',
        'PO ID': '',
        'Reference Num': '',
        'Journal ID': '',
        'Journal Line Description': 'Temporary contractor recharge',
      },
    })
  );

  assert.deepEqual(suggestion, {
    name: 'Exclude Temporary contractor recharge rows',
    action: 'exclude',
    field: 'journalLineDescription',
    operator: 'contains',
    value: 'Temporary contractor recharge',
  });
});

test('suggestImportExclusionRuleFromPreviewRow falls back through po, reference, journal id, item, then null', () => {
  const baseRow = previewRow({
    rawSourceRow: {
      ...previewRow().rawSourceRow!,
      Source: 'EXP',
      'Vendor Name': '',
    },
  });

  assert.deepEqual(
    suggestImportExclusionRuleFromPreviewRow(
      previewRow({
        ...baseRow,
        rawSourceRow: {
          ...baseRow.rawSourceRow!,
          'PO ID': 'PO-44',
          'Reference Num': '',
          'Journal ID': '',
          'Journal Line Description': '',
        },
      })
    ),
    {
      name: 'Exclude PO PO-44',
      action: 'exclude',
      field: 'poId',
      operator: 'equals',
      value: 'PO-44',
    }
  );

  assert.deepEqual(
    suggestImportExclusionRuleFromPreviewRow(
      previewRow({
        ...baseRow,
        rawSourceRow: {
          ...baseRow.rawSourceRow!,
          'PO ID': '',
          'Reference Num': 'REF-9',
          'Journal ID': '',
          'Journal Line Description': '',
        },
      })
    ),
    {
      name: 'Exclude reference REF-9',
      action: 'exclude',
      field: 'referenceNum',
      operator: 'equals',
      value: 'REF-9',
    }
  );

  assert.deepEqual(
    suggestImportExclusionRuleFromPreviewRow(
      previewRow({
        ...baseRow,
        rawSourceRow: {
          ...baseRow.rawSourceRow!,
          'PO ID': '',
          'Reference Num': '',
          'Journal ID': 'JRNL-100',
          'Journal Line Description': '',
        },
      })
    ),
    {
      name: 'Exclude journal JRNL-100',
      action: 'exclude',
      field: 'journalId',
      operator: 'equals',
      value: 'JRNL-100',
    }
  );

  assert.deepEqual(
    suggestImportExclusionRuleFromPreviewRow(
      previewRow({
        item: 'Helpful item',
        rawSourceRow: {
          ...baseRow.rawSourceRow!,
          'PO ID': '',
          'Reference Num': '',
          'Journal ID': '',
          'Journal Line Description': '',
        },
      })
    ),
    {
      name: 'Exclude Helpful item rows',
      action: 'exclude',
      field: 'journalLineDescription',
      operator: 'contains',
      value: 'Helpful item',
    }
  );

  assert.equal(
    suggestImportExclusionRuleFromPreviewRow(
      previewRow({
        item: '',
        rawSourceRow: {
          ...baseRow.rawSourceRow!,
          'PO ID': '',
          'Reference Num': '',
          'Journal ID': '',
          'Journal Line Description': '',
        },
      })
    ),
    null
  );
});

test('suggestImportExclusionRuleFromPreviewRow compacts long vendor labels', () => {
  const longVendorName =
    'Very Long Vendor Name For Temporary Contractor Services Across Multiple Teams';

  const suggestion = suggestImportExclusionRuleFromPreviewRow(
    previewRow({
      rawSourceRow: {
        ...previewRow().rawSourceRow!,
        Source: 'EXP',
        'Vendor Name': longVendorName,
      },
    })
  );

  assert.deepEqual(suggestion, {
    name: 'Exclude Very Long Vendor Name For Temporary Contracto... vendor rows',
    action: 'exclude',
    field: 'vendorName',
    operator: 'equals',
    value: longVendorName,
  });
});

test('suggestImportExclusionRuleFromPreviewRow can fall back without a raw source row', () => {
  const suggestion = suggestImportExclusionRuleFromPreviewRow(
    previewRow({
      item: '  Travel recharge  ',
      rawSourceRow: undefined,
    })
  );

  assert.deepEqual(suggestion, {
    name: 'Exclude Travel recharge rows',
    action: 'exclude',
    field: 'journalLineDescription',
    operator: 'contains',
    value: 'Travel recharge',
  });
});

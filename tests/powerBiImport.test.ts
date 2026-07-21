import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { ImportRule } from '../src/types/index.ts';
import { asCompanyId, asImportRuleId } from '../src/types/index.ts';
import {
  decidePowerBiImportRule,
  defaultPowerBiImportRules,
  powerBiAmountCents,
  powerBiDescription,
  powerBiExternalId,
  powerBiItem,
  powerBiTransactionDate,
  toPowerBiExpenditureActualsRow,
} from '../src/utils/powerBiImport.ts';

const companyId = asCompanyId('co_powerbi');

function rawPowerBiRow(overrides: Record<string, string> = {}) {
  return {
    Ledger: 'ACTUALS',
    'Fiscal Year': '2026',
    Period: '4',
    'CC and Description': '4041 Upskilling',
    'RC and Description': 'Research Centre',
    'PC and Description': 'Programme Code',
    AC: 'EXP',
    'Expenditure Actuals': '1,234.56',
    'Journal Line Description': 'External training course',
    'Journal ID': 'JRNL-100',
    'Reference Num': 'REF-9',
    'Journal Date': '46137',
    'Journal Line': '12',
    'Journal Line Ref': 'A',
    'Posted Date': '46138',
    'Unpost Seq': '0',
    Source: 'EXP',
    'Operator ID': 'OP-1',
    'PO ID': 'PO-44',
    'Vendor ID': 'VEN-10',
    'Vendor Name': 'Learning Vendor',
    ...overrides,
  };
}

function importRule(overrides: Partial<ImportRule>): ImportRule {
  return {
    id: asImportRuleId('rule_1'),
    companyId,
    scope: 'company',
    name: 'Review training rows',
    action: 'review',
    field: 'journalLineDescription',
    operator: 'contains',
    value: 'training',
    sortOrder: 10,
    enabled: true,
    ...overrides,
  };
}

test('PowerBI expenditure rows normalize into transaction-friendly fields', () => {
  const row = toPowerBiExpenditureActualsRow(rawPowerBiRow());

  assert.equal(powerBiExternalId(row), 'JRNL-100:12:A');
  assert.equal(powerBiTransactionDate(row), '2026-04-25');
  assert.equal(powerBiAmountCents(row), 123456);
  assert.equal(powerBiItem(row), 'Learning Vendor');
  assert.match(powerBiDescription(row), /External training course/);
  assert.match(powerBiDescription(row), /Source: EXP/);
});

test('PowerBI amount parsing preserves negative actuals', () => {
  assert.equal(
    powerBiAmountCents(
      toPowerBiExpenditureActualsRow(
        rawPowerBiRow({ 'Expenditure Actuals': '-99.10' })
      )
    ),
    -9910
  );

  assert.equal(
    powerBiAmountCents(
      toPowerBiExpenditureActualsRow(
        rawPowerBiRow({ 'Expenditure Actuals': '($1,234.56)' })
      )
    ),
    -123456
  );
});

test('PowerBI amount parsing treats blank amounts as missing', () => {
  assert.equal(
    Number.isNaN(
      powerBiAmountCents(
        toPowerBiExpenditureActualsRow(
          rawPowerBiRow({ 'Expenditure Actuals': '' })
        )
      )
    ),
    true
  );
});

test('PowerBI date parsing prefers journal date and accepts exported date strings', () => {
  assert.equal(
    powerBiTransactionDate(
      toPowerBiExpenditureActualsRow(
        rawPowerBiRow({
          'Journal Date': '26/04/2026',
          'Posted Date': '2026-04-27',
        })
      )
    ),
    '2026-04-26'
  );

  assert.equal(
    powerBiTransactionDate(
      toPowerBiExpenditureActualsRow(
        rawPowerBiRow({
          'Journal Date': '2026-04-26 00:00:00',
          'Posted Date': '',
        })
      )
    ),
    '2026-04-26'
  );

  assert.equal(
    powerBiTransactionDate(
      toPowerBiExpenditureActualsRow(
        rawPowerBiRow({
          'Journal Date': '4/26/2026',
          'Posted Date': '',
        })
      )
    ),
    '2026-04-26'
  );

  assert.equal(
    powerBiTransactionDate(
      toPowerBiExpenditureActualsRow(
        rawPowerBiRow({
          'Journal Date': '26042026',
          'Posted Date': '',
        })
      )
    ),
    '2026-04-26'
  );

  assert.equal(
    powerBiTransactionDate(
      toPowerBiExpenditureActualsRow(
        rawPowerBiRow({
          'Journal Date': '20260426',
          'Posted Date': '',
        })
      )
    ),
    '2026-04-26'
  );

  assert.equal(
    powerBiTransactionDate(
      toPowerBiExpenditureActualsRow(
        rawPowerBiRow({
          'Journal Date': '2026-13-01',
          'Posted Date': '2026-04-27',
        })
      )
    ),
    '2026-04-27'
  );

  assert.equal(
    powerBiTransactionDate(
      toPowerBiExpenditureActualsRow(
        rawPowerBiRow({
          'Journal Date': '2026-02-30',
          'Posted Date': '',
        })
      )
    ),
    ''
  );

  assert.equal(
    powerBiTransactionDate(
      toPowerBiExpenditureActualsRow(
        rawPowerBiRow({
          'Journal Date': '01011899',
          'Posted Date': '',
        })
      )
    ),
    ''
  );
});

test('PowerBI date parsing does not turn blank dates into Excel epoch dates', () => {
  assert.equal(
    powerBiTransactionDate(
      toPowerBiExpenditureActualsRow(
        rawPowerBiRow({ 'Posted Date': '', 'Journal Date': '' })
      )
    ),
    ''
  );
});

test('PowerBI column mapping tolerates harmless header differences', () => {
  const row = toPowerBiExpenditureActualsRow({
    ...rawPowerBiRow(),
    'Journal Date': '',
    ' journal date ': '26/04/2026',
    'Vendor Name': '',
    'vendor name': 'Case-insensitive Vendor',
  });

  assert.equal(powerBiTransactionDate(row), '2026-04-26');
  assert.equal(powerBiItem(row), 'Case-insensitive Vendor');
});

test('PowerBI helpers fall back cleanly when optional columns are missing or blank', () => {
  const row = toPowerBiExpenditureActualsRow({
    Ledger: 'ACTUALS',
    'Fiscal Year': '2026',
    Period: '4',
    'CC and Description': '',
    'RC and Description': '',
    'PC and Description': '',
    AC: '',
    'Expenditure Actuals': '10.00',
    'Journal Line Description': '',
    'Journal ID': 'JRNL-404',
    'Reference Num': '',
    'Journal Date': '',
    'Journal Line': '',
    'Journal Line Ref': '',
    'Posted Date': '',
    'Unpost Seq': '',
    Source: '',
    'Operator ID': '',
    'PO ID': '',
    'Vendor ID': '',
    'Vendor Name': '',
  });

  assert.equal(powerBiItem(row), 'JRNL-404');
  assert.equal(powerBiDescription(row), '');
  assert.equal(powerBiExternalId(row), 'JRNL-404');
});

test('PowerBI default import rules exclude SAL, import EXA, and review salary transfers', () => {
  const rules = defaultPowerBiImportRules(companyId).map((rule, index) => ({
    ...rule,
    id: asImportRuleId(`rule_${index + 1}`),
  }));

  assert.equal(
    decidePowerBiImportRule({
      row: toPowerBiExpenditureActualsRow(rawPowerBiRow({ Ledger: '' })),
      rules: [],
    }).action,
    'exclude'
  );

  assert.equal(
    decidePowerBiImportRule({
      row: toPowerBiExpenditureActualsRow(rawPowerBiRow({ Source: 'SAL' })),
      rules,
    }).action,
    'exclude'
  );
  assert.equal(
    decidePowerBiImportRule({
      row: toPowerBiExpenditureActualsRow(
        rawPowerBiRow({
          Source: 'EXA',
          'CC and Description': '5000 Operations',
        })
      ),
      rules,
    }).action,
    'import'
  );
  assert.equal(
    decidePowerBiImportRule({
      row: toPowerBiExpenditureActualsRow(
        rawPowerBiRow({
          Source: 'EXP',
          'Journal Line Description': 'Salaries TRF between cost centres',
        })
      ),
      rules,
    }).action,
    'review'
  );
  assert.equal(
    decidePowerBiImportRule({
      row: toPowerBiExpenditureActualsRow(
        rawPowerBiRow({
          Source: 'EXP',
          'CC and Description': '4141 People costs',
        })
      ),
      rules,
    }).action,
    'review'
  );
});

test('PowerBI import rules use enabled sorted precedence', () => {
  const row = toPowerBiExpenditureActualsRow(rawPowerBiRow());

  const decision = decidePowerBiImportRule({
    row,
    rules: [
      importRule({
        id: asImportRuleId('rule_disabled'),
        name: 'Disabled exclude',
        action: 'exclude',
        sortOrder: 1,
        enabled: false,
      }),
      importRule({
        id: asImportRuleId('rule_first'),
        name: 'First enabled match',
        action: 'review',
        sortOrder: 5,
      }),
      importRule({
        id: asImportRuleId('rule_second'),
        name: 'Later enabled match',
        action: 'exclude',
        sortOrder: 20,
      }),
    ],
  });

  assert.equal(decision.action, 'review');
  assert.equal(decision.matchedRule?.id, asImportRuleId('rule_first'));
  assert.equal(decision.reason, 'First enabled match');
});

test('PowerBI multi-value operators match against comma and newline separated lists', () => {
  const row = toPowerBiExpenditureActualsRow(rawPowerBiRow());

  const equalsAnyDecision = decidePowerBiImportRule({
    row,
    rules: [
      importRule({
        id: asImportRuleId('rule_equals_any'),
        field: 'source',
        operator: 'equals_any',
        value: 'sal,\nexp,\nexa',
      }),
    ],
  });
  assert.equal(equalsAnyDecision.action, 'review');

  const containsAnyDecision = decidePowerBiImportRule({
    row,
    rules: [
      importRule({
        id: asImportRuleId('rule_contains_any'),
        operator: 'contains_any',
        value: 'tuition,\ntraining,\ntravel',
      }),
    ],
  });
  assert.equal(containsAnyDecision.action, 'review');
});

test('PowerBI predefined operators support starts-with and ends-with matching', () => {
  const startsWithRow = toPowerBiExpenditureActualsRow(
    rawPowerBiRow({
      'Journal Line Description': 'Transfer to payroll clearing',
    })
  );
  const endsWithRow = toPowerBiExpenditureActualsRow(
    rawPowerBiRow({ 'Journal Line Description': 'Processed via suspense' })
  );

  const startsWithDecision = decidePowerBiImportRule({
    row: startsWithRow,
    rules: [
      importRule({
        id: asImportRuleId('rule_starts_with_any'),
        operator: 'starts_with_any',
        value: 'transfer,\nreclass',
      }),
    ],
  });
  assert.equal(startsWithDecision.action, 'review');

  const endsWithDecision = decidePowerBiImportRule({
    row: endsWithRow,
    rules: [
      importRule({
        id: asImportRuleId('rule_ends_with'),
        operator: 'ends_with',
        value: 'suspense',
      }),
    ],
  });
  assert.equal(endsWithDecision.action, 'review');
});

test('PowerBI import rules support starts_with, ends_with_any, anyText, and no-match fallthrough', () => {
  const row = toPowerBiExpenditureActualsRow(
    rawPowerBiRow({
      Source: 'OPS',
      'Journal Line Description': 'Payroll clearing suspense',
      'Reference Num': 'REF-42',
    })
  );

  const startsWithDecision = decidePowerBiImportRule({
    row,
    rules: [
      importRule({
        id: asImportRuleId('rule_starts_with'),
        field: 'journalLineDescription',
        operator: 'starts_with',
        value: 'payroll',
      }),
    ],
  });
  assert.equal(startsWithDecision.action, 'review');

  const endsWithAnyDecision = decidePowerBiImportRule({
    row,
    rules: [
      importRule({
        id: asImportRuleId('rule_ends_with_any'),
        field: 'journalLineDescription',
        operator: 'ends_with_any',
        value: 'clearing,\nsuspense',
      }),
    ],
  });
  assert.equal(endsWithAnyDecision.action, 'review');

  const anyTextDecision = decidePowerBiImportRule({
    row,
    rules: [
      importRule({
        id: asImportRuleId('rule_any_text'),
        field: 'anyText',
        operator: 'contains',
        value: 'ref-42',
      }),
    ],
  });
  assert.equal(anyTextDecision.action, 'review');

  const importDecision = decidePowerBiImportRule({
    row,
    rules: [
      importRule({
        id: asImportRuleId('rule_no_match'),
        field: 'journalLineDescription',
        operator: 'contains',
        value: 'travel',
      }),
    ],
  });
  assert.equal(importDecision.action, 'import');
  assert.equal(importDecision.reason, 'No import rule matched');
});

test('PowerBI import rules can target vendor, PO, reference, and journal id fields directly', () => {
  const row = toPowerBiExpenditureActualsRow(rawPowerBiRow());

  assert.equal(
    decidePowerBiImportRule({
      row,
      rules: [
        importRule({
          id: asImportRuleId('rule_ledger'),
          field: 'ledger',
          operator: 'equals',
          value: 'ACTUALS',
        }),
      ],
    }).action,
    'review'
  );

  assert.equal(
    decidePowerBiImportRule({
      row,
      rules: [
        importRule({
          id: asImportRuleId('rule_vendor'),
          field: 'vendorName',
          operator: 'equals',
          value: 'Learning Vendor',
        }),
      ],
    }).action,
    'review'
  );

  assert.equal(
    decidePowerBiImportRule({
      row,
      rules: [
        importRule({
          id: asImportRuleId('rule_po'),
          field: 'poId',
          operator: 'equals',
          value: 'PO-44',
        }),
      ],
    }).action,
    'review'
  );

  assert.equal(
    decidePowerBiImportRule({
      row,
      rules: [
        importRule({
          id: asImportRuleId('rule_reference'),
          field: 'referenceNum',
          operator: 'equals',
          value: 'REF-9',
        }),
      ],
    }).action,
    'review'
  );

  assert.equal(
    decidePowerBiImportRule({
      row,
      rules: [
        importRule({
          id: asImportRuleId('rule_journal'),
          field: 'journalId',
          operator: 'equals',
          value: 'JRNL-100',
        }),
      ],
    }).action,
    'review'
  );
});

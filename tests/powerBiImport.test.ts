import assert from 'node:assert/strict';
import test from 'node:test';

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

test('PowerBI default import rules exclude SAL and EXA while reviewing salary transfers', () => {
  const rules = defaultPowerBiImportRules(companyId).map((rule, index) => ({
    ...rule,
    id: asImportRuleId(`rule_${index + 1}`),
  }));

  const footerDecision = decidePowerBiImportRule({
    row: toPowerBiExpenditureActualsRow(
      rawPowerBiRow({
        Ledger: 'Total',
        Source: '',
        'Journal Line Description': 'Grand total',
      })
    ),
    rules,
  });
  assert.equal(footerDecision.action, 'exclude');
  assert.equal(
    footerDecision.matchedRule?.name,
    'Exclude non-actual ledger/footer rows'
  );

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
      row: toPowerBiExpenditureActualsRow(rawPowerBiRow({ Source: 'EXA' })),
      rules,
    }).action,
    'exclude'
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

test('PowerBI regex rules fail closed for invalid and oversized patterns', () => {
  const row = toPowerBiExpenditureActualsRow(rawPowerBiRow());

  const invalidPatternDecision = decidePowerBiImportRule({
    row,
    rules: [
      importRule({
        id: asImportRuleId('rule_invalid_regex'),
        operator: 'regex',
        value: '(',
      }),
    ],
  });
  assert.equal(invalidPatternDecision.action, 'import');
  assert.equal(invalidPatternDecision.matchedRule, undefined);

  const oversizedPatternDecision = decidePowerBiImportRule({
    row,
    rules: [
      importRule({
        id: asImportRuleId('rule_oversized_regex'),
        operator: 'regex',
        value: 'a'.repeat(129),
      }),
    ],
  });
  assert.equal(oversizedPatternDecision.action, 'import');
  assert.equal(oversizedPatternDecision.matchedRule, undefined);
});

test('PowerBI regex matching bounds the haystack length', () => {
  const longPrefix = 'x'.repeat(520);
  const row = toPowerBiExpenditureActualsRow(
    rawPowerBiRow({
      'Journal Line Description': `${longPrefix}training-after-limit`,
    })
  );

  const decision = decidePowerBiImportRule({
    row,
    rules: [
      importRule({
        id: asImportRuleId('rule_regex_boundary'),
        operator: 'regex',
        value: 'training-after-limit',
      }),
    ],
  });

  assert.equal(decision.action, 'import');
  assert.equal(decision.matchedRule, undefined);
});

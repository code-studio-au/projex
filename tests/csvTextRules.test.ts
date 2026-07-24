import assert from 'node:assert/strict';
import { test } from 'vitest';

import { assignStableIds, parseCsv } from '../src/utils/csv.ts';
import {
  canonicalizeRuleText,
  textRuleMatches,
  transactionRuleHaystack,
} from '../src/utils/textRuleMatching.ts';

test('parseCsv handles quotes, escaped quotes, blank rows, and trailing rows', () => {
  const rows = parseCsv(
    [
      'Name,Description',
      '"Acme, Inc.","Line 1',
      'Line 2"',
      '"Quoted ""value""",Simple',
      '',
    ].join('\n')
  );

  assert.deepEqual(rows, [
    {
      Name: 'Acme, Inc.',
      Description: 'Line 1\nLine 2',
    },
    {
      Name: 'Quoted "value"',
      Description: 'Simple',
    },
  ]);
});

test('assignStableIds prefers external ids and increments duplicate content occurrences', () => {
  const rows = assignStableIds([
    {
      id: '',
      externalId: ' BANK-1 ',
      date: '2026-06-01',
      item: 'Flight',
      description: 'Sydney',
      amountCents: 100,
    },
    {
      id: '',
      externalId: '',
      date: '2026-06-01',
      item: 'Flight',
      description: 'Sydney',
      amountCents: 100,
    },
    {
      id: '',
      externalId: '',
      date: '2026-06-01',
      item: 'Flight',
      description: 'Sydney',
      amountCents: 100,
    },
    {
      id: 'txn_existing',
      externalId: '',
      date: '2026-06-02',
      item: 'Hotel',
      description: 'Melbourne',
      amountCents: 200,
    },
    {
      id: '',
      externalId: 'BANK-1',
      date: '2026-06-03',
      item: 'Taxi',
      description: 'Airport',
      amountCents: 300,
    },
  ] as never);

  assert.match(String(rows[0].id), /^txn_ext_/);
  assert.match(String(rows[1].id), /^txn_/);
  assert.match(String(rows[2].id), /^txn_.*_2$/);
  assert.equal(rows[3].id, 'txn_existing');
  assert.match(String(rows[4].id), /^txn_ext_.*_2$/);
  assert.notEqual(rows[0].id, rows[4].id);
});

test('text rule helpers normalize plurals and combine haystacks safely', () => {
  assert.equal(
    canonicalizeRuleText('Policies buses classes glass'),
    'policy buse classe glass'
  );
  assert.equal(
    transactionRuleHaystack({ item: ' Flight ', description: null }),
    'flight'
  );
  assert.equal(
    textRuleMatches({
      haystack: 'company policies and reimbursements',
      needle: 'policy',
    }),
    true
  );
  assert.equal(
    textRuleMatches({
      haystack: 'expense review',
      needle: '',
    }),
    false
  );
});

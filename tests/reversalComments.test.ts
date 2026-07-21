import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  buildAmbiguousSuggestedSourceComment,
  buildPendingComment,
} from '../src/server/fns/transactions/reversalComments.ts';
import { asTxnId } from '../src/types/index.ts';

test('reversal comment service preserves pending destination and reviewer note', () => {
  const body = buildPendingComment({
    expectedProjectId: 'prj_destination' as never,
    expectedProjectName: 'Destination Project',
    commentBody: 'Move after finance confirms.',
  });
  assert.match(body, /Destination Project \(prj_destination\)/);
  assert.match(body, /Note:\nMove after finance confirms\./);
});

test('reversal comment service lists only valid ambiguous candidates', () => {
  const body = buildAmbiguousSuggestedSourceComment({
    counterpartTxn: {
      id: asTxnId('txn_counterpart'),
      date: '2026-06-01',
      amountCents: -1000,
    } as never,
    validCounterpartTxnIds: [
      asTxnId('txn_counterpart'),
      asTxnId('txn_alternative'),
    ],
  });
  assert.match(body, /txn_counterpart, txn_alternative/);
});

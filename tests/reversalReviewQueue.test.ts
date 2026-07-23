import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { TxnBulkSelectionRow } from '../src/api/types.ts';
import {
  canMoveReversalReviewQueue,
  createReversalReviewQueue,
  currentReversalReviewTxnId,
  moveReversalReviewQueue,
  resolveReversalReviewItem,
  reversalReviewQueueSummary,
} from '../src/components/transactions/reversalReviewQueue.ts';
import { asTxnId } from '../src/types/index.ts';

function row(
  suffix: string,
  options: {
    reversalId?: string;
    side?: 'source' | 'reversal';
    status?:
      | 'auto_matched_pending_approval'
      | 'auto_matched_ambiguous_pending_approval'
      | 'pending_reversal';
    locked?: boolean;
  } = {}
): TxnBulkSelectionRow {
  return {
    id: asTxnId(`txn_${suffix}`),
    categorisable: true,
    codingPendingApproval: false,
    locked: options.locked ?? false,
    workflowVersion: 0,
    reversal: options.reversalId
      ? {
          id: options.reversalId,
          status: options.status ?? 'auto_matched_pending_approval',
          side: options.side ?? 'source',
          version: 1,
        }
      : undefined,
  };
}

test('reversal review queue keeps one unlocked source per suggested pair', () => {
  const queue = createReversalReviewQueue([
    row('source_a', { reversalId: 'pair_a' }),
    row('counterpart_a', { reversalId: 'pair_a', side: 'reversal' }),
    row('source_b', {
      reversalId: 'pair_b',
      status: 'auto_matched_ambiguous_pending_approval',
    }),
    row('pending', {
      reversalId: 'pair_pending',
      status: 'pending_reversal',
    }),
    row('locked', { reversalId: 'pair_locked', locked: true }),
  ]);

  assert.deepEqual(queue?.txnIds, [
    asTxnId('txn_source_a'),
    asTxnId('txn_source_b'),
  ]);
});

test('reversal review queue supports navigation and resolution', () => {
  const initial = createReversalReviewQueue([
    row('a', { reversalId: 'pair_a' }),
    row('b', { reversalId: 'pair_b' }),
    row('c', { reversalId: 'pair_c' }),
  ])!;
  const next = moveReversalReviewQueue(initial, 1);
  assert.equal(currentReversalReviewTxnId(next), asTxnId('txn_b'));
  assert.equal(canMoveReversalReviewQueue(next, -1), true);

  const previous = moveReversalReviewQueue(next, -1);
  assert.equal(currentReversalReviewTxnId(previous), asTxnId('txn_a'));

  const backToSecond = moveReversalReviewQueue(previous, 1);
  const approved = resolveReversalReviewItem(backToSecond, 'approved');
  assert.equal(currentReversalReviewTxnId(approved), asTxnId('txn_c'));
  assert.deepEqual(reversalReviewQueueSummary(approved), {
    totalCount: 3,
    reviewedCount: 1,
    approvedCount: 1,
    rejectedCount: 0,
    remainingCount: 2,
  });

  const rejected = resolveReversalReviewItem(approved, 'rejected');
  assert.equal(currentReversalReviewTxnId(rejected), asTxnId('txn_a'));
  const finished = resolveReversalReviewItem(rejected, 'approved');
  assert.deepEqual(reversalReviewQueueSummary(finished), {
    totalCount: 3,
    reviewedCount: 3,
    approvedCount: 2,
    rejectedCount: 1,
    remainingCount: 0,
  });
});

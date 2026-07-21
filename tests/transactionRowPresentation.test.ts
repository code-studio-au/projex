import assert from 'node:assert/strict';
import { test } from 'vitest';

import { getTransactionRowStatus } from '../src/components/transactions/transactionRowPresentation.ts';
import {
  TRANSACTION_VIEW_OPTIONS,
  toTransactionView,
} from '../src/components/transactions/transactionViews.ts';
import {
  transactionWorkflowBadges,
  transactionWorkflowHeading,
} from '../src/components/transactions/transactionWorkflowSummary.ts';
import type { Txn } from '../src/types/index.ts';
import { asCompanyId, asProjectId, asTxnId } from '../src/types/ids.ts';

function txn(overrides: Partial<Txn> = {}): Txn {
  return {
    id: asTxnId('txn_row_status'),
    companyId: asCompanyId('co_row_status'),
    projectId: asProjectId('prj_row_status'),
    date: '2026-07-21',
    item: 'Test transaction',
    description: 'Presentation fixture',
    amountCents: 1000,
    txnType: 'standard',
    budgetImpact: true,
    categorisable: true,
    ...overrides,
  };
}

test('transaction row status presents coding work as one clear action', () => {
  assert.deepEqual(
    getTransactionRowStatus({ txn: txn(), hasValidSubCategory: false }),
    { color: 'red', label: 'Needs coding' }
  );
  assert.deepEqual(
    getTransactionRowStatus({
      txn: txn({ codingPendingApproval: true }),
      hasValidSubCategory: true,
    }),
    { color: 'yellow', label: 'Review coding' }
  );
});

test('reversal review takes priority over coding presentation', () => {
  assert.deepEqual(
    getTransactionRowStatus({
      txn: txn({
        codingPendingApproval: true,
        reversal: {
          id: 'reversal_1',
          status: 'auto_matched_pending_approval',
          side: 'source',
        },
      }),
      hasValidSubCategory: true,
    }),
    { color: 'blue', label: 'Review reversal match' }
  );
  assert.deepEqual(
    getTransactionRowStatus({
      txn: txn({
        reversal: {
          id: 'reversal_2',
          status: 'auto_matched_pending_approval',
          side: 'reversal',
        },
      }),
      hasValidSubCategory: true,
    }),
    { color: 'blue', label: 'Suggested reversal' }
  );
});

test('ambiguous pairs use the same review label on both rows', () => {
  for (const side of ['source', 'reversal'] as const) {
    assert.deepEqual(
      getTransactionRowStatus({
        txn: txn({
          reversal: {
            id: `reversal_${side}`,
            status: 'auto_matched_ambiguous_pending_approval',
            side,
          },
        }),
        hasValidSubCategory: true,
      }),
      { color: 'orange', label: 'Review default match' }
    );
  }
});

test('completed and non-categorisable rows avoid false coding warnings', () => {
  assert.deepEqual(
    getTransactionRowStatus({
      txn: txn({
        reversal: {
          id: 'reversal_matched',
          status: 'reversed_matched',
          side: 'source',
        },
      }),
      hasValidSubCategory: true,
    }),
    { color: 'green', label: 'Reversal matched' }
  );
  assert.equal(
    getTransactionRowStatus({
      txn: txn({ categorisable: false }),
      hasValidSubCategory: false,
    }),
    null
  );
  assert.equal(
    getTransactionRowStatus({ txn: txn(), hasValidSubCategory: true }),
    null
  );
});

test('pending and exception reversals retain their distinct action states', () => {
  assert.deepEqual(
    getTransactionRowStatus({
      txn: txn({
        reversal: {
          id: 'reversal_pending',
          status: 'pending_reversal',
          side: 'source',
        },
      }),
      hasValidSubCategory: true,
    }),
    { color: 'violet', label: 'Pending reversal' }
  );
  assert.deepEqual(
    getTransactionRowStatus({
      txn: txn({
        reversal: {
          id: 'reversal_exception',
          status: 'reversal_exception',
          side: 'source',
        },
      }),
      hasValidSubCategory: true,
    }),
    { color: 'red', label: 'Reversal issue' }
  );
});

test('transaction view parsing keeps the filter options and fallback aligned', () => {
  assert.deepEqual(
    TRANSACTION_VIEW_OPTIONS.map((option) => option.value),
    [
      'all',
      'uncoded',
      'needs-review',
      'auto-mapped-pending',
      'assigned-to-me',
      'pending-reversal',
      'matched-reversal-pairs',
    ]
  );
  assert.equal(toTransactionView('needs-review'), 'needs-review');
  assert.equal(toTransactionView('unsupported'), 'all');
  assert.equal(toTransactionView(null), 'all');
});

test('workflow headings describe the selected queue without financial totals', () => {
  assert.equal(
    transactionWorkflowHeading('uncoded', 154),
    '154 transactions need coding'
  );
  assert.equal(
    transactionWorkflowHeading('needs-review', 1),
    '1 transaction needs review'
  );
  assert.equal(
    transactionWorkflowHeading('auto-mapped-pending', 2),
    '2 coding approvals'
  );
  assert.equal(
    transactionWorkflowHeading('pending-reversal', 3),
    '3 reversal workflow items'
  );
});

test('all-transactions workflow badges expose only non-empty queues', () => {
  assert.deepEqual(
    transactionWorkflowBadges('all', {
      totalCount: 12,
      uncodedCount: 1,
      codingApprovalCount: 2,
      reversalReviewCount: 3,
      awaitingReversalCount: 4,
      assignedToMeCount: 0,
    }),
    [
      { color: 'red', label: '1 transaction needs coding' },
      { color: 'yellow', label: '2 coding approvals' },
      { color: 'blue', label: '3 reversal reviews' },
      { color: 'violet', label: '4 awaiting reversals' },
    ]
  );
});

test('filtered workflow summaries avoid repeating their headline', () => {
  const counts = {
    totalCount: 3,
    uncodedCount: 3,
    codingApprovalCount: 1,
    reversalReviewCount: 2,
    awaitingReversalCount: 1,
    assignedToMeCount: 0,
  };

  assert.deepEqual(transactionWorkflowBadges('uncoded', counts), []);
  assert.deepEqual(transactionWorkflowBadges('needs-review', counts), [
    { color: 'yellow', label: '1 coding approval' },
    { color: 'blue', label: '2 reversal reviews' },
  ]);
  assert.deepEqual(transactionWorkflowBadges('pending-reversal', counts), [
    { color: 'violet', label: '1 awaiting reversal' },
    { color: 'blue', label: '2 need review' },
  ]);
});

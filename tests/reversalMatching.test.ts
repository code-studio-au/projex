import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  buildReversalAutoMatchPlan,
  isValidReversalAutoMatchEdge,
  reversalAutoMatchPairKey,
} from '../src/server/fns/transactions/reversalMatching.ts';
import type { Txn } from '../src/types/index.ts';
import { asCompanyId, asProjectId, asTxnId } from '../src/types/index.ts';

function powerBiTxn(args: {
  id: string;
  amountCents: number;
  date?: string;
  source?: string;
  referenceNum?: string;
  costCentre?: string;
}): Txn {
  return {
    id: asTxnId(args.id),
    companyId: asCompanyId('co_reversal_matching'),
    projectId: asProjectId('prj_reversal_matching'),
    date: args.date ?? (args.amountCents > 0 ? '2026-05-31' : '2026-06-30'),
    item: 'Monthly accrual',
    description: 'Monthly accrual',
    amountCents: args.amountCents,
    txnType: 'standard',
    budgetImpact: true,
    categorisable: true,
    importSourceType: 'powerbi_expenditure_actuals',
    importSourceMeta: {
      Source: args.source ?? 'EXA',
      'Journal Line Description': 'Monthly accrual',
      ...(args.referenceNum ? { 'Reference Num': args.referenceNum } : {}),
      ...(args.costCentre ? { 'CC and Description': args.costCentre } : {}),
    },
    codingPendingApproval: false,
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
  };
}

test('ambiguous matching uses only valid cost-centre edges instead of independently zipping candidates', () => {
  const sourceA = powerBiTxn({
    id: 'txn_source_a',
    amountCents: 10000,
    referenceNum: 'REF-A',
  });
  const sourceB = powerBiTxn({
    id: 'txn_source_b',
    amountCents: 10000,
    costCentre: 'CC-B',
  });
  const counterpartA = powerBiTxn({
    id: 'txn_counterpart_a',
    amountCents: -10000,
  });
  const counterpartB = powerBiTxn({
    id: 'txn_counterpart_b',
    amountCents: -10000,
    costCentre: 'CC-A',
  });

  const plan = buildReversalAutoMatchPlan({
    sourceTxns: [sourceA, sourceB],
    counterpartTxns: [counterpartA, counterpartB],
  });

  assert.equal(plan.length, 2);
  assert.ok(
    plan.every((match) =>
      isValidReversalAutoMatchEdge({
        sourceTxn: match.sourceTxn,
        counterpartTxn: match.counterpartTxn,
      })
    )
  );
  assert.equal(
    plan.find((match) => match.sourceTxn.id === sourceA.id)?.counterpartTxn.id,
    counterpartB.id
  );
  assert.equal(
    plan.find((match) => match.sourceTxn.id === sourceB.id)?.counterpartTxn.id,
    counterpartA.id
  );
  assert.ok(plan.every((match) => match.ambiguous));
});

test('ambiguous matching handles asymmetric missing references without creating a conflicting pair', () => {
  const sourceWithReference = powerBiTxn({
    id: 'txn_source_with_ref',
    amountCents: 20000,
    referenceNum: 'REF-A',
  });
  const sourceWithoutReference = powerBiTxn({
    id: 'txn_source_without_ref',
    amountCents: 20000,
  });
  const counterpartWithoutReference = powerBiTxn({
    id: 'txn_counterpart_without_ref',
    amountCents: -20000,
  });
  const counterpartWithDifferentReference = powerBiTxn({
    id: 'txn_counterpart_with_ref',
    amountCents: -20000,
    referenceNum: 'REF-B',
  });

  const plan = buildReversalAutoMatchPlan({
    sourceTxns: [sourceWithReference, sourceWithoutReference],
    counterpartTxns: [
      counterpartWithoutReference,
      counterpartWithDifferentReference,
    ],
  });

  assert.equal(plan.length, 2);
  assert.equal(
    plan.find((match) => match.sourceTxn.id === sourceWithReference.id)
      ?.counterpartTxn.id,
    counterpartWithoutReference.id
  );
  assert.equal(
    plan.find((match) => match.sourceTxn.id === sourceWithoutReference.id)
      ?.counterpartTxn.id,
    counterpartWithDifferentReference.id
  );
  assert.ok(plan.every((match) => match.ambiguous));
});

test('matching excludes previously rejected automatic pairs while retaining other valid candidates', () => {
  const source = powerBiTxn({
    id: 'txn_rejected_source',
    amountCents: 30000,
    referenceNum: 'REF-A',
  });
  const rejectedCounterpart = powerBiTxn({
    id: 'txn_rejected_counterpart',
    amountCents: -30000,
    referenceNum: 'REF-A',
  });
  const alternativeCounterpart = powerBiTxn({
    id: 'txn_alternative_counterpart',
    amountCents: -30000,
    referenceNum: 'REF-A',
  });

  const plan = buildReversalAutoMatchPlan({
    sourceTxns: [source],
    counterpartTxns: [rejectedCounterpart, alternativeCounterpart],
    excludedPairKeys: new Set([
      reversalAutoMatchPairKey(source.id, rejectedCounterpart.id),
    ]),
  });

  assert.equal(plan.length, 1);
  assert.equal(plan[0]?.counterpartTxn.id, alternativeCounterpart.id);
  assert.equal(plan[0]?.ambiguous, false);
});

test('matching supports arbitrary same-source Power BI transactions', () => {
  const source = powerBiTxn({
    id: 'txn_custom_source',
    amountCents: 1_121_434,
    date: '2024-06-13',
    source: 'Customer Ledger Next',
    costCentre: '6401 (Contractors)',
  });
  const counterpart = powerBiTxn({
    id: 'txn_custom_counterpart',
    amountCents: -1_121_434,
    date: '2024-06-13',
    source: ' customer ledger next ',
    costCentre: '6401 (Contractors)',
  });

  assert.ok(
    isValidReversalAutoMatchEdge({
      sourceTxn: source,
      counterpartTxn: counterpart,
    })
  );
  assert.equal(
    buildReversalAutoMatchPlan({
      sourceTxns: [source],
      counterpartTxns: [counterpart],
    })[0]?.counterpartTxn.id,
    counterpart.id
  );
});

test('matching never pairs transactions from different Power BI sources', () => {
  const source = powerBiTxn({
    id: 'txn_source_system_a',
    amountCents: 40_000,
    source: 'System A',
  });
  const counterpart = powerBiTxn({
    id: 'txn_source_system_b',
    amountCents: -40_000,
    source: 'System B',
  });

  assert.equal(
    isValidReversalAutoMatchEdge({
      sourceTxn: source,
      counterpartTxn: counterpart,
    }),
    false
  );
  assert.deepEqual(
    buildReversalAutoMatchPlan({
      sourceTxns: [source],
      counterpartTxns: [counterpart],
    }),
    []
  );
});

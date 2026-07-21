import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  buildReversalAutoMatchPlan,
  isValidReversalAutoMatchEdge,
  reversalAutoMatchPairKey,
} from '../src/server/fns/transactions/reversalMatching.ts';
import type { Txn } from '../src/types/index.ts';
import { asCompanyId, asProjectId, asTxnId } from '../src/types/index.ts';

function exaTxn(args: {
  id: string;
  amountCents: number;
  date?: string;
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
      Source: 'EXA',
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
  const sourceA = exaTxn({
    id: 'txn_source_a',
    amountCents: 10000,
    referenceNum: 'REF-A',
  });
  const sourceB = exaTxn({
    id: 'txn_source_b',
    amountCents: 10000,
    costCentre: 'CC-B',
  });
  const counterpartA = exaTxn({
    id: 'txn_counterpart_a',
    amountCents: -10000,
  });
  const counterpartB = exaTxn({
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
  const sourceWithReference = exaTxn({
    id: 'txn_source_with_ref',
    amountCents: 20000,
    referenceNum: 'REF-A',
  });
  const sourceWithoutReference = exaTxn({
    id: 'txn_source_without_ref',
    amountCents: 20000,
  });
  const counterpartWithoutReference = exaTxn({
    id: 'txn_counterpart_without_ref',
    amountCents: -20000,
  });
  const counterpartWithDifferentReference = exaTxn({
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
  const source = exaTxn({
    id: 'txn_rejected_source',
    amountCents: 30000,
    referenceNum: 'REF-A',
  });
  const rejectedCounterpart = exaTxn({
    id: 'txn_rejected_counterpart',
    amountCents: -30000,
    referenceNum: 'REF-A',
  });
  const alternativeCounterpart = exaTxn({
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

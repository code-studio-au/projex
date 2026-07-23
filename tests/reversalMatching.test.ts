import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  buildReversalAutoMatchPlan,
  isValidReversalAutoMatchEdge,
  reversalAutoMatchPairKey,
} from '../src/server/fns/transactions/reversalMatching.ts';
import { buildReversalMatchEvidence } from '../src/server/fns/transactions/reversalMatchFacts.ts';
import { assertCounterpartTxnEligible } from '../src/server/fns/transactions/reversalDomain.ts';
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

test('matching is provider agnostic when canonical source facts align', () => {
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
  source.importSourceType = 'concur_journal' as never;
  counterpart.importSourceType = 'concur_journal' as never;

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

test('matching never pairs transactions from different source systems', () => {
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

test('matching only considers reversals dated on or after the source', () => {
  const source = powerBiTxn({
    id: 'txn_date_source',
    amountCents: 40_000,
    date: '2026-06-30',
  });
  const earlierCounterpart = powerBiTxn({
    id: 'txn_date_counterpart',
    amountCents: -40_000,
    date: '2026-05-31',
  });

  assert.equal(
    isValidReversalAutoMatchEdge({
      sourceTxn: source,
      counterpartTxn: earlierCounterpart,
    }),
    false
  );
  assert.throws(
    () =>
      assertCounterpartTxnEligible({
        sourceTxn: source,
        counterpartTxn: earlierCounterpart,
      }),
    /reversal must be dated on or after its source/i
  );
});

test('match evidence preserves human-verifiable pair facts and alternatives', () => {
  const source = powerBiTxn({
    id: 'txn_evidence_source',
    amountCents: 50_000,
    date: '2026-05-31',
    referenceNum: 'REF-50',
  });
  const counterpart = powerBiTxn({
    id: 'txn_evidence_counterpart',
    amountCents: -50_000,
    date: '2026-06-30',
    referenceNum: 'REF-50',
  });
  const alternative = {
    ...counterpart,
    id: asTxnId('txn_evidence_alternative'),
  };

  const evidence = buildReversalMatchEvidence({
    sourceTxn: source,
    counterpartTxn: counterpart,
    sourceCandidateCount: 2,
    counterpartCandidateCount: 1,
    alternativeCounterparts: [alternative],
  });

  assert.equal(evidence.amountExact, true);
  assert.equal(evidence.oppositeSign, true);
  assert.equal(evidence.dayDelta, 30);
  assert.equal(evidence.reference?.outcome, 'match');
  assert.equal(evidence.sourceCandidateCount, 2);
  assert.equal(evidence.alternativeCounterparts?.[0]?.txnId, alternative.id);
});

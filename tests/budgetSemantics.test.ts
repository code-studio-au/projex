import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  calculateAllocationPosition,
  calculateBudgetPosition,
} from '../src/utils/budgetSemantics.ts';

test('budget position reconciles recorded and expected spend without mixing allocations', () => {
  const result = calculateBudgetPosition({
    projectBudgetCents: 100_000,
    codedActualCents: 60_000,
    uncodedExposureCents: 5_000,
    uncodedCount: 2,
    pendingReversalCents: 10_000,
  });

  assert.equal(result.recordedSpendCents, 65_000);
  assert.equal(result.expectedSpendAfterPendingReversalsCents, 55_000);
  assert.equal(result.confirmedHeadroomCents, 35_000);
  assert.equal(result.expectedHeadroomAfterPendingReversalsCents, 45_000);
  assert.equal(result.spendUtilizationPct, 65);
  assert.equal(result.health.status, 'watch');
});

test('allocation position reports unallocated project budget separately', () => {
  assert.deepEqual(
    calculateAllocationPosition({
      projectBudgetCents: 100_000,
      allocatedBudgetCents: 80_000,
    }),
    {
      allocatedBudgetCents: 80_000,
      unallocatedBudgetCents: 20_000,
      allocationCoveragePct: 80,
    }
  );
});

test.each([
  { spend: 74_999, expected: 'healthy' },
  { spend: 75_000, expected: 'watch' },
  { spend: 89_999, expected: 'watch' },
  { spend: 90_000, expected: 'at-risk' },
  { spend: 100_000, expected: 'at-risk' },
  { spend: 100_001, expected: 'over-budget' },
] as const)(
  'budget health classifies $spend cents as $expected',
  ({ spend, expected }) => {
    const result = calculateBudgetPosition({
      projectBudgetCents: 100_000,
      codedActualCents: spend,
      uncodedExposureCents: 0,
      pendingReversalCents: 0,
    });

    assert.equal(result.health.status, expected);
  }
);

test('unresolved exposure moves an otherwise healthy project to watch', () => {
  const uncoded = calculateBudgetPosition({
    projectBudgetCents: 100_000,
    codedActualCents: 10_000,
    uncodedExposureCents: 0,
    uncodedCount: 1,
    pendingReversalCents: 0,
  });
  const pending = calculateBudgetPosition({
    projectBudgetCents: 100_000,
    codedActualCents: 10_000,
    uncodedExposureCents: 0,
    pendingReversalCents: 2_000,
  });
  const recordedCandidatePendingApproval = calculateBudgetPosition({
    projectBudgetCents: 100_000,
    codedActualCents: 8_000,
    uncodedExposureCents: 0,
    pendingReversalCount: 1,
    pendingReversalCents: 0,
  });

  assert.equal(uncoded.health.status, 'watch');
  assert.equal(pending.health.status, 'watch');
  assert.equal(recordedCandidatePendingApproval.health.status, 'watch');
  assert.equal(
    recordedCandidatePendingApproval.expectedSpendAfterPendingReversalsCents,
    8_000
  );
});

test('a missing budget is watch until spend makes it over budget', () => {
  const unconfigured = calculateBudgetPosition({
    projectBudgetCents: 0,
    codedActualCents: 0,
    uncodedExposureCents: 0,
    pendingReversalCents: 0,
  });
  const spent = calculateBudgetPosition({
    projectBudgetCents: 0,
    codedActualCents: 1,
    uncodedExposureCents: 0,
    pendingReversalCents: 0,
  });

  assert.equal(unconfigured.health.status, 'watch');
  assert.equal(unconfigured.spendUtilizationPct, null);
  assert.equal(spent.health.status, 'over-budget');
});

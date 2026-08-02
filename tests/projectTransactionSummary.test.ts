import { describe, expect, test } from 'vitest';

import { summarizeProjectTransactionPeriods } from '../src/utils/projectTransactionSummary';

describe('project transaction period summary model', () => {
  test('filters and aggregates all workflow totals in one model pass', () => {
    const periods = [
      {
        monthKey: '2026-01',
        uncodedCount: 2,
        uncodedAmountCents: 1200,
        pendingReversalCount: 1,
        pendingReversalCents: -450,
      },
      {
        monthKey: '2026-02',
        uncodedCount: 3,
        uncodedAmountCents: -300,
        pendingReversalCount: 4,
        pendingReversalCents: 900,
      },
      {
        monthKey: '2025-12',
        uncodedCount: 50,
        uncodedAmountCents: 50_000,
        pendingReversalCount: 50,
        pendingReversalCents: 50_000,
      },
    ];

    expect(
      summarizeProjectTransactionPeriods(periods, (period) =>
        period.monthKey.startsWith('2026-')
      )
    ).toEqual({
      uncodedCount: 5,
      uncodedAmountCents: 900,
      pendingReversalCount: 5,
      pendingReversalCents: 450,
    });
  });

  test('returns zero totals when no periods are visible', () => {
    expect(summarizeProjectTransactionPeriods([], () => true)).toEqual({
      uncodedCount: 0,
      uncodedAmountCents: 0,
      pendingReversalCount: 0,
      pendingReversalCents: 0,
    });
  });
});

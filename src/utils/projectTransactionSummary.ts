import type { ProjectTransactionSummary } from '../api/types';

type ProjectTransactionPeriod =
  ProjectTransactionSummary['periodSummaries'][number];

export type ProjectTransactionPeriodTotals = Pick<
  ProjectTransactionPeriod,
  | 'uncodedCount'
  | 'uncodedAmountCents'
  | 'pendingReversalCount'
  | 'pendingReversalCents'
>;

export function summarizeProjectTransactionPeriods(
  periods: ProjectTransactionPeriod[],
  isVisible: (period: ProjectTransactionPeriod) => boolean
): ProjectTransactionPeriodTotals {
  return periods.reduce<ProjectTransactionPeriodTotals>(
    (totals, period) => {
      if (!isVisible(period)) return totals;

      totals.uncodedCount += period.uncodedCount;
      totals.uncodedAmountCents += period.uncodedAmountCents;
      totals.pendingReversalCount += period.pendingReversalCount;
      totals.pendingReversalCents += period.pendingReversalCents;
      return totals;
    },
    {
      uncodedCount: 0,
      uncodedAmountCents: 0,
      pendingReversalCount: 0,
      pendingReversalCents: 0,
    }
  );
}

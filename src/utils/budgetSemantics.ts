type BudgetHealthStatus = 'healthy' | 'watch' | 'at-risk' | 'over-budget';

export type BudgetHealth = {
  status: BudgetHealthStatus;
  label: 'Healthy' | 'Watch' | 'At risk' | 'Over budget';
  color: 'green' | 'yellow' | 'orange' | 'red';
  reason: string;
};

export type BudgetPosition = {
  projectBudgetCents: number;
  codedActualCents: number;
  uncodedExposureCents: number;
  recordedSpendCents: number;
  pendingReversalCount: number;
  pendingReversalCents: number;
  expectedSpendAfterPendingReversalsCents: number;
  confirmedHeadroomCents: number;
  expectedHeadroomAfterPendingReversalsCents: number;
  spendUtilizationPct: number | null;
  health: BudgetHealth;
};

export type AllocationPosition = {
  allocatedBudgetCents: number;
  unallocatedBudgetCents: number;
  allocationCoveragePct: number | null;
};

export function calculateAllocationPosition(args: {
  projectBudgetCents: number;
  allocatedBudgetCents: number;
}): AllocationPosition {
  return {
    allocatedBudgetCents: args.allocatedBudgetCents,
    unallocatedBudgetCents: args.projectBudgetCents - args.allocatedBudgetCents,
    allocationCoveragePct:
      args.projectBudgetCents > 0
        ? (args.allocatedBudgetCents / args.projectBudgetCents) * 100
        : null,
  };
}

export function calculateBudgetPosition(args: {
  projectBudgetCents: number;
  codedActualCents: number;
  uncodedExposureCents: number;
  uncodedCount?: number;
  pendingReversalCount?: number;
  pendingReversalCents: number;
}): BudgetPosition {
  const pendingReversalCents = Math.max(0, args.pendingReversalCents);
  const recordedSpendCents = args.codedActualCents + args.uncodedExposureCents;
  const expectedSpendAfterPendingReversalsCents =
    recordedSpendCents - pendingReversalCents;
  const confirmedHeadroomCents = args.projectBudgetCents - recordedSpendCents;
  const expectedHeadroomAfterPendingReversalsCents =
    args.projectBudgetCents - expectedSpendAfterPendingReversalsCents;
  const spendUtilizationPct =
    args.projectBudgetCents > 0
      ? (recordedSpendCents / args.projectBudgetCents) * 100
      : null;
  const hasUncodedExposure =
    (args.uncodedCount ?? 0) > 0 || args.uncodedExposureCents !== 0;
  const pendingReversalCount = Math.max(0, args.pendingReversalCount ?? 0);
  const hasPendingReversal =
    pendingReversalCount > 0 || pendingReversalCents > 0;

  let health: BudgetHealth;
  if (confirmedHeadroomCents < 0) {
    health = {
      status: 'over-budget',
      label: 'Over budget',
      color: 'red',
      reason: 'Recorded spend exceeds the approved project budget.',
    };
  } else if (args.projectBudgetCents <= 0) {
    health = {
      status: 'watch',
      label: 'Watch',
      color: 'yellow',
      reason: 'No project budget has been set.',
    };
  } else if ((spendUtilizationPct ?? 0) >= 90) {
    health = {
      status: 'at-risk',
      label: 'At risk',
      color: 'orange',
      reason: 'Recorded spend has reached at least 90% of the project budget.',
    };
  } else if (hasUncodedExposure && hasPendingReversal) {
    health = {
      status: 'watch',
      label: 'Watch',
      color: 'yellow',
      reason: 'Uncoded exposure and pending reversals still need resolution.',
    };
  } else if (hasUncodedExposure) {
    health = {
      status: 'watch',
      label: 'Watch',
      color: 'yellow',
      reason: 'Uncoded transactions are included in recorded spend.',
    };
  } else if (hasPendingReversal) {
    health = {
      status: 'watch',
      label: 'Watch',
      color: 'yellow',
      reason: 'Pending reversals could improve the expected budget position.',
    };
  } else if ((spendUtilizationPct ?? 0) >= 75) {
    health = {
      status: 'watch',
      label: 'Watch',
      color: 'yellow',
      reason: 'Recorded spend has reached at least 75% of the project budget.',
    };
  } else {
    health = {
      status: 'healthy',
      label: 'Healthy',
      color: 'green',
      reason: 'Recorded spend is below 75% with no unresolved exposure.',
    };
  }

  return {
    projectBudgetCents: args.projectBudgetCents,
    codedActualCents: args.codedActualCents,
    uncodedExposureCents: args.uncodedExposureCents,
    recordedSpendCents,
    pendingReversalCount,
    pendingReversalCents,
    expectedSpendAfterPendingReversalsCents,
    confirmedHeadroomCents,
    expectedHeadroomAfterPendingReversalsCents,
    spendUtilizationPct,
    health,
  };
}

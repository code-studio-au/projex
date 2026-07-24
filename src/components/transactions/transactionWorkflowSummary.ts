import type { TransactionView } from './transactionViews';

type WorkflowSummaryCounts = {
  totalCount: number;
  uncodedCount: number;
  codingApprovalCount: number;
  reversalReviewCount: number;
  awaitingReversalCount: number;
  assignedToMeCount: number;
};

export type WorkflowSummaryBadge = {
  color: 'blue' | 'orange' | 'red' | 'violet' | 'yellow';
  label: string;
};

function transactionsLabel(count: number) {
  return `${count} transaction${count === 1 ? '' : 's'}`;
}

function countBadge(
  count: number,
  singular: string,
  plural: string,
  color: WorkflowSummaryBadge['color']
): WorkflowSummaryBadge | null {
  if (count === 0) return null;
  return {
    color,
    label: `${count} ${count === 1 ? singular : plural}`,
  };
}

export function transactionWorkflowHeading(
  transactionView: TransactionView,
  totalCount: number
) {
  const transactions = transactionsLabel(totalCount);
  const needs = totalCount === 1 ? 'needs' : 'need';
  if (transactionView === 'uncoded') return `${transactions} ${needs} coding`;
  if (transactionView === 'needs-review') {
    return `${transactions} ${needs} review`;
  }
  if (transactionView === 'auto-mapped-pending') {
    return `${totalCount} coding approval${totalCount === 1 ? '' : 's'}`;
  }
  if (transactionView === 'reversal-review') {
    return `${totalCount} reversal decision${totalCount === 1 ? '' : 's'}`;
  }
  if (transactionView === 'unlock-requests') {
    return `${totalCount} unlock request${totalCount === 1 ? '' : 's'}`;
  }
  if (transactionView === 'assigned-to-me') {
    return `${transactions} assigned to you`;
  }
  if (transactionView === 'pending-reversal') {
    return `${totalCount} reversal workflow item${totalCount === 1 ? '' : 's'}`;
  }
  if (transactionView === 'matched-reversal-pairs') {
    return `${totalCount} matched reversal transaction${totalCount === 1 ? '' : 's'}`;
  }
  return transactions;
}

export function transactionWorkflowBadges(
  transactionView: TransactionView,
  counts: WorkflowSummaryCounts
): WorkflowSummaryBadge[] {
  const badges: Array<WorkflowSummaryBadge | null> = [];

  if (transactionView === 'all') {
    badges.push(
      countBadge(
        counts.uncodedCount,
        'transaction needs coding',
        'need coding',
        'red'
      ),
      countBadge(
        counts.codingApprovalCount,
        'coding approval',
        'coding approvals',
        'yellow'
      ),
      countBadge(
        counts.reversalReviewCount,
        'reversal review',
        'reversal reviews',
        'blue'
      ),
      countBadge(
        counts.assignedToMeCount,
        'assigned to you',
        'assigned to you',
        'orange'
      ),
      countBadge(
        counts.awaitingReversalCount,
        'awaiting reversal',
        'awaiting reversals',
        'violet'
      )
    );
  } else if (transactionView === 'needs-review') {
    badges.push(
      countBadge(
        counts.codingApprovalCount,
        'coding approval',
        'coding approvals',
        'yellow'
      ),
      countBadge(
        counts.reversalReviewCount,
        'reversal review',
        'reversal reviews',
        'blue'
      )
    );
  } else if (transactionView === 'pending-reversal') {
    badges.push(
      countBadge(
        counts.awaitingReversalCount,
        'awaiting reversal',
        'awaiting reversals',
        'violet'
      ),
      countBadge(
        counts.reversalReviewCount,
        'item needs review',
        'need review',
        'blue'
      )
    );
  }

  return badges.filter((badge): badge is WorkflowSummaryBadge => !!badge);
}

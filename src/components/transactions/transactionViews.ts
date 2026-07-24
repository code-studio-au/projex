export type TransactionView =
  | 'all'
  | 'uncoded'
  | 'needs-review'
  | 'auto-mapped-pending'
  | 'reversal-review'
  | 'unlock-requests'
  | 'assigned-to-me'
  | 'pending-reversal'
  | 'matched-reversal-pairs';

export const TRANSACTION_VIEW_OPTIONS: Array<{
  value: TransactionView;
  label: string;
  description: string;
  group: 'Common views' | 'Specialist views';
}> = [
  {
    value: 'all',
    label: 'All transactions',
    description: 'Every transaction in the selected period.',
    group: 'Common views',
  },
  {
    value: 'uncoded',
    label: 'Needs coding',
    description: 'Transactions without valid coding.',
    group: 'Common views',
  },
  {
    value: 'needs-review',
    label: 'Needs review',
    description: 'Coding approvals and reversal decisions requiring attention.',
    group: 'Common views',
  },
  {
    value: 'auto-mapped-pending',
    label: 'Coding approvals',
    description: 'Auto-coded transactions waiting for approval.',
    group: 'Specialist views',
  },
  {
    value: 'reversal-review',
    label: 'Reversal decisions',
    description: 'Suggested matches and exceptions requiring a decision.',
    group: 'Specialist views',
  },
  {
    value: 'unlock-requests',
    label: 'Unlock requests',
    description: 'Locked transactions with an open unlock request.',
    group: 'Specialist views',
  },
  {
    value: 'assigned-to-me',
    label: 'Assigned to me',
    description: 'Transactions with an unresolved comment assigned to you.',
    group: 'Common views',
  },
  {
    value: 'pending-reversal',
    label: 'Open reversal items',
    description: 'Reversals awaiting a match, approval, or resolution.',
    group: 'Specialist views',
  },
  {
    value: 'matched-reversal-pairs',
    label: 'Matched reversal pairs',
    description: 'Completed and approved source/reversal transactions.',
    group: 'Specialist views',
  },
];

export const TRANSACTION_VIEW_GROUPS = (
  ['Common views', 'Specialist views'] as const
).map((group) => ({
  group,
  items: TRANSACTION_VIEW_OPTIONS.filter(
    (option) => option.group === group
  ).map(({ value, label }) => ({ value, label })),
}));

export function toTransactionView(value: string | null): TransactionView {
  return TRANSACTION_VIEW_OPTIONS.some((option) => option.value === value)
    ? (value as TransactionView)
    : 'all';
}

function transactionViewLabel(view: TransactionView) {
  return (
    TRANSACTION_VIEW_OPTIONS.find((option) => option.value === view)?.label ??
    'All transactions'
  );
}

export function transactionViewDescription(view: TransactionView) {
  return (
    TRANSACTION_VIEW_OPTIONS.find((option) => option.value === view)
      ?.description ?? 'Every transaction in the selected period.'
  );
}

export function transactionEmptyStateMessage(args: {
  transactionView: TransactionView;
  yearFilter: string | null;
  quarterFilter: string | null;
  monthFilterKey: string | null;
  drilldownLabel?: string | null;
  search?: string | null;
}) {
  const filters: string[] = [];

  if (args.transactionView !== 'all') {
    filters.push(`the "${transactionViewLabel(args.transactionView)}" view`);
  }

  if (args.monthFilterKey) {
    filters.push(`month ${args.monthFilterKey}`);
  } else if (args.quarterFilter) {
    filters.push(
      args.yearFilter
        ? `${args.quarterFilter} ${args.yearFilter}`
        : args.quarterFilter
    );
  } else if (args.yearFilter) {
    filters.push(`year ${args.yearFilter}`);
  }

  if (args.drilldownLabel) {
    filters.push(`the "${args.drilldownLabel}" budget drilldown`);
  }

  if (args.search?.trim()) {
    filters.push(`search "${args.search.trim()}"`);
  }

  return filters.length
    ? `No transactions match ${filters.join(' and ')}.`
    : 'No transactions have been imported for this project yet.';
}

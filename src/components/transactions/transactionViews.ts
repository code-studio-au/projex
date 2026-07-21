export type TransactionView =
  | 'all'
  | 'uncoded'
  | 'needs-review'
  | 'auto-mapped-pending'
  | 'assigned-to-me'
  | 'pending-reversal'
  | 'matched-reversal-pairs';

export const TRANSACTION_VIEW_OPTIONS: Array<{
  value: TransactionView;
  label: string;
}> = [
  { value: 'all', label: 'All transactions' },
  { value: 'uncoded', label: 'Needs coding' },
  { value: 'needs-review', label: 'Needs review' },
  { value: 'auto-mapped-pending', label: 'Coding approvals' },
  { value: 'assigned-to-me', label: 'Assigned to me' },
  { value: 'pending-reversal', label: 'Pending reversals' },
  { value: 'matched-reversal-pairs', label: 'Matched reversal pairs' },
];

export function toTransactionView(value: string | null): TransactionView {
  return TRANSACTION_VIEW_OPTIONS.some((option) => option.value === value)
    ? (value as TransactionView)
    : 'all';
}

import type { Txn } from '../../types';
import { isCategorisableTxn } from '../../utils/transactions';

export type TransactionRowStatus = {
  color: 'blue' | 'green' | 'orange' | 'red' | 'violet' | 'yellow';
  label: string;
};

export function getTransactionRowStatus(args: {
  txn: Txn;
  hasValidSubCategory: boolean;
}): TransactionRowStatus | null {
  const { txn, hasValidSubCategory } = args;

  if (txn.reversal?.status === 'reversal_exception') {
    return { color: 'red', label: 'Reversal issue' };
  }
  if (txn.reversal?.status === 'auto_matched_ambiguous_pending_approval') {
    return { color: 'orange', label: 'Review default match' };
  }
  if (txn.reversal?.status === 'auto_matched_pending_approval') {
    return {
      color: 'blue',
      label:
        txn.reversal.side === 'source'
          ? 'Review reversal match'
          : 'Suggested reversal',
    };
  }
  if (txn.reversal?.status === 'pending_reversal') {
    return { color: 'violet', label: 'Pending reversal' };
  }
  if (txn.reversal?.status === 'reversed_matched') {
    return { color: 'green', label: 'Reversal matched' };
  }
  if (txn.codingPendingApproval && hasValidSubCategory) {
    return { color: 'yellow', label: 'Review coding' };
  }
  if (isCategorisableTxn(txn) && !hasValidSubCategory) {
    return { color: 'red', label: 'Needs coding' };
  }
  return null;
}

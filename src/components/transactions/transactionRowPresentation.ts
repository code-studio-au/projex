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

  if (txn.pendingUnlockRequest) {
    return { color: 'orange', label: 'Unlock review' };
  }

  if (txn.reversal?.status === 'reversal_exception') {
    return { color: 'red', label: 'Reversal issue' };
  }
  if (txn.reversal?.status === 'auto_matched_ambiguous_pending_approval') {
    return {
      color: 'orange',
      label:
        txn.reversal.side === 'source'
          ? 'Review default match'
          : 'Default reversal',
    };
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
    return { color: 'violet', label: 'Awaiting reversal' };
  }
  if (txn.reversal?.status === 'reversed_matched') {
    return {
      color: 'green',
      label:
        txn.reversal.side === 'source'
          ? 'Matched original'
          : 'Matched reversal',
    };
  }
  if (txn.codingPendingApproval && hasValidSubCategory) {
    return { color: 'yellow', label: 'Review coding' };
  }
  if (isCategorisableTxn(txn) && !hasValidSubCategory) {
    return { color: 'red', label: 'Needs coding' };
  }
  return null;
}

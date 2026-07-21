import { useState } from 'react';

import type { TxnBulkActionInput, TxnBulkActionResult } from '../../api/types';
import { showAppToast } from '../../utils/toast';
import {
  formatTxnCountLabel,
  showBulkActionResultToast,
} from './transactionsPanelUtils';

export function useTransactionBulkActionsController(args: {
  mutate: (input: TxnBulkActionInput) => Promise<TxnBulkActionResult>;
  clearSelection: () => void;
}) {
  const [reconcilingPendingReversals, setReconcilingPendingReversals] =
    useState(false);

  async function runBulkAction(command: {
    input: TxnBulkActionInput;
    successLabel: string;
    clearSelection?: boolean;
  }) {
    try {
      const result = await args.mutate(command.input);
      showBulkActionResultToast({
        result,
        successLabel: command.successLabel,
      });
      if (command.clearSelection ?? true) {
        args.clearSelection();
      }
      return result;
    } catch (error) {
      showAppToast({
        title: 'Bulk action failed',
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not update the selected transactions.',
      });
      return null;
    }
  }

  async function reconcilePendingReversals() {
    setReconcilingPendingReversals(true);
    try {
      const result = await args.mutate({
        action: 'reconcilePendingReversals',
      });
      showAppToast({
        title:
          result.updatedCount > 0
            ? 'Reversal matches found'
            : 'No new reversal matches',
        tone: result.updatedCount > 0 ? 'success' : 'info',
        message:
          result.updatedCount > 0
            ? `Suggested ${formatTxnCountLabel(result.updatedCount)} for review.`
            : 'No eligible pending reversals matched an unclaimed existing EXA transaction.',
      });
    } catch (error) {
      showAppToast({
        title: 'Reversal matching failed',
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not search for pending reversal matches.',
      });
    } finally {
      setReconcilingPendingReversals(false);
    }
  }

  return {
    reconcilePendingReversals,
    reconcilingPendingReversals,
    runBulkAction,
  };
}

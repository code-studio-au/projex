import type { ProjectId, TxnId } from '../types';
import type {
  TxnBulkActionInput,
  TxnBulkActionResult,
  TxnReversalActionInput,
  TxnReversalActionResult,
  TxnReversalMatchSuggestion,
  TxnSplitInput,
  TxnTransferInput,
  TxnUpdateInput,
  TxnUpdateResult,
} from '../api/types';
import {
  useBulkTxnActionMutation,
  useSplitTxnMutation,
  useTxnReversalActionMutation,
  useTxnReversalSuggestionsMutation,
  useTransferTxnMutation,
  useUpdateTxnMutation,
  useUpdateTxnWorkflowStateMutation,
} from '../queries/transactions';

export type TransactionActions = {
  updateTxn: (
    id: TxnId,
    patch: Omit<TxnUpdateInput, 'id'>
  ) => Promise<TxnUpdateResult>;
  splitTxn: (id: TxnId, children: TxnSplitInput['children']) => Promise<void>;
  transferTxn: (
    id: TxnId,
    input: Omit<TxnTransferInput, 'txnId'>
  ) => Promise<void>;
  updateWorkflowState: (
    id: TxnId,
    patch: { reviewed?: boolean; locked?: boolean }
  ) => Promise<void>;
  runBulkAction: (input: TxnBulkActionInput) => Promise<TxnBulkActionResult>;
  runReversalAction: (
    input: TxnReversalActionInput
  ) => Promise<TxnReversalActionResult>;
  getReversalSuggestions: (
    txnId: TxnId
  ) => Promise<TxnReversalMatchSuggestion[]>;
};

export function useTransactionActions(
  projectId: ProjectId
): TransactionActions {
  const update = useUpdateTxnMutation(projectId);
  const split = useSplitTxnMutation(projectId);
  const transfer = useTransferTxnMutation(projectId);
  const workflowState = useUpdateTxnWorkflowStateMutation(projectId);
  const bulkTxnAction = useBulkTxnActionMutation(projectId);
  const reversalAction = useTxnReversalActionMutation(projectId);
  const reversalSuggestions = useTxnReversalSuggestionsMutation(projectId);

  return {
    updateTxn: (id, patch) => update.mutateAsync({ id, ...patch }),
    splitTxn: async (id, children) => {
      await split.mutateAsync({ txnId: id, children });
    },
    transferTxn: async (id, input) => {
      await transfer.mutateAsync({ txnId: id, ...input });
    },
    updateWorkflowState: async (id, patch) => {
      await workflowState.mutateAsync({ txnId: id, ...patch });
    },
    runBulkAction: (input) => bulkTxnAction.mutateAsync(input),
    runReversalAction: (input) => reversalAction.mutateAsync(input),
    getReversalSuggestions: (txnId) => reversalSuggestions.mutateAsync(txnId),
  };
}

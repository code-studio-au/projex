import type { ProjectId, TxnId } from '../types';
import type {
  TxnBulkActionInput,
  TxnBulkActionResult,
  TxnReversalActionInput,
  TxnReversalActionResult,
  TxnSplitInput,
  TxnTransferInput,
  TxnUpdateInput,
  TxnUpdateResult,
  TxnUnlockRequestInput,
  TxnUnlockResolutionInput,
} from '../api/types';
import {
  useBulkTxnActionMutation,
  useSplitTxnMutation,
  useTxnReversalActionMutation,
  useTransferTxnMutation,
  useUpdateTxnMutation,
  useUpdateTxnWorkflowStateMutation,
  useRequestTxnUnlockMutation,
  useResolveTxnUnlockRequestMutation,
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
    patch: {
      expectedWorkflowVersion: number;
      reviewed?: boolean;
      locked?: boolean;
      reason?: string;
    }
  ) => Promise<void>;
  requestUnlock: (input: TxnUnlockRequestInput) => Promise<void>;
  resolveUnlockRequest: (input: TxnUnlockResolutionInput) => Promise<void>;
  runBulkAction: (input: TxnBulkActionInput) => Promise<TxnBulkActionResult>;
  runReversalAction: (
    input: TxnReversalActionInput
  ) => Promise<TxnReversalActionResult>;
};

export function useTransactionActions(
  projectId: ProjectId
): TransactionActions {
  const update = useUpdateTxnMutation(projectId);
  const split = useSplitTxnMutation(projectId);
  const transfer = useTransferTxnMutation(projectId);
  const workflowState = useUpdateTxnWorkflowStateMutation(projectId);
  const bulkTxnAction = useBulkTxnActionMutation(projectId);
  const requestUnlock = useRequestTxnUnlockMutation(projectId);
  const resolveUnlock = useResolveTxnUnlockRequestMutation(projectId);
  const reversalAction = useTxnReversalActionMutation(projectId);

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
    requestUnlock: async (input) => {
      await requestUnlock.mutateAsync(input);
    },
    resolveUnlockRequest: async (input) => {
      await resolveUnlock.mutateAsync(input);
    },
    runBulkAction: (input) => bulkTxnAction.mutateAsync(input),
    runReversalAction: (input) => reversalAction.mutateAsync(input),
  };
}

import { useMemo } from 'react';

import type {
  CategoryId,
  ProjectId,
  SubCategoryId,
  Txn,
  TxnId,
} from '../types';
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
import { useImportTransactionsMutation } from '../queries/admin';
import {
  useBulkTxnActionMutation,
  useSplitTxnMutation,
  useTxnReversalActionMutation,
  useTxnReversalSuggestionsMutation,
  useTransferTxnMutation,
  useTransactionsQuery,
  useUpdateTxnMutation,
  useUpdateTxnWorkflowStateMutation,
} from '../queries/transactions';
import { isCategorisableTxn } from '../utils/transactions';

/**
 * Query-backed transactions model.
 *
 * Notes:
 * - For batch operations (strip coding / replaceAll / appendMany) we currently
 *   route through the import endpoint until dedicated batch mutations exist.
 */
export function useTransactions(params: {
  projectId: ProjectId;
  enabled?: boolean;
}) {
  const { projectId, enabled = true } = params;
  const q = useTransactionsQuery(projectId, { enabled });
  const update = useUpdateTxnMutation(projectId);
  const split = useSplitTxnMutation(projectId);
  const transfer = useTransferTxnMutation(projectId);
  const workflowState = useUpdateTxnWorkflowStateMutation(projectId);
  const bulkTxnAction = useBulkTxnActionMutation(projectId);
  const reversalAction = useTxnReversalActionMutation(projectId);
  const reversalSuggestions = useTxnReversalSuggestionsMutation(projectId);
  const importMut = useImportTransactionsMutation(projectId);

  const transactions = useMemo(() => q.data ?? [], [q.data]);

  const updateTxn = async (
    id: TxnId,
    patch: Omit<TxnUpdateInput, 'id'>
  ): Promise<TxnUpdateResult> => update.mutateAsync({ id, ...patch });

  const splitTxn = async (id: TxnId, children: TxnSplitInput['children']) => {
    await split.mutateAsync({ txnId: id, children });
  };

  const transferTxn = async (
    id: TxnId,
    input: Omit<TxnTransferInput, 'txnId'>
  ) => {
    await transfer.mutateAsync({ txnId: id, ...input });
  };

  const updateWorkflowState = async (
    id: TxnId,
    patch: { reviewed?: boolean; locked?: boolean }
  ) => {
    await workflowState.mutateAsync({ txnId: id, ...patch });
  };

  const runBulkAction = async (
    input: TxnBulkActionInput
  ): Promise<TxnBulkActionResult> => bulkTxnAction.mutateAsync(input);

  const runReversalAction = async (
    input: TxnReversalActionInput
  ): Promise<TxnReversalActionResult> => reversalAction.mutateAsync(input);

  const getReversalSuggestions = async (
    txnId: TxnId
  ): Promise<TxnReversalMatchSuggestion[]> =>
    reversalSuggestions.mutateAsync(txnId);

  const replaceAll = async (
    next: Txn[],
    options?: { autoCreateBudgets?: boolean }
  ) => {
    await importMut.mutateAsync({
      txns: next,
      mode: 'replaceAll',
      autoCreateBudgets: options?.autoCreateBudgets,
    });
  };

  const appendMany = async (
    next: Txn[],
    options?: { autoCreateBudgets?: boolean }
  ) => {
    await importMut.mutateAsync({
      txns: next,
      mode: 'append',
      autoCreateBudgets: options?.autoCreateBudgets,
    });
  };

  const stripCodingForSubCategoryIds = async (
    subCategoryIds: SubCategoryId[]
  ) => {
    const setIds = new Set(subCategoryIds);
    const affected = transactions.filter(
      (t) =>
        isCategorisableTxn(t) && t.subCategoryId && setIds.has(t.subCategoryId)
    );
    await Promise.all(
      affected.map((t) =>
        updateTxn(t.id, {
          categoryId: null,
          subCategoryId: null,
          companyDefaultMappingRuleId: null,
          codingSource: 'manual',
          codingPendingApproval: false,
        })
      )
    );
  };

  const stripCodingForCategoryIds = async (categoryIds: CategoryId[]) => {
    const setIds = new Set(categoryIds);
    const affected = transactions.filter(
      (t) => isCategorisableTxn(t) && t.categoryId && setIds.has(t.categoryId)
    );
    await Promise.all(
      affected.map((t) =>
        updateTxn(t.id, {
          categoryId: null,
          subCategoryId: null,
          companyDefaultMappingRuleId: null,
          codingSource: 'manual',
          codingPendingApproval: false,
        })
      )
    );
  };

  const getUncodedSummary = (validSubIds: Set<SubCategoryId>) => {
    const bad = transactions.filter(
      (t) =>
        isCategorisableTxn(t) &&
        (!t.subCategoryId || !validSubIds.has(t.subCategoryId))
    );
    return {
      count: bad.length,
      amountCents: bad.reduce((a, b) => a + (b.amountCents ?? 0), 0),
    };
  };

  return {
    transactions,
    updateTxn,
    splitTxn,
    transferTxn,
    updateWorkflowState,
    runBulkAction,
    runReversalAction,
    getReversalSuggestions,
    stripCodingForSubCategoryIds,
    stripCodingForCategoryIds,
    replaceAll,
    appendMany,
    getUncodedSummary,
    isLoading: q.isLoading,
    error: q.error,
  };
}

export type TransactionsHook = ReturnType<typeof useTransactions>;

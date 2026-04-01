import { useMemo } from 'react';

import type { CategoryId, ProjectId, SubCategoryId, Txn, TxnId } from '../types';
import type { TxnUpdateInput } from '../api/contract';
import { useImportTransactionsMutation } from '../queries/admin';
import { useTransactionsQuery, useUpdateTxnMutation } from '../queries/transactions';

/**
 * Query-backed transactions model.
 *
 * Provides a mostly compatible surface area with the earlier local-state hook.
 *
 * Notes:
 * - For batch operations (strip coding / replaceAll / appendMany) we use the
 *   import endpoint in local mode. On the future backend, you'd likely replace
 *   this with real batch mutations.
 */
export function useTransactions(params: { projectId: ProjectId }) {
  const { projectId } = params;
  const q = useTransactionsQuery(projectId);
  const update = useUpdateTxnMutation(projectId);
  const importMut = useImportTransactionsMutation(projectId);

  const transactions = useMemo(() => q.data ?? [], [q.data]);

  const updateTxn = async (id: TxnId, patch: Omit<TxnUpdateInput, 'id'>) => {
    await update.mutateAsync({ id, ...patch });
  };

  const replaceAll = async (next: Txn[]) => {
    await importMut.mutateAsync({ txns: next, mode: 'replaceAll' });
  };

  const appendMany = async (next: Txn[]) => {
    await importMut.mutateAsync({ txns: next, mode: 'append' });
  };

  const stripCodingForSubCategoryIds = async (subCategoryIds: SubCategoryId[]) => {
    const setIds = new Set(subCategoryIds);
    const next = transactions.map((t) =>
      t.subCategoryId && setIds.has(t.subCategoryId)
        ? {
            ...t,
            categoryId: undefined,
            subCategoryId: undefined,
            companyDefaultMappingRuleId: undefined,
            codingSource: 'manual' as const,
            codingPendingApproval: false,
          }
        : t
    );
    await replaceAll(next);
  };

  const stripCodingForCategoryIds = async (categoryIds: CategoryId[]) => {
    const setIds = new Set(categoryIds);
    const next = transactions.map((t) =>
      t.categoryId && setIds.has(t.categoryId)
        ? {
            ...t,
            categoryId: undefined,
            subCategoryId: undefined,
            companyDefaultMappingRuleId: undefined,
            codingSource: 'manual' as const,
            codingPendingApproval: false,
          }
        : t
    );
    await replaceAll(next);
  };

  const getUncodedSummary = (validSubIds: Set<SubCategoryId>) => {
    const bad = transactions.filter(
      (t) => !t.subCategoryId || !validSubIds.has(t.subCategoryId)
    );
    return {
      count: bad.length,
      amountCents: bad.reduce((a, b) => a + Math.abs(b.amountCents ?? 0), 0),
    };
  };

  return {
    transactions,
    updateTxn,
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

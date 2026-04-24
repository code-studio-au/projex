import { useMemo } from 'react';

import type { BudgetLineId, CategoryId, CompanyId, ProjectId, SubCategoryId } from '../types';
import { useBudgetsQuery, useCreateBudgetMutation, useDeleteBudgetMutation, useUpdateBudgetMutation } from '../queries/budgets';

/**
 * Query-backed budgets model.
 *
 * Keeps the same surface area as the earlier local-state hook so UI components stay stable.
 */
export function useBudgets(params: {
  companyId: CompanyId;
  projectId: ProjectId;
}) {
  const { companyId, projectId } = params;

  const q = useBudgetsQuery(projectId);
  const create = useCreateBudgetMutation(projectId);
  const update = useUpdateBudgetMutation(projectId);
  const del = useDeleteBudgetMutation(projectId);

  const budgets = useMemo(() => q.data ?? [], [q.data]);

  const updateAllocated = async (budgetId: BudgetLineId, allocatedCents: number) => {
    await update.mutateAsync({ id: budgetId, allocatedCents: Number(allocatedCents ?? 0) });
  };

  const upsertBudgetForSubCategory = async (
    subCategoryId: SubCategoryId,
    categoryId: CategoryId
  ) => {
    const existing = budgets.find((b) => b.subCategoryId === subCategoryId);
    if (existing) {
      await update.mutateAsync({ id: existing.id, categoryId });
      return;
    }
    await create.mutateAsync({
      companyId,
      projectId,
      categoryId,
      subCategoryId,
      allocatedCents: 0,
    });
  };

  const deleteBudgetLinesForSubCategoryIds = async (subCategoryIds: SubCategoryId[]) => {
    const setIds = new Set(subCategoryIds);
    await Promise.all(
      budgets
        .filter((budget) => budget.subCategoryId && setIds.has(budget.subCategoryId))
        .map((budget) => del.mutateAsync(budget.id))
    );
  };

  const updateBudgetCategoryForSubCategory = async (
    subCategoryId: SubCategoryId,
    newCategoryId: CategoryId
  ) => {
    const existing = budgets.find((b) => b.subCategoryId === subCategoryId);
    if (!existing) return;
    await update.mutateAsync({ id: existing.id, categoryId: newCategoryId });
  };

  return {
    budgets,
    updateAllocated,
    upsertBudgetForSubCategory,
    deleteBudgetLinesForSubCategoryIds,
    updateBudgetCategoryForSubCategory,
    isLoading: q.isLoading,
    error: q.error,
  };
}

export type BudgetsHook = ReturnType<typeof useBudgets>;

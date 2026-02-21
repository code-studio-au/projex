import { useMemo } from 'react';

import type { BudgetLineId, CategoryId, CompanyId, ProjectId, SubCategoryId } from '../types';
import type { BudgetLine } from '../types';
import { asCompanyId, asProjectId } from '../types';

import { uid } from '../utils/id';
import { useBudgetsQuery, useCreateBudgetMutation, useDeleteBudgetMutation, useUpdateBudgetMutation } from '../queries/budgets';

/**
 * Query-backed budgets model.
 *
 * Keeps the same surface area as the earlier local-state hook so UI components stay stable.
 *
 * On the server migration path, these mutations become server writes.
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

  const updateAllocated = (budgetId: BudgetLineId, allocated: number) => {
    update.mutate({ id: budgetId, allocated: Number(allocated ?? 0) });
  };

  const upsertBudgetForSubCategory = (subCategoryId: SubCategoryId, categoryId: CategoryId) => {
    const existing = budgets.find((b) => b.subCategoryId === subCategoryId);
    if (existing) {
      update.mutate({ id: existing.id, categoryId });
      return;
    }
    create.mutate({
      id: uid('bud') as BudgetLine['id'],
      companyId: companyId ?? asCompanyId('co_unknown'),
      projectId: projectId ?? asProjectId('prj_unknown'),
      categoryId,
      subCategoryId,
      allocated: 0,
    });
  };

  const deleteBudgetLinesForSubCategoryIds = (subCategoryIds: SubCategoryId[]) => {
    const setIds = new Set(subCategoryIds);
    for (const b of budgets) {
      if (b.subCategoryId && setIds.has(b.subCategoryId)) del.mutate(b.id);
    }
  };

  const updateBudgetCategoryForSubCategory = (subCategoryId: SubCategoryId, newCategoryId: CategoryId) => {
    const existing = budgets.find((b) => b.subCategoryId === subCategoryId);
    if (!existing) return;
    update.mutate({ id: existing.id, categoryId: newCategoryId });
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

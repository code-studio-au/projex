import { useState } from 'react';
import type {
  BudgetLine,
  BudgetLineId,
  CategoryId,
  CompanyId,
  ProjectId,
  SubCategoryId,
} from '../types';
import { asBudgetLineId, asCompanyId, asProjectId } from '../types';
import { uid } from '../utils/id';

export function useBudgets(params: {
  companyId?: CompanyId;
  projectId?: ProjectId;
  initial?: BudgetLine[];
  value?: BudgetLine[];
  onChange?: (next: BudgetLine[]) => void;
}) {
  const [inner, setInner] = useState<BudgetLine[]>(params.initial ?? []);

  const budgets = params.value ?? inner;
  const setBudgets = (
    next: BudgetLine[] | ((prev: BudgetLine[]) => BudgetLine[])
  ) => {
    const compute =
      typeof next === 'function'
        ? (next as (p: BudgetLine[]) => BudgetLine[])(budgets)
        : next;
    if (params.onChange) params.onChange(compute);
    else setInner(compute);
  };

  const updateAllocated = (budgetId: BudgetLineId, allocated: number) => {
    setBudgets((prev) =>
      prev.map((b) =>
        b.id === budgetId ? { ...b, allocated: Number(allocated ?? 0) } : b
      )
    );
  };

  const upsertBudgetForSubCategory = (
    subCategoryId: SubCategoryId,
    categoryId: CategoryId
  ) => {
    setBudgets((prev) => {
      const exists = prev.find((b) => b.subCategoryId === subCategoryId);
      if (exists)
        return prev.map((b) =>
          b.subCategoryId === subCategoryId ? { ...b, categoryId } : b
        );
      return [
        ...prev,
        {
          id: asBudgetLineId(uid('bud')),
          companyId: params.companyId ?? asCompanyId('co_unknown'),
          projectId: params.projectId ?? asProjectId('prj_unknown'),
          categoryId,
          subCategoryId,
          allocated: 0,
        },
      ];
    });
  };

  const deleteBudgetLinesForSubCategoryIds = (
    subCategoryIds: SubCategoryId[]
  ) => {
    const setIds = new Set(subCategoryIds);
    setBudgets((prev) => prev.filter((b) => !setIds.has(b.subCategoryId)));
  };

  const updateBudgetCategoryForSubCategory = (
    subCategoryId: SubCategoryId,
    newCategoryId: CategoryId
  ) => {
    setBudgets((prev) =>
      prev.map((b) =>
        b.subCategoryId === subCategoryId
          ? { ...b, categoryId: newCategoryId }
          : b
      )
    );
  };

  return {
    budgets,
    updateAllocated,
    upsertBudgetForSubCategory,
    deleteBudgetLinesForSubCategoryIds,
    updateBudgetCategoryForSubCategory,
  };
}

export type BudgetsHook = ReturnType<typeof useBudgets>;

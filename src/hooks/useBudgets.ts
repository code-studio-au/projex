import { useState } from "react";
import type { BudgetLine, Id } from "../types";
import { uid } from "../utils/id";

export function useBudgets(params: { companyId?: Id; projectId?: Id; initial?: BudgetLine[]; value?: BudgetLine[]; onChange?: (next: BudgetLine[]) => void }) {

  const [inner, setInner] = useState<BudgetLine[]>(params.initial ?? []);

  const budgets = params.value ?? inner;
  const setBudgets = (next: BudgetLine[] | ((prev: BudgetLine[]) => BudgetLine[])) => {
    const compute = typeof next === "function" ? (next as (p: BudgetLine[]) => BudgetLine[])(budgets) : next;
    if (params.onChange) params.onChange(compute);
    else setInner(compute);
  };

  const updateAllocated = (budgetId: Id, allocated: number) => {
    setBudgets((prev) => prev.map((b) => (b.id === budgetId ? { ...b, allocated: Number(allocated ?? 0) } : b)));
  };

  const upsertBudgetForSubCategory = (subCategoryId: Id, categoryId: Id) => {
    setBudgets((prev) => {
      const exists = prev.find((b) => b.subCategoryId === subCategoryId);
      if (exists) return prev.map((b) => (b.subCategoryId === subCategoryId ? { ...b, categoryId } : b));
      return [...prev, { id: uid(), companyId: params.companyId ?? "unknown", projectId: params.projectId ?? "unknown", categoryId, subCategoryId, allocated: 0 }];
    });
  };

  const deleteBudgetLinesForSubCategoryIds = (subCategoryIds: Id[]) => {
    const setIds = new Set(subCategoryIds);
    setBudgets((prev) => prev.filter((b) => !setIds.has(b.subCategoryId)));
  };

  const updateBudgetCategoryForSubCategory = (subCategoryId: Id, newCategoryId: Id) => {
    setBudgets((prev) => prev.map((b) => (b.subCategoryId === subCategoryId ? { ...b, categoryId: newCategoryId } : b)));
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

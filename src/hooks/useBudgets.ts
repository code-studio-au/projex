import { useState } from "react";
import type { BudgetLine, Id } from "../types";
import { uid } from "../utils/id";

export function useBudgets(initial: BudgetLine[]) {

  const [budgets, setBudgets] = useState<BudgetLine[]>(initial);

  const updateAllocated = (budgetId: Id, allocated: number) => {
    setBudgets((prev) => prev.map((b) => (b.id === budgetId ? { ...b, allocated: Number(allocated ?? 0) } : b)));
  };

  const upsertBudgetForSubCategory = (subCategoryId: Id, categoryId: Id) => {
    setBudgets((prev) => {
      const exists = prev.find((b) => b.subCategoryId === subCategoryId);
      if (exists) return prev.map((b) => (b.subCategoryId === subCategoryId ? { ...b, categoryId } : b));
      return [...prev, { id: uid(), categoryId, subCategoryId, allocated: 0 }];
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

import { useMemo, useState } from "react";
import type { Category, SubCategory, Id } from "../types";
import { uid } from "../utils/id";
import type { BudgetsHook } from "./useBudgets";
import type { TransactionsHook } from "./useTransactions";

export function useTaxonomy(params: {
  initialCategories?: Category[];
  initialSubCategories?: SubCategory[];
  valueCategories?: Category[];
  valueSubCategories?: SubCategory[];
  onChangeCategories?: (next: Category[]) => void;
  onChangeSubCategories?: (next: SubCategory[]) => void;
  companyId?: Id;
  projectId?: Id;
  budgets: BudgetsHook;
  txns: TransactionsHook;
}){
  const { initialCategories = [], initialSubCategories = [], budgets, txns } = params;
  const [innerCats, setInnerCats] = useState<Category[]>(initialCategories);
  const [innerSubs, setInnerSubs] = useState<SubCategory[]>(initialSubCategories);

  const categories = params.valueCategories ?? innerCats;
  const subCategories = params.valueSubCategories ?? innerSubs;

  const setCategories = (next: Category[] | ((prev: Category[]) => Category[])) => {
    const compute = typeof next === "function" ? (next as (p: Category[]) => Category[])(categories) : next;
    if (params.onChangeCategories) params.onChangeCategories(compute);
    else setInnerCats(compute);
  };

  const setSubCategories = (next: SubCategory[] | ((prev: SubCategory[]) => SubCategory[])) => {
    const compute = typeof next === "function" ? (next as (p: SubCategory[]) => SubCategory[])(subCategories) : next;
    if (params.onChangeSubCategories) params.onChangeSubCategories(compute);
    else setInnerSubs(compute);
  };

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [categories]
  );

  const getCategory = (id?: Id) => categories.find((c) => c.id === id);
  const getSubCategory = (id?: Id) => subCategories.find((s) => s.id === id);

  const getCategoryName = (id?: Id) => getCategory(id)?.name ?? "";
  const getSubCategoryName = (id?: Id) => getSubCategory(id)?.name ?? "";

  const subCategoryOptionsForCategory = (categoryId?: Id) => {
    if (!categoryId) return [];
    return subCategories
      .filter((s) => s.categoryId === categoryId)
      .map((s) => ({ value: s.id, label: s.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  };

  const addCategory = (name: string): Id | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const c: Category = { id: uid(), companyId: params.companyId ?? "unknown", projectId: params.projectId ?? "unknown", name: trimmed };
    setCategories((prev) => [...prev, c]);
    return c.id;
  };

  const renameCategory = (categoryId: Id, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, name: trimmed } : c)));
  };

  const addSubCategory = (categoryId: Id, name: string): Id | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const sc: SubCategory = { id: uid(), companyId: params.companyId ?? "unknown", projectId: params.projectId ?? "unknown", categoryId, name: trimmed };
    setSubCategories((prev) => [...prev, sc]);
    budgets.upsertBudgetForSubCategory(sc.id, categoryId);
    return sc.id;
  };

  const renameSubCategory = (subCategoryId: Id, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubCategories((prev) => prev.map((s) => (s.id === subCategoryId ? { ...s, name: trimmed } : s)));
  };

  const moveSubCategory = (subCategoryId: Id, toCategoryId: Id) => {
    setSubCategories((prev) => prev.map((s) => (s.id === subCategoryId ? { ...s, categoryId: toCategoryId } : s)));
    budgets.updateBudgetCategoryForSubCategory(subCategoryId, toCategoryId);
    txns.setTransactions((prev) => prev.map((t) => (t.subCategoryId === subCategoryId ? { ...t, categoryId: toCategoryId } : t)));
  };

  const deleteSubCategory = (subCategoryId: Id) => {
    txns.stripCodingForSubCategoryIds([subCategoryId]);
    budgets.deleteBudgetLinesForSubCategoryIds([subCategoryId]);
    setSubCategories((prev) => prev.filter((s) => s.id !== subCategoryId));
  };

  const deleteCategory = (categoryId: Id) => {
    const contained = subCategories.filter((s) => s.categoryId === categoryId).map((s) => s.id);

    txns.stripCodingForCategoryIds([categoryId]);
    if (contained.length) txns.stripCodingForSubCategoryIds(contained);
    if (contained.length) budgets.deleteBudgetLinesForSubCategoryIds(contained);

    setSubCategories((prev) => prev.filter((s) => s.categoryId !== categoryId));
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
  };


  const validSubIds = useMemo(() => new Set(subCategories.map((s) => s.id)), [subCategories]);
  return {
    categories,
    subCategories,
    validSubIds,
    categoryOptions,
    subCategoryOptionsForCategory,
    getCategoryName,
    getSubCategoryName,
    getCategory,
    getSubCategory,
    addCategory,
    renameCategory,
    addSubCategory,
    renameSubCategory,
    moveSubCategory,
    deleteSubCategory,
    deleteCategory,
  };
}



export type TaxonomyHook = ReturnType<typeof useTaxonomy>;

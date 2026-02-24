import { useMemo } from 'react';

import type {
  Category,
  CategoryId,
  CompanyId,
  ProjectId,
  SubCategory,
  SubCategoryId,
} from '../types';
import { asCategoryId, asSubCategoryId } from "../types";
import { uid } from '../utils/id';
import {
  useCategoriesQuery,
  useCreateCategoryMutation,
  useCreateSubCategoryMutation,
  useDeleteCategoryMutation,
  useDeleteSubCategoryMutation,
  useSubCategoriesQuery,
  useUpdateCategoryMutation,
  useUpdateSubCategoryMutation,
} from '../queries/taxonomy';
import type { BudgetsHook } from './useBudgets';
import type { TransactionsHook } from './useTransactions';

/**
 * Query-backed taxonomy model.
 *
 * Keeps the older UI surface area so components like TaxonomyManagerModal and
 * TransactionsPanel remain mostly unchanged.
 */
export function useTaxonomy(params: {
  companyId: CompanyId;
  projectId: ProjectId;
  budgets: BudgetsHook;
  txns: TransactionsHook;
  canEditBudgets: boolean;
}) {
  const { companyId, projectId, budgets, txns, canEditBudgets } = params;

  const catsQ = useCategoriesQuery(projectId);
  const subsQ = useSubCategoriesQuery(projectId);

  const createCat = useCreateCategoryMutation(projectId);
  const updateCat = useUpdateCategoryMutation(projectId);
  const deleteCat = useDeleteCategoryMutation(projectId);

  const createSub = useCreateSubCategoryMutation(projectId);
  const updateSub = useUpdateSubCategoryMutation(projectId);
  const deleteSub = useDeleteSubCategoryMutation(projectId);

  const categories = useMemo(() => catsQ.data ?? [], [catsQ.data]);
  const subCategories = useMemo(() => subsQ.data ?? [], [subsQ.data]);

  const categoryById = useMemo(() => {
    const m = new Map<CategoryId, Category>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const subById = useMemo(() => {
    const m = new Map<SubCategoryId, SubCategory>();
    for (const s of subCategories) m.set(s.id, s);
    return m;
  }, [subCategories]);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  const subCategoryOptions = useMemo(
    () =>
      subCategories.map((s) => ({
        value: s.id,
        label: `${categoryById.get(s.categoryId)?.name ?? 'Unknown'} • ${s.name}`,
      })),
    [subCategories, categoryById]
  );

  // Options scoped to a single category (used by TransactionsPanel when a category is selected)
  const subCategoryOptionsByCategory = useMemo(() => {
    const m = new Map<CategoryId, { value: SubCategoryId; label: string }[]>();
    for (const s of subCategories) {
      const arr = m.get(s.categoryId) ?? [];
      arr.push({ value: s.id, label: s.name });
      m.set(s.categoryId, arr);
    }
    return m;
  }, [subCategories]);

  const subCategoryOptionsForCategory = (categoryId?: CategoryId) =>
    categoryId ? subCategoryOptionsByCategory.get(categoryId) ?? [] : [];

  const validSubIds = useMemo(() => new Set(subCategories.map((s) => s.id)), [subCategories]);

  /**
   * Creates a category and returns the generated branded ID immediately.
   *
   * This keeps the UI deterministic (important for CSV import) while remaining
   * compatible with a future TanStack Start / Postgres backend.
   */
  const addCategory = (name: string): CategoryId => {
    const id = asCategoryId(uid('cat'));
    createCat.mutate({ id, companyId, projectId, name });
    return id;
  };

  const renameCategory = (categoryId: CategoryId, name: string) => {
    updateCat.mutate({ id: categoryId, name });
  };

  const deleteCategory = (categoryId: CategoryId) => {
    // Local UX: also strip coding immediately (server will enforce too later)
    const subsToDelete = subCategories.filter((s) => s.categoryId === categoryId).map((s) => s.id);
    budgets.deleteBudgetLinesForSubCategoryIds(subsToDelete);
    txns.stripCodingForCategoryIds([categoryId]);
    deleteCat.mutate(categoryId);
  };

  /**
   * Creates a subcategory and returns the generated branded ID immediately.
   */
  const addSubCategory = (categoryId: CategoryId, name: string): SubCategoryId => {
    const id = asSubCategoryId(uid('sub'));
    createSub.mutate(
      { id, companyId, projectId, categoryId, name },
      {
        onSuccess: () => {
          // Keep budgets in sync with taxonomy: when a new subcategory is created,
          // ensure there is a budget line (allocated = 0) so it appears immediately.
          //
          // Important: do this *after* the subcategory exists, otherwise an API adapter
          // (or future server validation) may reject the budget create.
          if (canEditBudgets) {
            budgets.upsertBudgetForSubCategory(id, categoryId);
          }
        },
      }
    );
    return id;
  };

  const renameSubCategory = (subCategoryId: SubCategoryId, name: string) => {
    updateSub.mutate({ id: subCategoryId, name });
  };

  const moveSubCategory = (subCategoryId: SubCategoryId, newCategoryId: CategoryId) => {
    const existing = subById.get(subCategoryId);
    if (!existing) return;
    updateSub.mutate({ id: subCategoryId, categoryId: newCategoryId });
    budgets.updateBudgetCategoryForSubCategory(subCategoryId, newCategoryId);
    // Update txn categoryId to match (keep subCategoryId)
    const next = txns.transactions.map((t) =>
      t.subCategoryId === subCategoryId ? { ...t, categoryId: newCategoryId } : t
    );
    txns.replaceAll(next);
  };

  const deleteSubCategory = (subCategoryId: SubCategoryId) => {
    budgets.deleteBudgetLinesForSubCategoryIds([subCategoryId]);
    txns.stripCodingForSubCategoryIds([subCategoryId]);
    deleteSub.mutate(subCategoryId);
  };

  // Helpers used by the Transactions table
  const getCategoryName = (categoryId?: CategoryId) =>
    categoryId ? categoryById.get(categoryId)?.name ?? '' : '';

  const getSubCategoryName = (subId?: SubCategoryId) =>
    subId ? subById.get(subId)?.name ?? '' : '';

  const getSubCategory = (subId?: SubCategoryId) => (subId ? subById.get(subId) ?? null : null);

  return {
    companyId,
    projectId,
    categories,
    subCategories,
    categoryOptions,
    subCategoryOptions,
    subCategoryOptionsForCategory,
    validSubIds,
    addCategory,
    renameCategory,
    deleteCategory,
    addSubCategory,
    renameSubCategory,
    moveSubCategory,
    deleteSubCategory,
    getCategoryName,
    getSubCategoryName,
    getSubCategory,
    isLoading: catsQ.isLoading || subsQ.isLoading,
  };
}

export type TaxonomyHook = ReturnType<typeof useTaxonomy>;

import { useMemo } from 'react';

import type {
  Category,
  CategoryId,
  CompanyId,
  ProjectId,
  SubCategory,
  SubCategoryId,
} from '../types';
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
}) {
  const { companyId, projectId, budgets, txns } = params;

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

  const addCategory = (name: string) => {
    createCat.mutate({
      id: uid('cat') as CategoryId,
      companyId,
      projectId,
      name,
    });
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

  const addSubCategory = (categoryId: CategoryId, name: string) => {
    createSub.mutate({
      id: uid('sub') as SubCategoryId,
      companyId,
      projectId,
      categoryId,
      name,
    });
    // ensure budget line exists
    // We'll upsert after creation is reflected, but this keeps parity UX when local.
    // (In server mode, you'd do this as a transaction.)
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

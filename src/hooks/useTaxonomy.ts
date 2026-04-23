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
  useApplyCompanyDefaultTaxonomyMutation,
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

function normalizeTaxonomyName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function ensureUniqueCategoryName(
  categories: Category[],
  categoryId: CategoryId | null,
  name: string
) {
  const normalizedName = normalizeTaxonomyName(name);
  if (!normalizedName) throw new Error('Category name is required.');

  const duplicate = categories.find(
    (category) =>
      category.id !== categoryId &&
      normalizeTaxonomyName(category.name) === normalizedName
  );

  if (duplicate) {
    throw new Error(`Category "${name.trim()}" already exists in this project.`);
  }
}

function ensureUniqueSubCategoryName(
  subCategories: SubCategory[],
  categoryId: CategoryId,
  subCategoryId: SubCategoryId | null,
  name: string
) {
  const normalizedName = normalizeTaxonomyName(name);
  if (!normalizedName) throw new Error('Subcategory name is required.');

  const duplicate = subCategories.find(
    (subCategory) =>
      subCategory.categoryId === categoryId &&
      subCategory.id !== subCategoryId &&
      normalizeTaxonomyName(subCategory.name) === normalizedName
  );

  if (duplicate) {
    throw new Error(`Subcategory "${name.trim()}" already exists in this category.`);
  }
}

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
  const applyCompanyDefaultsMutation = useApplyCompanyDefaultTaxonomyMutation(projectId, companyId);

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
   * Creates a category and resolves with the generated branded ID after success.
   *
   * This keeps the UI deterministic (important for CSV import) while remaining
   * compatible with a future TanStack Start / Postgres backend.
   */
  const addCategory = async (name: string): Promise<CategoryId> => {
    ensureUniqueCategoryName(categories, null, name);

    const id = asCategoryId(uid('cat'));
    await createCat.mutateAsync({ id, companyId, projectId, name: name.trim() });
    return id;
  };

  const renameCategory = async (categoryId: CategoryId, name: string) => {
    ensureUniqueCategoryName(categories, categoryId, name);
    await updateCat.mutateAsync({ id: categoryId, name: name.trim() });
  };

  const deleteCategory = async (categoryId: CategoryId) => {
    await deleteCat.mutateAsync(categoryId);
  };

  /**
   * Creates a subcategory and resolves with the generated branded ID after success.
   */
  const addSubCategory = async (categoryId: CategoryId, name: string): Promise<SubCategoryId> => {
    ensureUniqueSubCategoryName(subCategories, categoryId, null, name);

    const id = asSubCategoryId(uid('sub'));
    await createSub.mutateAsync({
      id,
      companyId,
      projectId,
      categoryId,
      name: name.trim(),
    });

    // Keep budgets in sync with taxonomy: when a new subcategory is created,
    // ensure there is a budget line (allocated = 0) so it appears immediately.
    //
    // Important: do this *after* the subcategory exists, otherwise an API adapter
    // (or future server validation) may reject the budget create.
    if (canEditBudgets) {
      await budgets.upsertBudgetForSubCategory(id, categoryId);
    }

    return id;
  };

  const renameSubCategory = async (subCategoryId: SubCategoryId, name: string) => {
    const existing = subById.get(subCategoryId);
    if (!existing) return;
    ensureUniqueSubCategoryName(subCategories, existing.categoryId, subCategoryId, name);
    await updateSub.mutateAsync({ id: subCategoryId, name: name.trim() });
  };

  const moveSubCategory = async (subCategoryId: SubCategoryId, newCategoryId: CategoryId) => {
    const existing = subById.get(subCategoryId);
    if (!existing) return;
    ensureUniqueSubCategoryName(
      subCategories,
      newCategoryId,
      subCategoryId,
      existing.name
    );
    await updateSub.mutateAsync({ id: subCategoryId, categoryId: newCategoryId });
    await budgets.updateBudgetCategoryForSubCategory(subCategoryId, newCategoryId);
    // Update txn categoryId to match (keep subCategoryId)
    const next = txns.transactions.map((t) =>
      t.subCategoryId === subCategoryId ? { ...t, categoryId: newCategoryId } : t
    );
    await txns.replaceAll(next);
  };

  const deleteSubCategory = async (subCategoryId: SubCategoryId) => {
    await deleteSub.mutateAsync(subCategoryId);
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
    applyCompanyDefaults: () => applyCompanyDefaultsMutation.mutateAsync(),
    isApplyingCompanyDefaults: applyCompanyDefaultsMutation.isPending,
    isLoading: catsQ.isLoading || subsQ.isLoading,
  };
}

export type TaxonomyHook = ReturnType<typeof useTaxonomy>;

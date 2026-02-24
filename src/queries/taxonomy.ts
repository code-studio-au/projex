import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api';
import type { Category, ProjectId, SubCategory } from '../types';
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
} from '../api/contract';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';

export function useCategoriesQuery(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.categories(scopeUserId, projectId),
    queryFn: () => api.listCategories(projectId),
    // Avoid UI flicker (e.g. transactions momentarily appearing uncoded) while refetching.
    placeholderData: keepPreviousData,
  });
}

export function useSubCategoriesQuery(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.subCategories(scopeUserId, projectId),
    queryFn: () => api.listSubCategories(projectId),
    // Avoid UI flicker (e.g. transactions momentarily appearing uncoded) while refetching.
    placeholderData: keepPreviousData,
  });
}

export function useCreateCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CategoryCreateInput) => api.createCategory(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories(scopeUserId, projectId) }),
  });
}

export function useUpdateCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CategoryUpdateInput) => api.updateCategory(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories(scopeUserId, projectId) }),
  });
}

export function useDeleteCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (categoryId: Category['id']) => api.deleteCategory(projectId, categoryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.subCategories(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
    },
  });
}

export function useCreateSubCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: SubCategoryCreateInput) => api.createSubCategory(projectId, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.subCategories(scopeUserId, projectId) }),
  });
}

export function useUpdateSubCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: SubCategoryUpdateInput) => api.updateSubCategory(projectId, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.subCategories(scopeUserId, projectId) }),
  });
}

export function useDeleteSubCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (subCategoryId: SubCategory['id']) =>
      api.deleteSubCategory(projectId, subCategoryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.subCategories(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
    },
  });
}

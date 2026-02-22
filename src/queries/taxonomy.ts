import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api';
import type { Category, ProjectId, SubCategory } from '../types';
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
} from '../api/contract';
import { qk } from './keys';

export function useCategoriesQuery(projectId: ProjectId) {
  return useQuery({
    queryKey: qk.categories(projectId),
    queryFn: () => api.listCategories(projectId),
  });
}

export function useSubCategoriesQuery(projectId: ProjectId) {
  return useQuery({
    queryKey: qk.subCategories(projectId),
    queryFn: () => api.listSubCategories(projectId),
  });
}

export function useCreateCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryCreateInput) => api.createCategory(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories(projectId) }),
  });
}

export function useUpdateCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryUpdateInput) => api.updateCategory(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories(projectId) }),
  });
}

export function useDeleteCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: Category['id']) => api.deleteCategory(projectId, categoryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories(projectId) });
      qc.invalidateQueries({ queryKey: qk.subCategories(projectId) });
      qc.invalidateQueries({ queryKey: qk.budgets(projectId) });
      qc.invalidateQueries({ queryKey: qk.transactions(projectId) });
    },
  });
}

export function useCreateSubCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubCategoryCreateInput) => api.createSubCategory(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.subCategories(projectId) }),
  });
}

export function useUpdateSubCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubCategoryUpdateInput) => api.updateSubCategory(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.subCategories(projectId) }),
  });
}

export function useDeleteSubCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subCategoryId: SubCategory['id']) =>
      api.deleteSubCategory(projectId, subCategoryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.subCategories(projectId) });
      qc.invalidateQueries({ queryKey: qk.budgets(projectId) });
      qc.invalidateQueries({ queryKey: qk.transactions(projectId) });
    },
  });
}

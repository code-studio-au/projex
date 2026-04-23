import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import type {
  Category,
  CompanyDefaultCategory,
  CompanyDefaults,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyId,
  ProjectId,
  SubCategory,
} from '../types';
import type {
  CompanyDefaultCategoryCreateInput,
  CompanyDefaultCategoryUpdateInput,
  CompanyDefaultMappingRuleCreateInput,
  CompanyDefaultMappingRuleUpdateInput,
  CompanyDefaultSubCategoryCreateInput,
  CompanyDefaultSubCategoryUpdateInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
} from '../api/contract';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';

export function useCategoriesQuery(projectId: ProjectId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.categories(scopeUserId, projectId),
    queryFn: () => api.listCategories(projectId),
    // Avoid UI flicker (e.g. transactions momentarily appearing uncoded) while refetching.
    placeholderData: keepPreviousData,
  });
}

export function useCompanyDefaultCategoriesQuery(companyId: CompanyId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.companyDefaultCategories(scopeUserId, companyId),
    queryFn: () => api.listCompanyDefaultCategories(companyId),
    placeholderData: keepPreviousData,
  });
}

export function useCompanyDefaultsQuery(companyId: CompanyId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery<CompanyDefaults>({
    queryKey: qk.companyDefaults(scopeUserId, companyId),
    queryFn: () => api.getCompanyDefaults(companyId),
    placeholderData: keepPreviousData,
  });
}

export function useCompanyDefaultSubCategoriesQuery(companyId: CompanyId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId),
    queryFn: () => api.listCompanyDefaultSubCategories(companyId),
    placeholderData: keepPreviousData,
  });
}

export function useCompanyDefaultMappingRulesQuery(companyId: CompanyId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
    queryFn: () => api.listCompanyDefaultMappingRules(companyId),
    placeholderData: keepPreviousData,
  });
}

export function useSubCategoriesQuery(projectId: ProjectId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.subCategories(scopeUserId, projectId),
    queryFn: () => api.listSubCategories(projectId),
    // Avoid UI flicker (e.g. transactions momentarily appearing uncoded) while refetching.
    placeholderData: keepPreviousData,
  });
}

export function useCreateCategoryMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CategoryCreateInput) => api.createCategory(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories(scopeUserId, projectId) }),
  });
}

export function useCreateCompanyDefaultCategoryMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultCategoryCreateInput) =>
      api.createCompanyDefaultCategory(companyId, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.companyDefaults(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.companyDefaultCategories(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId) }),
      ]),
  });
}

export function useUpdateCompanyDefaultCategoryMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultCategoryUpdateInput) =>
      api.updateCompanyDefaultCategory(companyId, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.companyDefaults(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.companyDefaultCategories(scopeUserId, companyId) }),
      ]),
  });
}

export function useDeleteCompanyDefaultCategoryMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (categoryId: CompanyDefaultCategory['id']) =>
      api.deleteCompanyDefaultCategory(companyId, categoryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.companyDefaults(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.companyDefaultCategories(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId) });
    },
  });
}

export function useUpdateCategoryMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CategoryUpdateInput) => api.updateCategory(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.categories(scopeUserId, projectId) }),
  });
}

export function useDeleteCategoryMutation(projectId: ProjectId) {
  const api = useApi();
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
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: SubCategoryCreateInput) => api.createSubCategory(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.subCategories(scopeUserId, projectId) }),
  });
}

export function useCreateCompanyDefaultSubCategoryMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultSubCategoryCreateInput) =>
      api.createCompanyDefaultSubCategory(companyId, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.companyDefaults(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId) }),
      ]),
  });
}

export function useCreateCompanyDefaultMappingRuleMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultMappingRuleCreateInput) =>
      api.createCompanyDefaultMappingRule(companyId, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.companyDefaults(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId) }),
      ]),
  });
}

export function useUpdateSubCategoryMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: SubCategoryUpdateInput) => api.updateSubCategory(projectId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.subCategories(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
    },
  });
}

export function useUpdateCompanyDefaultSubCategoryMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultSubCategoryUpdateInput) =>
      api.updateCompanyDefaultSubCategory(companyId, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.companyDefaults(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId) }),
      ]),
  });
}

export function useUpdateCompanyDefaultMappingRuleMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultMappingRuleUpdateInput) =>
      api.updateCompanyDefaultMappingRule(companyId, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.companyDefaults(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId) }),
      ]),
  });
}

export function useDeleteSubCategoryMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (subCategoryId: SubCategory['id']) => api.deleteSubCategory(projectId, subCategoryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.subCategories(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
    },
  });
}

export function useDeleteCompanyDefaultSubCategoryMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (subCategoryId: CompanyDefaultSubCategory['id']) =>
      api.deleteCompanyDefaultSubCategory(companyId, subCategoryId),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.companyDefaults(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId) }),
      ]),
  });
}

export function useDeleteCompanyDefaultMappingRuleMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (ruleId: CompanyDefaultMappingRule['id']) =>
      api.deleteCompanyDefaultMappingRule(companyId, ruleId),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: qk.companyDefaults(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId) }),
      ]),
  });
}

export function useApplyCompanyDefaultTaxonomyMutation(projectId: ProjectId, companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: () => api.applyCompanyDefaultTaxonomy(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.subCategories(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.companyDefaultCategories(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId) });
    },
  });
}

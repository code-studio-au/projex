import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

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
import {
  applyCompanyDefaultTaxonomyServerFn,
  createCategoryServerFn,
  createCompanyDefaultCategoryServerFn,
  createCompanyDefaultMappingRuleServerFn,
  createCompanyDefaultSubCategoryServerFn,
  createSubCategoryServerFn,
  deleteCategoryServerFn,
  deleteCompanyDefaultCategoryServerFn,
  deleteCompanyDefaultMappingRuleServerFn,
  deleteCompanyDefaultSubCategoryServerFn,
  deleteSubCategoryServerFn,
  getCompanyDefaultsServerFn,
  listCategoriesServerFn,
  listCompanyDefaultCategoriesServerFn,
  listCompanyDefaultMappingRulesServerFn,
  listCompanyDefaultSubCategoriesServerFn,
  listSubCategoriesServerFn,
  updateCategoryServerFn,
  updateCompanyDefaultCategoryServerFn,
  updateCompanyDefaultMappingRuleServerFn,
  updateCompanyDefaultSubCategoryServerFn,
  updateSubCategoryServerFn,
} from '../server/start/functions/taxonomyReads';

export function useCategoriesQuery(
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(categoriesQueryOptions(scopeUserId, projectId, options));
}

export function categoriesQueryOptions(
  userId: string,
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  return {
    queryKey: qk.categories(userId, projectId),
    queryFn: () => listCategoriesServerFn({ data: { projectId } }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  } as const;
}

export function useCompanyDefaultCategoriesQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.companyDefaultCategories(scopeUserId, companyId),
    queryFn: () =>
      listCompanyDefaultCategoriesServerFn({ data: { companyId } }),
    placeholderData: keepPreviousData,
  });
}

export function useCompanyDefaultsQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery<CompanyDefaults>(
    companyDefaultsQueryOptions(scopeUserId, companyId)
  );
}

export function companyDefaultsQueryOptions(
  userId: string,
  companyId: CompanyId
) {
  return {
    queryKey: qk.companyDefaults(userId, companyId),
    queryFn: () => getCompanyDefaultsServerFn({ data: { companyId } }),
    placeholderData: keepPreviousData,
  } as const;
}

export function useCompanyDefaultSubCategoriesQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId),
    queryFn: () =>
      listCompanyDefaultSubCategoriesServerFn({ data: { companyId } }),
    placeholderData: keepPreviousData,
  });
}

export function useCompanyDefaultMappingRulesQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
    queryFn: () =>
      listCompanyDefaultMappingRulesServerFn({ data: { companyId } }),
    placeholderData: keepPreviousData,
  });
}

export function useSubCategoriesQuery(
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(subCategoriesQueryOptions(scopeUserId, projectId, options));
}

export function subCategoriesQueryOptions(
  userId: string,
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  return {
    queryKey: qk.subCategories(userId, projectId),
    queryFn: () => listSubCategoriesServerFn({ data: { projectId } }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  } as const;
}

export function useCreateCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CategoryCreateInput) =>
      createCategoryServerFn({ data: { projectId, payload: input } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.categories(scopeUserId, projectId) }),
  });
}

export function useCreateCompanyDefaultCategoryMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultCategoryCreateInput) =>
      createCompanyDefaultCategoryServerFn({
        data: { companyId, payload: input },
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultCategories(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]),
  });
}

export function useUpdateCompanyDefaultCategoryMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultCategoryUpdateInput) =>
      updateCompanyDefaultCategoryServerFn({
        data: { companyId, payload: input },
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultCategories(scopeUserId, companyId),
        }),
      ]),
  });
}

export function useDeleteCompanyDefaultCategoryMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (categoryId: CompanyDefaultCategory['id']) =>
      deleteCompanyDefaultCategoryServerFn({ data: { companyId, categoryId } }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: qk.companyDefaults(scopeUserId, companyId),
      });
      qc.invalidateQueries({
        queryKey: qk.companyDefaultCategories(scopeUserId, companyId),
      });
      qc.invalidateQueries({
        queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId),
      });
      qc.invalidateQueries({
        queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
      });
    },
  });
}

export function useUpdateCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CategoryUpdateInput) =>
      updateCategoryServerFn({ data: { projectId, payload: input } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.categories(scopeUserId, projectId) }),
  });
}

export function useDeleteCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (categoryId: Category['id']) =>
      deleteCategoryServerFn({ data: { projectId, categoryId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.categories(scopeUserId, projectId) });
      qc.invalidateQueries({
        queryKey: qk.subCategories(scopeUserId, projectId),
      });
      qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) });
      qc.invalidateQueries({
        queryKey: qk.transactions(scopeUserId, projectId),
      });
      qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) });
    },
  });
}

export function useCreateSubCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: SubCategoryCreateInput) =>
      createSubCategoryServerFn({ data: { projectId, payload: input } }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: qk.subCategories(scopeUserId, projectId),
      }),
  });
}

export function useCreateCompanyDefaultSubCategoryMutation(
  companyId: CompanyId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultSubCategoryCreateInput) =>
      createCompanyDefaultSubCategoryServerFn({
        data: { companyId, payload: input },
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]),
  });
}

export function useCreateCompanyDefaultMappingRuleMutation(
  companyId: CompanyId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultMappingRuleCreateInput) =>
      createCompanyDefaultMappingRuleServerFn({
        data: { companyId, payload: input },
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]),
  });
}

export function useUpdateSubCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: SubCategoryUpdateInput) =>
      updateSubCategoryServerFn({ data: { projectId, payload: input } }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: qk.subCategories(scopeUserId, projectId),
      });
      qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) });
      qc.invalidateQueries({
        queryKey: qk.transactions(scopeUserId, projectId),
      });
      qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) });
    },
  });
}

export function useUpdateCompanyDefaultSubCategoryMutation(
  companyId: CompanyId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultSubCategoryUpdateInput) =>
      updateCompanyDefaultSubCategoryServerFn({
        data: { companyId, payload: input },
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]),
  });
}

export function useDeleteSubCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (subCategoryId: SubCategory['id']) =>
      deleteSubCategoryServerFn({ data: { projectId, subCategoryId } }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: qk.subCategories(scopeUserId, projectId),
      });
      qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) });
      qc.invalidateQueries({
        queryKey: qk.transactions(scopeUserId, projectId),
      });
      qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) });
    },
  });
}

export function useDeleteCompanyDefaultSubCategoryMutation(
  companyId: CompanyId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (subCategoryId: CompanyDefaultSubCategory['id']) =>
      deleteCompanyDefaultSubCategoryServerFn({
        data: { companyId, subCategoryId },
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]),
  });
}

export function useUpdateCompanyDefaultMappingRuleMutation(
  companyId: CompanyId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyDefaultMappingRuleUpdateInput) =>
      updateCompanyDefaultMappingRuleServerFn({
        data: { companyId, payload: input },
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]),
  });
}

export function useDeleteCompanyDefaultMappingRuleMutation(
  companyId: CompanyId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (ruleId: CompanyDefaultMappingRule['id']) =>
      deleteCompanyDefaultMappingRuleServerFn({ data: { companyId, ruleId } }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]),
  });
}

export function useApplyCompanyDefaultTaxonomyMutation(
  projectId: ProjectId,
  companyId: CompanyId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: () =>
      applyCompanyDefaultTaxonomyServerFn({ data: { projectId } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.categories(scopeUserId, projectId),
        }),
        qc.invalidateQueries({
          queryKey: qk.subCategories(scopeUserId, projectId),
        }),
        qc.invalidateQueries({ queryKey: qk.budgets(scopeUserId, projectId) }),
        qc.invalidateQueries({
          queryKey: qk.transactions(scopeUserId, projectId),
        }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultCategories(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId),
        }),
      ]);
    },
  });
}

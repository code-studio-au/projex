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
  CompanyId,
  ProjectId,
} from '../types';
import type {
  BulkRecodeProjectTransactionsInput,
  CompanyDefaultCategoryCreateInput,
  CompanyDefaultCategoryUpdateInput,
  CompanyDefaultMappingRuleCreateInput,
  CompanyDefaultMappingRuleUpdateInput,
  CompanyDefaultSubCategoryCreateInput,
  CompanyDefaultSubCategoryUpdateInput,
  DeleteCompanyDefaultSubCategoryInput,
  DeleteSubCategoryInput,
  CategoryCreateInput,
  PromoteProjectSubCategoryToCompanyDefaultInput,
  CategoryUpdateInput,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
} from '../api/types';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import {
  applyCompanyStandardsServerFn,
  bulkRecodeProjectTransactionsServerFn,
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
  listSubCategoriesServerFn,
  promoteProjectSubCategoryToCompanyDefaultServerFn,
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

async function invalidateSyncedProjectTaxonomyQueries(args: {
  qc: ReturnType<typeof useQueryClient>;
  scopeUserId: string;
}) {
  const { qc, scopeUserId } = args;
  await Promise.all([
    qc.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === 'categories' &&
        query.queryKey[1] === scopeUserId,
    }),
    qc.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === 'subCategories' &&
        query.queryKey[1] === scopeUserId,
    }),
    qc.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === 'budgets' &&
        query.queryKey[1] === scopeUserId,
    }),
    qc.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === 'transactions' &&
        query.queryKey[1] === scopeUserId,
    }),
    qc.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === 'projectAutoCodingRules' &&
        query.queryKey[1] === scopeUserId,
    }),
  ]);
}

async function invalidateProjectAutoCodingRuleQueries(args: {
  qc: ReturnType<typeof useQueryClient>;
  scopeUserId: string;
}) {
  const { qc, scopeUserId } = args;
  await qc.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey[0] === 'projectAutoCodingRules' &&
      query.queryKey[1] === scopeUserId,
  });
}

export function useCreateCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CategoryCreateInput) =>
      createCategoryServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.categories(scopeUserId, projectId),
        }),
        qc.invalidateQueries({
          queryKey: qk.projectAutoCodingRules(scopeUserId, projectId),
        }),
      ]);
    },
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
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultCategories(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]);
      await invalidateSyncedProjectTaxonomyQueries({ qc, scopeUserId });
    },
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
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultCategories(scopeUserId, companyId),
        }),
      ]);
      await invalidateSyncedProjectTaxonomyQueries({ qc, scopeUserId });
    },
  });
}

export function useDeleteCompanyDefaultCategoryMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (categoryId: CompanyDefaultCategory['id']) =>
      deleteCompanyDefaultCategoryServerFn({ data: { companyId, categoryId } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultCategories(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]);
      await invalidateSyncedProjectTaxonomyQueries({ qc, scopeUserId });
    },
  });
}

export function useUpdateCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CategoryUpdateInput) =>
      updateCategoryServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.categories(scopeUserId, projectId),
        }),
        qc.invalidateQueries({
          queryKey: qk.projectAutoCodingRules(scopeUserId, projectId),
        }),
      ]);
    },
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
        queryKey: qk.projectAutoCodingRules(scopeUserId, projectId),
      });
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
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.subCategories(scopeUserId, projectId),
        }),
        qc.invalidateQueries({
          queryKey: qk.projectAutoCodingRules(scopeUserId, projectId),
        }),
      ]);
    },
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
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]);
      await invalidateSyncedProjectTaxonomyQueries({ qc, scopeUserId });
    },
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
      ]).then(() =>
        invalidateProjectAutoCodingRuleQueries({ qc, scopeUserId })
      ),
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
      qc.invalidateQueries({
        queryKey: qk.projectAutoCodingRules(scopeUserId, projectId),
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
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]);
      await invalidateSyncedProjectTaxonomyQueries({ qc, scopeUserId });
    },
  });
}

export function useDeleteSubCategoryMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: DeleteSubCategoryInput) =>
      deleteSubCategoryServerFn({ data: { projectId, ...input } }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: qk.subCategories(scopeUserId, projectId),
      });
      qc.invalidateQueries({
        queryKey: qk.projectAutoCodingRules(scopeUserId, projectId),
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
    mutationFn: (input: DeleteCompanyDefaultSubCategoryInput) =>
      deleteCompanyDefaultSubCategoryServerFn({
        data: { companyId, ...input },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultSubCategories(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaultMappingRules(scopeUserId, companyId),
        }),
      ]);
      await invalidateSyncedProjectTaxonomyQueries({ qc, scopeUserId });
    },
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
      ]).then(() =>
        invalidateProjectAutoCodingRuleQueries({ qc, scopeUserId })
      ),
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
      ]).then(() =>
        invalidateProjectAutoCodingRuleQueries({ qc, scopeUserId })
      ),
  });
}

export function useApplyCompanyStandardsMutation(
  projectId: ProjectId,
  companyId: CompanyId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: () => applyCompanyStandardsServerFn({ data: { projectId } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.categories(scopeUserId, projectId),
        }),
        qc.invalidateQueries({
          queryKey: qk.projectAutoCodingRules(scopeUserId, projectId),
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
        qc.invalidateQueries({
          queryKey: qk.projectImportRules(scopeUserId, projectId),
        }),
      ]);
    },
  });
}

export function useBulkRecodeProjectTransactionsMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: BulkRecodeProjectTransactionsInput) =>
      bulkRecodeProjectTransactionsServerFn({
        data: { projectId, payload: input },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.transactions(scopeUserId, projectId),
        }),
        qc.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'transactions' &&
            query.queryKey[1] === scopeUserId &&
            query.queryKey[2] === projectId &&
            query.queryKey[3] === 'page',
        }),
        qc.invalidateQueries({ queryKey: qk.companySummaries(scopeUserId) }),
      ]);
    },
  });
}

export function usePromoteProjectSubCategoryToCompanyDefaultMutation(
  projectId: ProjectId,
  companyId: CompanyId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: PromoteProjectSubCategoryToCompanyDefaultInput) =>
      promoteProjectSubCategoryToCompanyDefaultServerFn({
        data: { projectId, payload: input },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.categories(scopeUserId, projectId),
        }),
        qc.invalidateQueries({
          queryKey: qk.subCategories(scopeUserId, projectId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyDefaults(scopeUserId, companyId),
        }),
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

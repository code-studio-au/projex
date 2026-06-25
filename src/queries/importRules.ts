import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import type {
  ImportRuleCreateInput,
  ImportRuleUpdateInput,
} from '../api/types';
import type { CompanyId, ImportRule, ProjectId } from '../types';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import {
  createImportRuleServerFn,
  deleteImportRuleServerFn,
  listImportRulesServerFn,
  createProjectImportRuleServerFn,
  deleteProjectImportRuleServerFn,
  listProjectImportRulesServerFn,
  promoteProjectImportRuleServerFn,
  updateProjectImportRuleServerFn,
  updateImportRuleServerFn,
} from '../server/start/functions/importReads';

export function useImportRulesQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(importRulesQueryOptions(scopeUserId, companyId));
}

export function importRulesQueryOptions(userId: string, companyId: CompanyId) {
  return {
    queryKey: qk.importRules(userId, companyId),
    queryFn: () => listImportRulesServerFn({ data: { companyId } }),
    placeholderData: keepPreviousData,
  } as const;
}

export function useProjectImportRulesQuery(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery(projectImportRulesQueryOptions(scopeUserId, projectId));
}

export function projectImportRulesQueryOptions(
  userId: string,
  projectId: ProjectId
) {
  return {
    queryKey: qk.projectImportRules(userId, projectId),
    queryFn: () => listProjectImportRulesServerFn({ data: { projectId } }),
    placeholderData: keepPreviousData,
  } as const;
}

async function invalidateCompanyImportRuleQueries(args: {
  qc: ReturnType<typeof useQueryClient>;
  scopeUserId: string;
  companyId: CompanyId;
}) {
  const { qc, scopeUserId, companyId } = args;
  await Promise.all([
    qc.invalidateQueries({
      queryKey: qk.importRules(scopeUserId, companyId),
    }),
    qc.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === 'importRules' &&
        query.queryKey[1] === 'project' &&
        query.queryKey[2] === scopeUserId,
    }),
  ]);
}

export function useCreateImportRuleMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ImportRuleCreateInput) =>
      createImportRuleServerFn({ data: { companyId, payload: input } }),
    onSuccess: async () =>
      invalidateCompanyImportRuleQueries({
        qc,
        scopeUserId,
        companyId,
      }),
  });
}

export function useUpdateImportRuleMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ImportRuleUpdateInput) =>
      updateImportRuleServerFn({ data: { companyId, payload: input } }),
    onSuccess: async () =>
      invalidateCompanyImportRuleQueries({
        qc,
        scopeUserId,
        companyId,
      }),
  });
}

export function useDeleteImportRuleMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (ruleId: ImportRule['id']) =>
      deleteImportRuleServerFn({ data: { companyId, ruleId } }),
    onSuccess: async () =>
      invalidateCompanyImportRuleQueries({
        qc,
        scopeUserId,
        companyId,
      }),
  });
}

async function invalidateProjectImportRuleQueries(args: {
  qc: ReturnType<typeof useQueryClient>;
  scopeUserId: string;
  companyId: CompanyId;
  projectId: ProjectId;
}) {
  const { qc, scopeUserId, companyId, projectId } = args;
  await Promise.all([
    qc.invalidateQueries({
      queryKey: qk.projectImportRules(scopeUserId, projectId),
    }),
    qc.invalidateQueries({
      queryKey: qk.importRules(scopeUserId, companyId),
    }),
  ]);
}

export function useCreateProjectImportRuleMutation(
  companyId: CompanyId,
  projectId: ProjectId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ImportRuleCreateInput) =>
      createProjectImportRuleServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () =>
      invalidateProjectImportRuleQueries({
        qc,
        scopeUserId,
        companyId,
        projectId,
      }),
  });
}

export function useUpdateProjectImportRuleMutation(
  companyId: CompanyId,
  projectId: ProjectId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ImportRuleUpdateInput) =>
      updateProjectImportRuleServerFn({ data: { projectId, payload: input } }),
    onSuccess: async () =>
      invalidateProjectImportRuleQueries({
        qc,
        scopeUserId,
        companyId,
        projectId,
      }),
  });
}

export function useDeleteProjectImportRuleMutation(
  companyId: CompanyId,
  projectId: ProjectId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (ruleId: ImportRule['id']) =>
      deleteProjectImportRuleServerFn({ data: { projectId, ruleId } }),
    onSuccess: async () =>
      invalidateProjectImportRuleQueries({
        qc,
        scopeUserId,
        companyId,
        projectId,
      }),
  });
}

export function usePromoteProjectImportRuleMutation(
  companyId: CompanyId,
  projectId: ProjectId
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (ruleId: ImportRule['id']) =>
      promoteProjectImportRuleServerFn({ data: { projectId, ruleId } }),
    onSuccess: async () =>
      invalidateProjectImportRuleQueries({
        qc,
        scopeUserId,
        companyId,
        projectId,
      }),
  });
}

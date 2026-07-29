import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CompanyId, ProjectId, UserId } from '../types';
import type {
  CompanyCreateInput,
  CompanyCreateResult,
  CreateCompanyUserInput,
  ProjectCreateInput,
  ProjectUpdateInput,
  TxnImportInput,
} from '../api/types';
import { qk } from './keys';
import {
  projectSettingMutationScope,
  type ProjectSettingMutationKey,
} from './mutationScopes';
import { useQueryScopeUserId } from './scope';
import { invalidateProjectTransactionQueries } from './transactions';
import {
  createCompanyServerFn,
  createProjectServerFn,
  createUserInCompanyServerFn,
  deactivateCompanyServerFn,
  deactivateProjectServerFn,
  deleteCompanyServerFn,
  deleteProjectServerFn,
  importTransactionsServerFn,
  reactivateCompanyServerFn,
  reactivateProjectServerFn,
  sendCompanyUserInviteEmailServerFn,
  updateProjectServerFn,
} from '../server/start/functions/admin';

export function useCreateCompanyMutation() {
  const qc = useQueryClient();
  return useMutation<CompanyCreateResult, Error, CompanyCreateInput>({
    mutationFn: (input) => createCompanyServerFn({ data: input }),
    onSuccess: async () => {
      await qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === 'companies',
      });
    },
  });
}

export function useCreateProjectMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ProjectCreateInput) =>
      createProjectServerFn({ data: { companyId, payload: input } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({
          queryKey: qk.companySummary(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyWorkQueue(scopeUserId, companyId),
        }),
      ]);
    },
  });
}

export function useUpdateProjectMutation(
  companyId: CompanyId,
  settingScope?: {
    projectId: ProjectId;
    setting: ProjectSettingMutationKey;
  }
) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    scope: settingScope
      ? projectSettingMutationScope(
          settingScope.projectId,
          settingScope.setting
        )
      : undefined,
    mutationFn: (input: ProjectUpdateInput) =>
      updateProjectServerFn({ data: input }),
    onSuccess: async (_, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.project(scopeUserId, vars.id) }),
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.categories(scopeUserId, vars.id) }),
        qc.invalidateQueries({
          queryKey: qk.subCategories(scopeUserId, vars.id),
        }),
        qc.invalidateQueries({
          queryKey: qk.myProjectMemberships(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companySummary(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyWorkQueue(scopeUserId, companyId),
        }),
      ]);
    },
  });
}

export function useCreateUserInCompanyMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (vars: CreateCompanyUserInput) =>
      createUserInCompanyServerFn({
        data: { companyId, payload: vars },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === 'users',
        }),
        qc.invalidateQueries({
          queryKey: qk.companyMemberships(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.allCompanyMemberships(scopeUserId),
        }),
      ]);
    },
  });
}

export function useSendCompanyUserInviteEmailMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (userId: UserId) =>
      sendCompanyUserInviteEmailServerFn({
        data: { companyId, userId },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === 'users',
        }),
        qc.invalidateQueries({
          queryKey: qk.companyMemberships(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.allCompanyMemberships(scopeUserId),
        }),
      ]);
    },
  });
}

export function useImportTransactionsMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  const budgetQueryKey = qk.budgets(scopeUserId, projectId);
  return useMutation({
    mutationFn: (vars: TxnImportInput) =>
      importTransactionsServerFn({ data: { projectId, payload: vars } }),
    onSuccess: async () => {
      await Promise.all([
        invalidateProjectTransactionQueries({ qc, scopeUserId, projectId }),
        qc.invalidateQueries({ queryKey: budgetQueryKey }),
      ]);
    },
  });
}

export function useDeactivateCompanyMutation() {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (companyId: CompanyId) =>
      deactivateCompanyServerFn({ data: { companyId } }),
    onSuccess: async (_, companyId) => {
      await Promise.all([
        qc.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === 'companies',
        }),
        qc.invalidateQueries({ queryKey: qk.company(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({
          queryKey: qk.companyWorkQueue(scopeUserId, companyId),
        }),
      ]);
    },
  });
}

export function useReactivateCompanyMutation() {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (companyId: CompanyId) =>
      reactivateCompanyServerFn({ data: { companyId } }),
    onSuccess: async (_, companyId) => {
      await Promise.all([
        qc.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === 'companies',
        }),
        qc.invalidateQueries({ queryKey: qk.company(scopeUserId, companyId) }),
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === 'users',
        }),
        qc.invalidateQueries({
          queryKey: qk.allCompanyMemberships(scopeUserId),
        }),
      ]);
    },
  });
}

export function useDeleteCompanyMutation() {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: { companyId: CompanyId; confirmation: string }) =>
      deleteCompanyServerFn({ data: input }),
    onSuccess: async (_, input) => {
      await Promise.all([
        qc.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === 'companies',
        }),
        qc.invalidateQueries({
          queryKey: qk.company(scopeUserId, input.companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.projects(scopeUserId, input.companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.allCompanyMemberships(scopeUserId),
        }),
        qc.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) && q.queryKey[0] === 'users',
        }),
      ]);
    },
  });
}

export function useDeactivateProjectMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (projectId: ProjectId) =>
      deactivateProjectServerFn({ data: { projectId } }),
    onSuccess: async (_, projectId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.project(scopeUserId, projectId) }),
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({
          queryKey: qk.companySummary(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyWorkQueue(scopeUserId, companyId),
        }),
      ]);
    },
  });
}

export function useReactivateProjectMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (projectId: ProjectId) =>
      reactivateProjectServerFn({ data: { projectId } }),
    onSuccess: async (_, projectId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.project(scopeUserId, projectId) }),
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({
          queryKey: qk.companySummary(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyWorkQueue(scopeUserId, companyId),
        }),
      ]);
    },
  });
}

export function useDeleteProjectMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: { projectId: ProjectId; confirmation: string }) =>
      deleteProjectServerFn({ data: input }),
    onSuccess: async (_, input) => {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: qk.project(scopeUserId, input.projectId),
        }),
        qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
        qc.invalidateQueries({
          queryKey: qk.companySummary(scopeUserId, companyId),
        }),
        qc.invalidateQueries({
          queryKey: qk.companyWorkQueue(scopeUserId, companyId),
        }),
      ]);
    },
  });
}

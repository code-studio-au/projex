import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import type { Company, CompanyId, ProjectId, Txn, UserId } from '../types';
import type {
  CreateCompanyUserInput,
  CompanyUpdateInput,
  ProjectCreateInput,
  ProjectUpdateInput,
  TxnImportInput,
} from '../api/contract';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';

export function useCreateCompanyMutation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<Company, 'name'> & { id?: CompanyId }) => api.createCompany(input),
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'companies',
      });
    },
  });
}

export function useCreateProjectMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ProjectCreateInput) => api.createProject(companyId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
  });
}

export function useUpdateProjectMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ProjectUpdateInput) => api.updateProject(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.project(scopeUserId, vars.id) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.myProjectMemberships(scopeUserId, companyId) });
    },
  });
}

export function useUpdateCompanyMutation() {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: CompanyUpdateInput) => api.updateCompany(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.company(scopeUserId, vars.id) });
      qc.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'companies',
      });
    },
  });
}

export function useCreateUserInCompanyMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (vars: CreateCompanyUserInput) => api.createUserInCompany(companyId, vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users() });
      qc.invalidateQueries({ queryKey: qk.companyMemberships(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
    },
  });
}

export function useSendCompanyUserInviteEmailMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (userId: UserId) => api.sendCompanyUserInviteEmail(companyId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users() });
      qc.invalidateQueries({ queryKey: qk.companyMemberships(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
    },
  });
}

export function useImportTransactionsMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  const transactionQueryKey = qk.transactions(scopeUserId, projectId);
  const budgetQueryKey = qk.budgets(scopeUserId, projectId);
  return useMutation({
    mutationFn: (vars: TxnImportInput) =>
      api.importTransactions(projectId, vars),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: transactionQueryKey });
      const previous = qc.getQueryData<Txn[]>(transactionQueryKey);
      qc.setQueryData<Txn[]>(
        transactionQueryKey,
        vars.mode === 'replaceAll'
          ? vars.txns
          : [...(previous ?? []), ...vars.txns]
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(transactionQueryKey, context.previous);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: transactionQueryKey });
      qc.invalidateQueries({ queryKey: budgetQueryKey });
    },
  });
}

export function useResetToSeedMutation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.resetToSeed(),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function useDeactivateCompanyMutation() {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (companyId: CompanyId) => api.deactivateCompany(companyId),
    onSuccess: (_, companyId) => {
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "companies" });
      qc.invalidateQueries({ queryKey: qk.company(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
    },
  });
}

export function useReactivateCompanyMutation() {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (companyId: CompanyId) => api.reactivateCompany(companyId),
    onSuccess: (_, companyId) => {
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'companies' });
      qc.invalidateQueries({ queryKey: qk.company(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.users() });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
    },
  });
}

export function useDeleteCompanyMutation() {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (companyId: CompanyId) => api.deleteCompany(companyId),
    onSuccess: (_, companyId) => {
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "companies" });
      qc.invalidateQueries({ queryKey: qk.company(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
      qc.invalidateQueries({ queryKey: qk.users() });
    },
  });
}

export function useDeactivateProjectMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (projectId: ProjectId) => api.deactivateProject(projectId),
    onSuccess: (_, projectId) => {
      qc.invalidateQueries({ queryKey: qk.project(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
    },
  });
}

export function useReactivateProjectMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (projectId: ProjectId) => api.reactivateProject(projectId),
    onSuccess: (_, projectId) => {
      qc.invalidateQueries({ queryKey: qk.project(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
    },
  });
}

export function useDeleteProjectMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (projectId: ProjectId) => api.deleteProject(projectId),
    onSuccess: (_, projectId) => {
      qc.invalidateQueries({ queryKey: qk.project(scopeUserId, projectId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
    },
  });
}

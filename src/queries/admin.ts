import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import type { CompanyId, ProjectId, Txn } from '../types';
import type { CompanyRole } from '../types';
import type {
  CompanyUpdateInput,
  ProjectCreateInput,
  ProjectUpdateInput,
  CsvImportMode,
} from '../api/contract';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';

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
    mutationFn: (vars: { name: string; email: string; role: CompanyRole }) =>
      api.createUserInCompany(companyId, vars.name, vars.email, vars.role),
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
  return useMutation({
    mutationFn: (vars: { txns: Txn[]; mode: CsvImportMode }) =>
      api.importTransactions(projectId, vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
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

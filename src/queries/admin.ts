import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../api';
import type { CompanyId, ProjectId } from '../types';
import type { CompanyRole } from '../types';
import type {
  CompanyUpdateInput,
  ProjectCreateInput,
  ProjectUpdateInput,
  CsvImportMode,
} from '../api/contract';
import { qk } from './keys';
import type { Txn } from '../types';
import { useQueryScopeUserId } from './scope';

export function useCreateProjectMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (input: ProjectCreateInput) => api.createProject(companyId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) }),
  });
}

export function useUpdateProjectMutation(companyId: CompanyId) {
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
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();
  return useMutation({
    mutationFn: (vars: { txns: Txn[]; mode: CsvImportMode }) =>
      api.importTransactions(projectId, vars.txns, vars.mode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.transactions(scopeUserId, projectId) });
    },
  });
}

export function useResetToSeedMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.resetToSeed(),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

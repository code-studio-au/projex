import { useQuery } from '@tanstack/react-query';

import { api } from '../api';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import type { CompanyId, ProjectId, UserId } from '../types';

export function useUsersQuery() {
  return useQuery({
    queryKey: qk.users(),
    queryFn: () => api.listUsers(),
  });
}

/**
 * Companies are user-scoped (superadmin vs regular user sees different sets).
 * We key by userId and disable the query until a session exists.
 */
export function useCompaniesQuery(userId?: UserId) {
  return useQuery({
    enabled: !!userId,
    queryKey: userId ? qk.companies(userId) : ['companies', 'anonymous'],
    queryFn: () => api.listCompanies(),
  });
}

export function useCompanyQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.company(scopeUserId, companyId),
    queryFn: () => api.getCompany(companyId),
  });
}

export function useProjectsQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.projects(scopeUserId, companyId),
    queryFn: () => api.listProjects(companyId),
  });
}

export function useProjectQuery(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  return useQuery({
    queryKey: qk.project(scopeUserId, projectId),
    queryFn: () => api.getProject(projectId),
  });
}

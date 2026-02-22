import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { qk } from './keys';
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
  return useQuery({
    queryKey: qk.company(companyId),
    queryFn: () => api.getCompany(companyId),
  });
}

export function useProjectsQuery(companyId: CompanyId) {
  return useQuery({
    queryKey: qk.projects(companyId),
    queryFn: () => api.listProjects(companyId),
  });
}

export function useProjectQuery(projectId: ProjectId) {
  return useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => api.getProject(projectId),
  });
}

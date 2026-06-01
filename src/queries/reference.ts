import { useQuery } from '@tanstack/react-query';

import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import { useSessionQuery } from './session';
import type { CompanyId, ProjectId, UserId } from '../types';
import {
  getDefaultCompanyIdForUserServerFn,
  listCompaniesServerFn,
  listUsersServerFn,
} from '../server/start/functions/reference';
import {
  getCompanyServerFn,
  getCompanySummaryServerFn,
  getProjectServerFn,
  listProjectsServerFn,
} from '../server/start/functions/projectReads';

export function useUsersQuery() {
  return useQuery(usersQueryOptions());
}

export function usersQueryOptions() {
  return {
    queryKey: qk.users(),
    queryFn: () => listUsersServerFn(),
  } as const;
}

/**
 * Companies are user-scoped (superadmin vs regular user sees different sets).
 * We key by userId and disable the query until a session exists.
 */
export function useCompaniesQuery(userId?: UserId) {
  return useQuery(companiesQueryOptions(userId));
}

export function companiesQueryOptions(userId?: UserId) {
  return {
    enabled: !!userId,
    queryKey: userId ? qk.companies(userId) : ['companies', 'anonymous'],
    queryFn: () => listCompaniesServerFn(),
  } as const;
}

export async function getDefaultCompanyIdForUser() {
  return getDefaultCompanyIdForUserServerFn();
}

export function useCompanyQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery({
    enabled: !!session.data?.userId,
    queryKey: qk.company(scopeUserId, companyId),
    queryFn: () => getCompanyServerFn({ data: { companyId } }),
  });
}

export function useCompanySummaryQuery(
  companyId: CompanyId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery({
    enabled: !!session.data?.userId && (options.enabled ?? true),
    queryKey: qk.companySummary(scopeUserId, companyId),
    queryFn: () => getCompanySummaryServerFn({ data: { companyId } }),
  });
}

export function useProjectsQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery({
    enabled: !!session.data?.userId,
    queryKey: qk.projects(scopeUserId, companyId),
    queryFn: () => listProjectsServerFn({ data: { companyId } }),
  });
}

export function useProjectQuery(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery({
    enabled: !!session.data?.userId,
    queryKey: qk.project(scopeUserId, projectId),
    queryFn: () => getProjectServerFn({ data: { projectId } }),
  });
}

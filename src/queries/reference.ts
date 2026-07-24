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
  getCompanyWorkQueueServerFn,
  getProjectServerFn,
  listProjectsServerFn,
} from '../server/start/functions/projectReads';

export function useUsersQuery() {
  const session = useSessionQuery();
  return useQuery(usersQueryOptions(session.data?.userId));
}

function usersQueryOptions(userId?: UserId) {
  return {
    enabled: !!userId,
    queryKey: userId ? qk.users(userId) : ['users', 'anonymous'],
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
  return useQuery(
    companyQueryOptions(session.data?.userId ?? scopeUserId, companyId)
  );
}

export function companyQueryOptions(userId: string, companyId: CompanyId) {
  return {
    enabled: !!userId,
    queryKey: qk.company(userId, companyId),
    queryFn: () => getCompanyServerFn({ data: { companyId } }),
  } as const;
}

export function useCompanySummaryQuery(
  companyId: CompanyId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery(
    companySummaryQueryOptions(
      session.data?.userId ?? scopeUserId,
      companyId,
      options
    )
  );
}

export function companySummaryQueryOptions(
  userId: string,
  companyId: CompanyId,
  options: { enabled?: boolean } = {}
) {
  return {
    enabled: !!userId && (options.enabled ?? true),
    queryKey: qk.companySummary(userId, companyId),
    queryFn: () => getCompanySummaryServerFn({ data: { companyId } }),
  } as const;
}

export function useCompanyWorkQueueQuery(
  companyId: CompanyId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery(
    companyWorkQueueQueryOptions(
      session.data?.userId ?? scopeUserId,
      companyId,
      options
    )
  );
}

function companyWorkQueueQueryOptions(
  userId: string,
  companyId: CompanyId,
  options: { enabled?: boolean } = {}
) {
  return {
    enabled: !!userId && (options.enabled ?? true),
    queryKey: qk.companyWorkQueue(userId, companyId),
    queryFn: () => getCompanyWorkQueueServerFn({ data: { companyId } }),
  } as const;
}

export function useProjectsQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery(
    projectsQueryOptions(session.data?.userId ?? scopeUserId, companyId)
  );
}

export function projectsQueryOptions(userId: string, companyId: CompanyId) {
  return {
    enabled: !!userId,
    queryKey: qk.projects(userId, companyId),
    queryFn: () => listProjectsServerFn({ data: { companyId } }),
  } as const;
}

export function useProjectQuery(projectId: ProjectId) {
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery(
    projectQueryOptions(session.data?.userId ?? scopeUserId, projectId)
  );
}

export function projectQueryOptions(userId: string, projectId: ProjectId) {
  return {
    enabled: !!userId,
    queryKey: qk.project(userId, projectId),
    queryFn: () => getProjectServerFn({ data: { projectId } }),
  } as const;
}

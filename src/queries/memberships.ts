import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import type { CompanyId, ProjectId, UserId } from '../types';
import type { CompanyRole, ProjectRole } from '../types';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import { useSessionQuery } from './session';

export function useCompanyMembershipsQuery(companyId: CompanyId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery({
    enabled: !!session.data?.userId,
    queryKey: qk.companyMemberships(scopeUserId, companyId),
    queryFn: () => api.listCompanyMemberships(companyId),
  });
}

export function useAllCompanyMembershipsQuery() {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery({
    enabled: !!session.data?.userId,
    queryKey: qk.allCompanyMemberships(scopeUserId),
    queryFn: () => api.listAllCompanyMemberships(),
  });
}

export function useProjectMembershipsQuery(projectId: ProjectId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery({
    enabled: !!session.data?.userId,
    queryKey: qk.projectMemberships(scopeUserId, projectId),
    queryFn: () => api.listProjectMemberships(projectId),
  });
}

/**
 * Safe shape for Option A visibility:
 * - projects can be listed without membership
 * - opening still requires membership/admin/executive/global superadmin
 *
 * UI only needs *my* memberships to compute which projects are openable.
 */
export function useMyProjectMembershipsQuery(companyId: CompanyId) {
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery({
    enabled: !!session.data?.userId,
    queryKey: qk.myProjectMemberships(scopeUserId, companyId),
    queryFn: () => api.listMyProjectMemberships(companyId),
  });
}

export function useUpsertCompanyMembershipMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();

  return useMutation({
    mutationFn: (vars: { userId: UserId; role: CompanyRole }) =>
      api.upsertCompanyMembership(companyId, vars.userId, vars.role),
    onSuccess: () => {
      // Membership changes affect company settings and project visibility/listing.
      qc.invalidateQueries({ queryKey: qk.companyMemberships(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.myProjectMemberships(scopeUserId, companyId) });
    },
  });
}

export function useDeleteCompanyMembershipMutation(companyId: CompanyId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();

  return useMutation({
    mutationFn: (userId: UserId) => api.deleteCompanyMembership(companyId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.companyMemberships(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
      qc.invalidateQueries({ queryKey: qk.myProjectMemberships(scopeUserId, companyId) });
    },
  });
}

export function useUpsertProjectMembershipMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();

  return useMutation({
    mutationFn: (vars: { userId: UserId; role: ProjectRole }) =>
      api.upsertProjectMembership(projectId, vars.userId, vars.role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projectMemberships(scopeUserId, projectId) });

      // Project membership changes can affect access/visibility across lists.
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          ['myProjectMemberships', 'projects', 'project'].includes(String(q.queryKey[0])),
      });
    },
  });
}

export function useDeleteProjectMembershipMutation(projectId: ProjectId) {
  const api = useApi();
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();

  return useMutation({
    mutationFn: (vars: { userId: UserId; role: ProjectRole }) =>
      api.deleteProjectMembership(projectId, vars.userId, vars.role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projectMemberships(scopeUserId, projectId) });
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          ['myProjectMemberships', 'projects', 'project'].includes(String(q.queryKey[0])),
      });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CompanyId, ProjectId, UserId } from '../types';
import type { CompanyRole, ProjectRole } from '../types';
import { qk } from './keys';
import { useQueryScopeUserId } from './scope';
import { useSessionQuery } from './session';
import {
  listAllCompanyMembershipsServerFn,
  deleteCompanyMembershipServerFn,
  deleteProjectMembershipServerFn,
  listCompanyMembershipsServerFn,
  listMyProjectMembershipsServerFn,
  listProjectMembershipsServerFn,
  upsertCompanyMembershipServerFn,
  upsertProjectMembershipServerFn,
} from '../server/start/functions/memberships';

export function allCompanyMembershipsQueryOptions(userId?: UserId) {
  return {
    enabled: !!userId,
    queryKey: userId
      ? qk.allCompanyMemberships(userId)
      : ['memberships', 'anonymous'],
    queryFn: () => listAllCompanyMembershipsServerFn(),
  } as const;
}

export function useCompanyMembershipsQuery(companyId: CompanyId) {
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery({
    enabled: !!session.data?.userId,
    queryKey: qk.companyMemberships(scopeUserId, companyId),
    queryFn: () => listCompanyMembershipsServerFn({ data: { companyId } }),
  });
}

export function useAllCompanyMembershipsQuery() {
  const session = useSessionQuery();
  return useQuery(allCompanyMembershipsQueryOptions(session.data?.userId));
}

export function myProjectMembershipsQueryOptions(
  userId?: string,
  companyId?: CompanyId
) {
  return {
    enabled: !!userId && !!companyId,
    queryKey:
      userId && companyId
        ? qk.myProjectMemberships(userId, companyId)
        : (['myProjectMemberships', 'anonymous'] as const),
    queryFn: () =>
      listMyProjectMembershipsServerFn({
        data: { companyId: companyId as CompanyId },
      }),
  } as const;
}

export function useProjectMembershipsQuery(
  projectId: ProjectId,
  options: { enabled?: boolean } = {}
) {
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery({
    enabled: !!session.data?.userId && (options.enabled ?? true),
    queryKey: qk.projectMemberships(scopeUserId, projectId),
    queryFn: () => listProjectMembershipsServerFn({ data: { projectId } }),
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
  const scopeUserId = useQueryScopeUserId();
  const session = useSessionQuery();
  return useQuery(
    myProjectMembershipsQueryOptions(
      session.data?.userId ?? scopeUserId,
      companyId
    )
  );
}

export function useUpsertCompanyMembershipMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();

  return useMutation({
    mutationFn: (vars: { userId: UserId; role: CompanyRole }) =>
      upsertCompanyMembershipServerFn({
        data: { companyId, userId: vars.userId, role: vars.role },
      }),
    onSuccess: () => {
      // Membership changes affect company settings and project visibility/listing.
      qc.invalidateQueries({
        queryKey: qk.companyMemberships(scopeUserId, companyId),
      });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
      qc.invalidateQueries({
        queryKey: qk.myProjectMemberships(scopeUserId, companyId),
      });
    },
  });
}

export function useDeleteCompanyMembershipMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();

  return useMutation({
    mutationFn: (userId: UserId) =>
      deleteCompanyMembershipServerFn({ data: { companyId, userId } }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: qk.companyMemberships(scopeUserId, companyId),
      });
      qc.invalidateQueries({ queryKey: qk.allCompanyMemberships(scopeUserId) });
      qc.invalidateQueries({ queryKey: qk.projects(scopeUserId, companyId) });
      qc.invalidateQueries({
        queryKey: qk.myProjectMemberships(scopeUserId, companyId),
      });
    },
  });
}

export function useUpsertProjectMembershipMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();

  return useMutation({
    mutationFn: (vars: { userId: UserId; role: ProjectRole }) =>
      upsertProjectMembershipServerFn({
        data: { projectId, userId: vars.userId, role: vars.role },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: qk.projectMemberships(scopeUserId, projectId),
      });

      // Project membership changes can affect access/visibility across lists.
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          ['myProjectMemberships', 'projects', 'project'].includes(
            String(q.queryKey[0])
          ),
      });
    },
  });
}

export function useDeleteProjectMembershipMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  const scopeUserId = useQueryScopeUserId();

  return useMutation({
    mutationFn: (vars: { userId: UserId; role: ProjectRole }) =>
      deleteProjectMembershipServerFn({
        data: { projectId, userId: vars.userId, role: vars.role },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: qk.projectMemberships(scopeUserId, projectId),
      });
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          ['myProjectMemberships', 'projects', 'project'].includes(
            String(q.queryKey[0])
          ),
      });
    },
  });
}

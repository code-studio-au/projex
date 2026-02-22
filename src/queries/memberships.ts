import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../api';
import type { CompanyId, ProjectId, UserId } from '../types';
import type { CompanyRole, ProjectRole } from '../types';
import { qk } from './keys';

export function useCompanyMembershipsQuery(companyId: CompanyId) {
  return useQuery({
    queryKey: qk.companyMemberships(companyId),
    queryFn: () => api.listCompanyMemberships(companyId),
  });
}

export function useAllCompanyMembershipsQuery() {
  return useQuery({
    queryKey: qk.allCompanyMemberships(),
    queryFn: () => api.listAllCompanyMemberships(),
  });
}

export function useProjectMembershipsQuery(projectId: ProjectId) {
  return useQuery({
    queryKey: qk.projectMemberships(projectId),
    queryFn: () => api.listProjectMemberships(projectId),
  });
}

export function useAllProjectMembershipsQuery(companyId: CompanyId) {
  return useQuery({
    queryKey: qk.allProjectMemberships(companyId),
    queryFn: async () => {
      const projects = await api.listProjects(companyId);
      const memberships = await Promise.all(
        projects.map((p) => api.listProjectMemberships(p.id))
      );
      return memberships.flat();
    },
  });
}

export function useUpsertCompanyMembershipMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: UserId; role: CompanyRole }) =>
      api.upsertCompanyMembership(companyId, vars.userId, vars.role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.companyMemberships(companyId) });
    },
  });
}

export function useDeleteCompanyMembershipMutation(companyId: CompanyId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: UserId) => api.deleteCompanyMembership(companyId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.companyMemberships(companyId) });
    },
  });
}

export function useUpsertProjectMembershipMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: UserId; role: ProjectRole }) =>
      api.upsertProjectMembership(projectId, vars.userId, vars.role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projectMemberships(projectId) });
    },
  });
}

export function useDeleteProjectMembershipMutation(projectId: ProjectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: UserId; role: ProjectRole }) =>
      api.deleteProjectMembership(projectId, vars.userId, vars.role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projectMemberships(projectId) });
    },
  });
}

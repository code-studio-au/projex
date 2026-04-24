import type {
  CompanyId,
  CompanyMembership,
  CompanyRole,
  Project,
  ProjectId,
  ProjectMembership,
  User,
  UserId,
} from '../types';

/**
 * Access-control helper utilities for the demo app.
 *
 * These helpers support client-side UX decisions using membership data already
 * loaded from the server.
 */

const companyRoleRank: Record<CompanyRole, number> = {
  admin: 4,
  executive: 3,
  management: 2,
  member: 1,
};

/**
 * Picks a "primary" company for a given user.
 *
 * This is a UX convenience used to pick the default company in the UI.
 * For deterministic behavior, we rank roles and then fall back to stable ordering.
 */
export function getPrimaryCompanyForUser(
  userId: UserId,
  companyMemberships: CompanyMembership[]
) {
  const ms = companyMemberships.filter((m) => m.userId === userId);
  if (!ms.length) return null;

  // pick the membership with the "highest" role
  return ms
    .slice()
    .sort(
      (a, b) => (companyRoleRank[b.role] ?? 0) - (companyRoleRank[a.role] ?? 0)
    )[0];
}

export function getUserCompanyId(
  userId: UserId,
  companyMemberships: CompanyMembership[]
) {
  const m = companyMemberships.find((x) => x.userId === userId);
  return m ? m.companyId : null;
}

export function getUserCompanyRoles(
  userId: UserId,
  companyId: CompanyId,
  companyMemberships: CompanyMembership[]
) {
  return companyMemberships
    .filter((m) => m.userId === userId && m.companyId === companyId)
    .map((m) => m.role);
}

export function getUserCompanyRole(
  userId: UserId,
  companyId: CompanyId,
  companyMemberships: CompanyMembership[]
) {
  const roles = getUserCompanyRoles(userId, companyId, companyMemberships);
  if (!roles.length) return null;
  return roles
    .slice()
    .sort((a, b) => (companyRoleRank[b] ?? 0) - (companyRoleRank[a] ?? 0))[0];
}

export function getUserProjectRoles(
  userId: UserId,
  projectId: ProjectId,
  projectMemberships: ProjectMembership[]
) {
  return projectMemberships
    .filter((m) => m.userId === userId && m.projectId === projectId)
    .map((m) => m.role);
}

export function getCompanyUserIds(
  companyId: CompanyId,
  companyMemberships: CompanyMembership[]
) {
  return companyMemberships
    .filter((m) => m.companyId === companyId)
    .map((m) => m.userId);
}

export function getCompanyUsers(
  companyId: CompanyId,
  users: User[],
  companyMemberships: CompanyMembership[]
) {
  const ids = new Set(getCompanyUserIds(companyId, companyMemberships));
  return users.filter((u) => ids.has(u.id));
}

export function getCompanyProjects(companyId: CompanyId, projects: Project[]) {
  return projects.filter((p) => p.companyId === companyId);
}

export function canManageCompany(
  userId: UserId,
  companyId: CompanyId,
  companyMemberships: CompanyMembership[]
) {
  const role = getUserCompanyRole(userId, companyId, companyMemberships);
  return role === 'admin' || role === 'executive';
}

export function canManageProject(
  userId: UserId,
  projectId: ProjectId,
  projectMemberships: ProjectMembership[]
) {
  const roles = getUserProjectRoles(userId, projectId, projectMemberships);
  return roles.includes('owner') || roles.includes('lead');
}

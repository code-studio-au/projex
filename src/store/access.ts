import type {
  CompanyId,
  CompanyMembership,
  CompanyRole,
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

function getUserCompanyRoles(
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

function getCompanyUserIds(
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

import type {
  CompanyId,
  CompanyMembership,
  CompanyRole,
  ProjectId,
  ProjectMembership,
  ProjectRole,
  UserId,
} from '../types';

export type Action =
  | 'company:view'
  | 'company:manage_members'
  | 'project:list'
  | 'project:view'
  | 'project:edit'
  | 'project:import'
  | 'budget:edit'
  | 'taxonomy:edit'
  | 'txns:edit';

const companyRank: Record<CompanyRole, number> = {
  superadmin: 5,
  admin: 4,
  executive: 3,
  management: 2,
  member: 1,
};

const projectRank: Record<ProjectRole, number> = {
  owner: 4,
  lead: 3,
  member: 2,
  viewer: 1,
};

function bestCompanyRole(
  memberships: CompanyMembership[],
  companyId: CompanyId,
  userId: UserId
): CompanyRole | null {
  const roles = memberships
    .filter((m) => m.companyId === companyId && m.userId === userId)
    .map((m) => m.role);
  if (!roles.length) return null;
  return roles.sort((a, b) => companyRank[b] - companyRank[a])[0];
}

function bestProjectRole(
  memberships: ProjectMembership[],
  projectId: ProjectId,
  userId: UserId
): ProjectRole | null {
  const roles = memberships
    .filter((m) => m.projectId === projectId && m.userId === userId)
    .map((m) => m.role);
  if (!roles.length) return null;
  return roles.sort((a, b) => projectRank[b] - projectRank[a])[0];
}

/**
 * Most-permissive evaluation: if a user has multiple roles (e.g. exec + project lead),
 * we take the highest privilege applicable to the resource.
 */
export function can(params: {
  userId: UserId;
  companyId: CompanyId;
  projectId?: ProjectId;
  action: Action;
  companyMemberships: CompanyMembership[];
  projectMemberships: ProjectMembership[];
}): boolean {
  const {
    userId,
    companyId,
    projectId,
    action,
    companyMemberships,
    projectMemberships,
  } = params;

  // Global superadmin: allow everything across all companies/projects.
  const isSuper = companyMemberships.some(
    (m) => m.userId === userId && m.role === 'superadmin'
  );
  if (isSuper) return true;

  const cRole = bestCompanyRole(companyMemberships, companyId, userId);

  // company-level permissions
  if (action.startsWith('company:')) {
    if (!cRole) return false;
    if (action === 'company:view') return true;
    if (action === 'company:manage_members')
      return cRole === 'superadmin' || cRole === 'admin';
    return false;
  }

  // project-level permissions
  if (!projectId) return false;

  const pRole = bestProjectRole(projectMemberships, projectId, userId);

  // If you are exec/management/admin at company level, you can view/list all projects.
  const companyCanViewAll =
    cRole === 'superadmin' ||
    cRole === 'admin' ||
    cRole === 'executive' ||
    cRole === 'management';

  if (action === 'project:list' || action === 'project:view') {
    return companyCanViewAll || !!pRole;
  }

  // Mutations require either high company role or adequate project role
  const companyCanEdit =
    cRole === 'superadmin' ||
    cRole === 'admin' ||
    cRole === 'executive' ||
    cRole === 'management';

  if (action === 'project:edit')
    return companyCanEdit || pRole === 'owner' || pRole === 'lead';
  if (action === 'project:import')
    return (
      companyCanEdit ||
      pRole === 'owner' ||
      pRole === 'lead' ||
      pRole === 'member'
    );
  if (action === 'budget:edit')
    return companyCanEdit || pRole === 'owner' || pRole === 'lead';
  if (action === 'taxonomy:edit')
    return companyCanEdit || pRole === 'owner' || pRole === 'lead';
  if (action === 'txns:edit')
    return (
      companyCanEdit ||
      pRole === 'owner' ||
      pRole === 'lead' ||
      pRole === 'member'
    );

  return false;
}

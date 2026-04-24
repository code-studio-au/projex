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
  | 'company:edit'
  | 'company:manage_members'
  | 'project:list'
  | 'project:view'
  | 'project:edit'
  | 'project:import'
  | 'budget:edit'
  | 'taxonomy:edit'
  | 'txns:edit';

const companyRank: Record<CompanyRole, number> = {
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
  isGlobalSuperadmin?: boolean;
  companyMemberships: CompanyMembership[];
  projectMemberships: ProjectMembership[];
}): boolean {
  const {
    userId,
    companyId,
    projectId,
    action,
    isGlobalSuperadmin = false,
    companyMemberships,
    projectMemberships,
  } = params;

  // Global superadmin: allow everything across all companies/projects.
  // The client mirrors the membership data it has so UX gating stays aligned
  // with server-side authorization.
  const isSuper = isGlobalSuperadmin;
  if (isSuper) return true;

  const cRole = bestCompanyRole(companyMemberships, companyId, userId);

  // company-level permissions
  if (action.startsWith('company:')) {
    if (!cRole) return false;
    if (action === 'company:view') return true;
    if (action === 'company:edit') return cRole === 'admin' || cRole === 'executive' || cRole === 'management';
    if (action === 'company:manage_members')
      return cRole === 'admin';
    return false;
  }

  // project-level permissions
  if (!projectId) return false;

  const pRole = bestProjectRole(projectMemberships, projectId, userId);

  // Company exec/admin can view all company projects.
  // "Management" behaves like a normal member for project visibility unless you decide otherwise.
  const companyCanViewAll = cRole === 'admin' || cRole === 'executive';

  if (action === 'project:list' || action === 'project:view') {
    return companyCanViewAll || !!pRole;
  }

  // Mutations require either high company role or adequate project role
  // Company exec/admin can edit everything within the company and its projects.
  const companyCanEdit = cRole === 'admin' || cRole === 'executive';

  // Project leads can do all actions for projects they lead.
  // Team members can work in txns + budget only.
  if (action === 'project:edit') return companyCanEdit || pRole === 'owner' || pRole === 'lead';

  // Import + taxonomy are restricted to company exec/admin or project lead/owner.
  if (action === 'project:import') return companyCanEdit || pRole === 'owner' || pRole === 'lead';
  if (action === 'taxonomy:edit') return companyCanEdit || pRole === 'owner' || pRole === 'lead';

  // Budgets + transactions can be edited by leads AND members (within projects they belong to).
  if (action === 'budget:edit')
    return companyCanEdit || pRole === 'owner' || pRole === 'lead' || pRole === 'member';
  if (action === 'txns:edit')
    return companyCanEdit || pRole === 'owner' || pRole === 'lead' || pRole === 'member';

  return false;
}

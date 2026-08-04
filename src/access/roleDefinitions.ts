import type { CompanyRole, ProjectRole } from '../types';

export type RoleDefinition<Role extends string> = {
  value: Role;
  label: string;
  summary: string;
  capabilities: readonly string[];
};

const companyRoleDefinitions = [
  {
    value: 'member',
    label: 'Member',
    summary:
      'Can enter the company and work only in projects where they have an explicit project role.',
    capabilities: [
      'View the company landing area',
      'Use only explicitly assigned projects',
      'Project actions depend on the separate project role',
    ],
  },
  {
    value: 'management',
    label: 'Management',
    summary:
      'Can maintain company details, but still needs an explicit role for each project.',
    capabilities: [
      'Update company details',
      'Use only explicitly assigned projects',
      'Cannot manage company members, defaults, or exports',
    ],
  },
  {
    value: 'executive',
    label: 'Executive',
    summary:
      'Has broad operational access across the company without permission to administer company membership.',
    capabilities: [
      'View and edit every company project',
      'Create, configure, archive, and restore projects',
      'Manage company defaults and exports',
      'Cannot add, remove, or change company members',
    ],
  },
  {
    value: 'admin',
    label: 'Admin',
    summary:
      'Has full company access, including responsibility for membership and role administration.',
    capabilities: [
      'All Executive capabilities',
      'Add and remove company members',
      'Change company roles',
      'Must not be the company’s only remaining Admin when demoted or removed',
    ],
  },
] as const satisfies readonly RoleDefinition<CompanyRole>[];

const projectRoleDefinitions = [
  {
    value: 'viewer',
    label: 'Viewer',
    summary: 'Can open and read this project without changing project data.',
    capabilities: ['View the project', 'Cannot edit project data'],
  },
  {
    value: 'member',
    label: 'Member',
    summary:
      'Can perform day-to-day financial work and participate in project comments.',
    capabilities: [
      'View the project',
      'Edit budgets and transactions',
      'Create transaction comments',
      'Cannot import data, manage taxonomy, or administer workflows',
    ],
  },
  {
    value: 'lead',
    label: 'Lead',
    summary:
      'Can lead project operations, including imports, coding standards, and review workflows.',
    capabilities: [
      'All Member capabilities',
      'Edit the project and import transactions',
      'Manage taxonomy and coding rules',
      'Assign, resolve, and moderate comments',
      'Manage unlock and reversal workflows',
    ],
  },
  {
    value: 'owner',
    label: 'Owner',
    summary:
      'Identifies the accountable project owner and currently carries the same application permissions as Lead.',
    capabilities: [
      'All Lead capabilities',
      'Signals primary project accountability',
      'Company Admins and Executives can still administer the project',
    ],
  },
] as const satisfies readonly RoleDefinition<ProjectRole>[];

export const companyRoleOptions = companyRoleDefinitions.map(
  ({ value, label }) => ({ value, label })
);

export const projectRoleOptions = projectRoleDefinitions.map(
  ({ value, label }) => ({ value, label })
);

export function getCompanyRoleDefinition(role: CompanyRole) {
  return companyRoleDefinitions.find(
    (definition) => definition.value === role
  )!;
}

export function getProjectRoleDefinition(role: ProjectRole) {
  return projectRoleDefinitions.find(
    (definition) => definition.value === role
  )!;
}

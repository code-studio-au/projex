import type { CompanyMembership, ProjectMembership } from '../types/index.ts';
import { asCompanyId, asProjectId, asUserId } from '../types/index.ts';

export const seedCompanyMemberships: CompanyMembership[] = [
  {
    companyId: asCompanyId('co_projex'),
    userId: asUserId('u_superadmin'),
    role: 'superadmin',
  },

  {
    companyId: asCompanyId('co_acme'),
    userId: asUserId('u_exec'),
    role: 'executive',
  },
  {
    companyId: asCompanyId('co_acme'),
    userId: asUserId('u_mgmt'),
    role: 'management',
  },
  {
    companyId: asCompanyId('co_acme'),
    userId: asUserId('u_lead'),
    role: 'member',
  },
  {
    companyId: asCompanyId('co_acme'),
    userId: asUserId('u_member'),
    role: 'member',
  },

  {
    companyId: asCompanyId('co_globex'),
    userId: asUserId('u_viewer'),
    role: 'member',
  },
];

export const seedProjectMemberships: ProjectMembership[] = [
  {
    projectId: asProjectId('prj_acme_alpha'),
    userId: asUserId('u_lead'),
    role: 'lead',
  },
  {
    projectId: asProjectId('prj_acme_alpha'),
    userId: asUserId('u_member'),
    role: 'member',
  },
  {
    projectId: asProjectId('prj_acme_beta'),
    userId: asUserId('u_member'),
    role: 'lead',
  },
  {
    projectId: asProjectId('prj_globex_ops'),
    userId: asUserId('u_viewer'),
    role: 'viewer',
  },
];

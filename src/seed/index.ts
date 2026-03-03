import type { CompanyId, ProjectId } from '../types/index.ts';
import { asCompanyId, asProjectId } from '../types/index.ts';
import { seedCompanies } from './companies.ts';
import { seedUsers } from './users.ts';
import { seedProjects } from './projects.ts';
import { seedCompanyMemberships, seedProjectMemberships } from './memberships.ts';
import { seedDataByProjectId, type SeedProjectDataSlice } from './projectData.ts';

export const PROJEX_STATE_KEY = 'projex_state_v1';

export type PersistedStateV1 = {
  users: typeof seedUsers;
  companies: typeof seedCompanies;
  projects: typeof seedProjects;
  companyMemberships: typeof seedCompanyMemberships;
  projectMemberships: typeof seedProjectMemberships;
  dataByProjectId: Record<ProjectId, SeedProjectDataSlice>;
  activeCompanyId: CompanyId;
  activeProjectId: ProjectId | null;
};

/**
 * Build the seed state.
 * Keep this pure (no access to window/localStorage) so it is reusable in tests and tooling later.
 */
export function buildSeedState(): PersistedStateV1 {
  return {
    users: seedUsers,
    companies: seedCompanies,
    projects: seedProjects,
    companyMemberships: seedCompanyMemberships,
    projectMemberships: seedProjectMemberships,
    dataByProjectId: seedDataByProjectId,
    activeCompanyId: asCompanyId('co_acme'),
    activeProjectId: asProjectId('prj_acme_alpha'),
  };
}

export const seedState: PersistedStateV1 = buildSeedState();

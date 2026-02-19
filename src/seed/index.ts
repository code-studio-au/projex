import type { CompanyId, ProjectId } from "../types";
import { asCompanyId, asProjectId } from "../types";
import { seedCompanies } from "./companies";
import { seedUsers } from "./users";
import { seedProjects } from "./projects";
import { seedCompanyMemberships, seedProjectMemberships } from "./memberships";
import { seedDataByProjectId, type SeedProjectDataSlice } from "./projectData";

export const PROJEX_STATE_KEY = "projex_state_v1";

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
    activeCompanyId: asCompanyId("co_acme"),
    activeProjectId: asProjectId("prj_acme_alpha"),
  };
}

export const seedState: PersistedStateV1 = buildSeedState();

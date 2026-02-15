import type { Id } from "../types";
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
  dataByProjectId: Record<Id, SeedProjectDataSlice>;
  activeCompanyId: Id;
  activeProjectId: Id | null;
};

export const seedState: PersistedStateV1 = {
  users: seedUsers,
  companies: seedCompanies,
  projects: seedProjects,
  companyMemberships: seedCompanyMemberships,
  projectMemberships: seedProjectMemberships,
  dataByProjectId: seedDataByProjectId,
  activeCompanyId: "co_acme",
  activeProjectId: "prj_acme_alpha",
};

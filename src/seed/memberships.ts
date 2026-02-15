import type { CompanyMembership, ProjectMembership } from "../types";

export const seedCompanyMemberships: CompanyMembership[] = [
  { companyId: "co_projex", userId: "u_superadmin", role: "superadmin" },

  { companyId: "co_acme", userId: "u_exec", role: "executive" },
  { companyId: "co_acme", userId: "u_mgmt", role: "management" },
  { companyId: "co_acme", userId: "u_lead", role: "member" },
  { companyId: "co_acme", userId: "u_member", role: "member" },

  { companyId: "co_globex", userId: "u_viewer", role: "member" },
];

export const seedProjectMemberships: ProjectMembership[] = [
  { projectId: "prj_acme_alpha", userId: "u_lead", role: "lead" },
  { projectId: "prj_acme_alpha", userId: "u_member", role: "member" },
  { projectId: "prj_acme_beta", userId: "u_member", role: "lead" },
  { projectId: "prj_globex_ops", userId: "u_viewer", role: "viewer" },
];

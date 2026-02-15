import type { Project } from "../types";

export const seedProjects: Project[] = [
  { id: "prj_acme_alpha", companyId: "co_acme", name: "Alpha", currency: "AUD", status: "active" },
  { id: "prj_acme_beta", companyId: "co_acme", name: "Beta", currency: "AUD", status: "active" },
  { id: "prj_globex_ops", companyId: "co_globex", name: "Ops Modernisation", currency: "AUD", status: "active" },
];

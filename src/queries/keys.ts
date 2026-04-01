export const qk = {
  session: () => ['session'] as const,
  users: () => ['users'] as const,

  // Everything else is session-scoped because visibility/permissions depend on who is logged in.
  companies: (userId: string) => ['companies', userId] as const,
  company: (userId: string, companyId: string) => ['company', userId, companyId] as const,
  companyMemberships: (userId: string, companyId: string) =>
    ['companyMemberships', userId, companyId] as const,
  allCompanyMemberships: (userId: string) => ['allCompanyMemberships', userId] as const,
  companyDefaultCategories: (userId: string, companyId: string) =>
    ['companyDefaultCategories', userId, companyId] as const,
  companyDefaultSubCategories: (userId: string, companyId: string) =>
    ['companyDefaultSubCategories', userId, companyId] as const,
  companyDefaultMappingRules: (userId: string, companyId: string) =>
    ['companyDefaultMappingRules', userId, companyId] as const,

  projects: (userId: string, companyId: string) => ['projects', userId, companyId] as const,
  project: (userId: string, projectId: string) => ['project', userId, projectId] as const,

  projectMemberships: (userId: string, projectId: string) =>
    ['projectMemberships', userId, projectId] as const,
  myProjectMemberships: (userId: string, companyId: string) =>
    ['myProjectMemberships', userId, companyId] as const,

  transactions: (userId: string, projectId: string) => ['transactions', userId, projectId] as const,
  budgets: (userId: string, projectId: string) => ['budgets', userId, projectId] as const,
  categories: (userId: string, projectId: string) => ['categories', userId, projectId] as const,
  subCategories: (userId: string, projectId: string) => ['subCategories', userId, projectId] as const,
};

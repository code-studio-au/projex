export const qk = {
  session: () => ['session'] as const,
  users: () => ['users'] as const,
  // Companies are user-scoped (superadmin vs regular user returns different sets)
  companies: (userId: string) => ['companies', userId] as const,
  company: (companyId: string) => ['company', companyId] as const,
  companyMemberships: (companyId: string) =>
    ['companyMemberships', companyId] as const,
  allCompanyMemberships: () => ['allCompanyMemberships'] as const,
  projects: (companyId: string) => ['projects', companyId] as const,
  project: (projectId: string) => ['project', projectId] as const,
  projectMemberships: (projectId: string) =>
    ['projectMemberships', projectId] as const,
  allProjectMemberships: (companyId: string) =>
    ['allProjectMemberships', companyId] as const,
  transactions: (projectId: string) => ['transactions', projectId] as const,
  budgets: (projectId: string) => ['budgets', projectId] as const,
  categories: (projectId: string) => ['categories', projectId] as const,
  subCategories: (projectId: string) => ['subCategories', projectId] as const,
};

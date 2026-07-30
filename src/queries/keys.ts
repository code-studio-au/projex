export const qk = {
  session: () => ['session'] as const,
  currentUser: (userId: string) => ['currentUser', userId] as const,
  users: (userId: string) => ['users', userId] as const,

  // Everything else is session-scoped because visibility/permissions depend on
  // who is logged in.
  companies: (userId: string) => ['companies', userId] as const,
  company: (userId: string, companyId: string) =>
    ['company', userId, companyId] as const,
  companySummaries: (userId: string) => ['companySummary', userId] as const,
  companySummary: (userId: string, companyId: string) =>
    ['companySummary', userId, companyId] as const,
  companyWorkQueues: (userId: string) => ['companyWorkQueue', userId] as const,
  companyWorkQueue: (userId: string, companyId: string) =>
    ['companyWorkQueue', userId, companyId] as const,
  companyDefaults: (userId: string, companyId: string) =>
    ['companyDefaults', userId, companyId] as const,
  companyMemberships: (userId: string, companyId: string) =>
    ['companyMemberships', userId, companyId] as const,
  allCompanyMemberships: (userId: string) =>
    ['allCompanyMemberships', userId] as const,
  companyDefaultCategories: (userId: string, companyId: string) =>
    ['companyDefaultCategories', userId, companyId] as const,
  companyDefaultSubCategories: (userId: string, companyId: string) =>
    ['companyDefaultSubCategories', userId, companyId] as const,
  companyDefaultMappingRules: (userId: string, companyId: string) =>
    ['companyDefaultMappingRules', userId, companyId] as const,
  ruleSuggestions: (userId: string, companyId: string) =>
    ['ruleSuggestions', userId, companyId] as const,
  importRules: (userId: string, companyId: string) =>
    ['importRules', 'company', userId, companyId] as const,
  projectImportRules: (userId: string, projectId: string) =>
    ['importRules', 'project', userId, projectId] as const,

  projects: (userId: string, companyId: string) =>
    ['projects', userId, companyId] as const,
  project: (userId: string, projectId: string) =>
    ['project', userId, projectId] as const,
  projectAutoCodingRules: (userId: string, projectId: string) =>
    ['projectAutoCodingRules', userId, projectId] as const,

  projectMemberships: (userId: string, projectId: string) =>
    ['projectMemberships', userId, projectId] as const,
  myProjectMemberships: (userId: string, companyId: string) =>
    ['myProjectMemberships', userId, companyId] as const,

  transactions: (userId: string, projectId: string) =>
    ['transactions', userId, projectId] as const,
  transaction: (userId: string, projectId: string, txnId: string) =>
    ['transactions', userId, projectId, 'by-id', txnId] as const,
  transactionSummary: (userId: string, projectId: string) =>
    ['transactions', userId, projectId, 'summary'] as const,
  transactionsPage: (
    userId: string,
    projectId: string,
    params: Record<string, unknown>
  ) => ['transactions', userId, projectId, 'page', params] as const,
  transactionReversalSuggestions: (
    userId: string,
    projectId: string,
    txnId: string
  ) =>
    ['transactions', userId, projectId, 'reversal-suggestions', txnId] as const,
  transactionComments: (userId: string, projectId: string, txnId: string) =>
    ['transactionComments', userId, projectId, txnId] as const,
  transactionCommentSummaries: (
    userId: string,
    projectId: string,
    txnIdsKey: string
  ) => ['transactionCommentSummaries', userId, projectId, txnIdsKey] as const,
  budgets: (userId: string, projectId: string) =>
    ['budgets', userId, projectId] as const,
  categories: (userId: string, projectId: string) =>
    ['categories', userId, projectId] as const,
  subCategories: (userId: string, projectId: string) =>
    ['subCategories', userId, projectId] as const,
};

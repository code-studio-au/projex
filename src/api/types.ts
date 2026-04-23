import type {
  BudgetLine,
  Category,
  Company,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyId,
  CompanyMembership,
  CompanyRole,
  CompanySummary,
  Project,
  ProjectId,
  ProjectMembership,
  ProjectRole,
  SubCategory,
  Txn,
  TxnId,
  User,
  UserId,
  ImportPreviewRow,
} from '../types';

/**
 * API boundary.
 *
 * Rules:
 * - Pure TypeScript types only (no React Query types).
 * - Prefer coarse-grained, command-shaped methods.
 * - All money is in minor units (cents).
 * - txn.date is a date-only string (YYYY-MM-DD) mapped to Postgres DATE.
 * - Txn.internalId is a server-managed BIGINT (exposed as decimal string if needed).
 * - Txn.externalId stores source/import reference for dedupe and audit.
 * - createdAt/updatedAt are ISO strings mapped to Postgres TIMESTAMPTZ.
 */

export type Session = {
  userId: UserId;
};

export type CsvImportMode = 'append' | 'replaceAll';
export type TxnImportTxnInput = Omit<Txn, 'internalId' | 'createdAt' | 'updatedAt'>;
export type TxnImportInput = {
  txns: TxnImportTxnInput[];
  mode: CsvImportMode;
  autoCreateBudgets?: boolean;
};
export type TxnImportPreviewInput = {
  csvText: string;
  autoCreateStructures?: boolean;
};
export type TxnImportPreviewResult = {
  rows: ImportPreviewRow[];
};

// Inputs (command-style)
export type TxnCreateInput = Omit<Txn, 'id' | 'internalId' | 'createdAt' | 'updatedAt'> & { id?: TxnId };
export type TxnUpdateInput = Partial<
  Omit<Txn, 'id' | 'internalId' | 'createdAt' | 'updatedAt' | 'externalId' | 'categoryId' | 'subCategoryId'>
> & {
  id: TxnId;
  externalId?: string | null;
  categoryId?: Txn['categoryId'] | null;
  subCategoryId?: Txn['subCategoryId'] | null;
};

export type BudgetCreateInput = Omit<BudgetLine, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: BudgetLine['id'];
};
export type BudgetUpdateInput = Partial<Omit<BudgetLine, 'id' | 'createdAt' | 'updatedAt'>> & {
  id: BudgetLine['id'];
};

export type CategoryCreateInput = Omit<Category, 'id' | 'createdAt' | 'updatedAt'> & { id?: Category['id'] };
export type CategoryUpdateInput = Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>> & {
  id: Category['id'];
};

export type CompanyDefaultCategoryCreateInput = Omit<
  CompanyDefaultCategory,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: CompanyDefaultCategory['id'];
};
export type CompanyDefaultCategoryUpdateInput = Partial<
  Omit<CompanyDefaultCategory, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: CompanyDefaultCategory['id'];
};

export type SubCategoryCreateInput = Omit<SubCategory, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: SubCategory['id'];
};
export type SubCategoryUpdateInput = Partial<Omit<SubCategory, 'id' | 'createdAt' | 'updatedAt'>> & {
  id: SubCategory['id'];
};

export type CompanyDefaultSubCategoryCreateInput = Omit<
  CompanyDefaultSubCategory,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: CompanyDefaultSubCategory['id'];
};
export type CompanyDefaultSubCategoryUpdateInput = Partial<
  Omit<CompanyDefaultSubCategory, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: CompanyDefaultSubCategory['id'];
};

export type CompanyDefaultMappingRuleCreateInput = Omit<
  CompanyDefaultMappingRule,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: CompanyDefaultMappingRule['id'];
};
export type CompanyDefaultMappingRuleUpdateInput = Partial<
  Omit<CompanyDefaultMappingRule, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>
> & {
  id: CompanyDefaultMappingRule['id'];
};

export type ApplyCompanyDefaultsResult = {
  companyDefaultsConfigured: boolean;
  categoriesAdded: number;
  subCategoriesAdded: number;
};

export type ProjectCreateInput = Pick<Project, 'name'> & { id?: ProjectId };
export type ProjectUpdateInput = Pick<
  Partial<Project>,
  'name' | 'budgetTotalCents' | 'currency' | 'visibility' | 'allowSuperadminAccess'
> & {
  id: ProjectId;
};

export type CompanyUpdateInput = Pick<Partial<Company>, 'name'> & {
  id: CompanyId;
};
export type ProfileUpdateInput = {
  name: string;
};

export type EmailChangeRequestInput = {
  newEmail: string;
};

export type EmailChangeRequestResult = {
  newEmail: string;
  expiresAt: string;
  delivery: 'email' | 'log';
};

export type PendingEmailChange = {
  newEmail: string;
  requestedAt: string;
  expiresAt: string;
};

export type EmailChangeConfirmResult = {
  email: string;
  previousEmail: string;
};

export type CompanyUserInviteResult = {
  user: User;
  createdAuthUser: boolean;
  membershipCreated: boolean;
  onboardingEmailSent: boolean;
  onboardingDelivery: 'email' | 'log' | 'none';
};

export type CreateCompanyUserInput = {
  name: string;
  email: string;
  role: CompanyRole;
  sendOnboardingEmail?: boolean;
};

export interface ProjexApi {
  // session
  getSession(): Promise<Session | null>;
  loginAs(userId: UserId): Promise<Session>;
  logout(): Promise<void>;

  // reference data
  listUsers(): Promise<User[]>;
  listCompanies(): Promise<Company[]>;
  listProjects(companyId: CompanyId): Promise<Project[]>;
  getCompany(companyId: CompanyId): Promise<Company | null>;
  getCompanySummary(companyId: CompanyId): Promise<CompanySummary>;
  getProject(projectId: ProjectId): Promise<Project | null>;

  // memberships / permissions
  listCompanyMemberships(companyId: CompanyId): Promise<CompanyMembership[]>;
  listProjectMemberships(projectId: ProjectId): Promise<ProjectMembership[]>;
  listMyProjectMemberships(companyId: CompanyId): Promise<ProjectMembership[]>;

  /**
   * Legacy membership mutation helpers used by the current UI.
   *
   * In Start/server mode these should be implemented as command-style server
   * functions that validate session and enforce authorization.
   */
  listAllCompanyMemberships(): Promise<CompanyMembership[]>;
  upsertCompanyMembership(companyId: CompanyId, userId: UserId, role: CompanyRole): Promise<CompanyMembership>;
  deleteCompanyMembership(companyId: CompanyId, userId: UserId): Promise<void>;
  upsertProjectMembership(projectId: ProjectId, userId: UserId, role: ProjectRole): Promise<ProjectMembership>;
  deleteProjectMembership(projectId: ProjectId, userId: UserId, role: ProjectRole): Promise<void>;

  /** Convenience wrappers (command-ish) */
  setCompanyRole(companyId: CompanyId, userId: UserId, role: CompanyRole): Promise<void>;
  setProjectRole(projectId: ProjectId, userId: UserId, role: ProjectRole): Promise<void>;
  removeCompanyMember(companyId: CompanyId, userId: UserId): Promise<void>;
  removeProjectMember(projectId: ProjectId, userId: UserId): Promise<void>;

  // taxonomy
  listCompanyDefaultCategories(companyId: CompanyId): Promise<CompanyDefaultCategory[]>;
  listCompanyDefaultSubCategories(companyId: CompanyId): Promise<CompanyDefaultSubCategory[]>;
  listCompanyDefaultMappingRules(companyId: CompanyId): Promise<CompanyDefaultMappingRule[]>;
  createCompanyDefaultCategory(
    companyId: CompanyId,
    input: CompanyDefaultCategoryCreateInput
  ): Promise<CompanyDefaultCategory>;
  updateCompanyDefaultCategory(
    companyId: CompanyId,
    input: CompanyDefaultCategoryUpdateInput
  ): Promise<CompanyDefaultCategory>;
  deleteCompanyDefaultCategory(
    companyId: CompanyId,
    categoryId: CompanyDefaultCategory['id']
  ): Promise<void>;
  createCompanyDefaultSubCategory(
    companyId: CompanyId,
    input: CompanyDefaultSubCategoryCreateInput
  ): Promise<CompanyDefaultSubCategory>;
  updateCompanyDefaultSubCategory(
    companyId: CompanyId,
    input: CompanyDefaultSubCategoryUpdateInput
  ): Promise<CompanyDefaultSubCategory>;
  deleteCompanyDefaultSubCategory(
    companyId: CompanyId,
    subCategoryId: CompanyDefaultSubCategory['id']
  ): Promise<void>;
  createCompanyDefaultMappingRule(
    companyId: CompanyId,
    input: CompanyDefaultMappingRuleCreateInput
  ): Promise<CompanyDefaultMappingRule>;
  updateCompanyDefaultMappingRule(
    companyId: CompanyId,
    input: CompanyDefaultMappingRuleUpdateInput
  ): Promise<CompanyDefaultMappingRule>;
  deleteCompanyDefaultMappingRule(
    companyId: CompanyId,
    ruleId: CompanyDefaultMappingRule['id']
  ): Promise<void>;
  applyCompanyDefaultTaxonomy(projectId: ProjectId): Promise<ApplyCompanyDefaultsResult>;
  listCategories(projectId: ProjectId): Promise<Category[]>;
  listSubCategories(projectId: ProjectId): Promise<SubCategory[]>;
  createCategory(projectId: ProjectId, input: CategoryCreateInput): Promise<Category>;
  updateCategory(projectId: ProjectId, input: CategoryUpdateInput): Promise<Category>;
  deleteCategory(projectId: ProjectId, categoryId: Category['id']): Promise<void>;
  createSubCategory(projectId: ProjectId, input: SubCategoryCreateInput): Promise<SubCategory>;
  updateSubCategory(projectId: ProjectId, input: SubCategoryUpdateInput): Promise<SubCategory>;
  deleteSubCategory(projectId: ProjectId, subCategoryId: SubCategory['id']): Promise<void>;

  // budgets
  listBudgets(projectId: ProjectId): Promise<BudgetLine[]>;
  createBudget(projectId: ProjectId, input: BudgetCreateInput): Promise<BudgetLine>;
  updateBudget(projectId: ProjectId, input: BudgetUpdateInput): Promise<BudgetLine>;
  deleteBudget(projectId: ProjectId, budgetId: BudgetLine['id']): Promise<void>;

  // transactions
  listTransactions(projectId: ProjectId): Promise<Txn[]>;
  createTxn(projectId: ProjectId, input: TxnCreateInput): Promise<Txn>;
  updateTxn(projectId: ProjectId, input: TxnUpdateInput): Promise<Txn>;
  deleteTxn(projectId: ProjectId, txnId: TxnId): Promise<void>;

  /**
   * Batch import.
   *
   * In server mode this should be one transactional command.
   */
  importTransactions(
    projectId: ProjectId,
    input: TxnImportInput
  ): Promise<{ count: number }>;
  previewImportTransactions(
    projectId: ProjectId,
    input: TxnImportPreviewInput
  ): Promise<TxnImportPreviewResult>;

  // admin
  resetToSeed(): Promise<void>;

  // helpers
  getDefaultCompanyIdForUser(userId: UserId): Promise<CompanyId | null>;
  updateCurrentUserProfile(input: ProfileUpdateInput): Promise<User>;
  getPendingEmailChange(): Promise<PendingEmailChange | null>;
  requestEmailChange(input: EmailChangeRequestInput): Promise<EmailChangeRequestResult>;
  resendEmailChange(): Promise<EmailChangeRequestResult>;
  cancelEmailChange(): Promise<void>;
  confirmEmailChange(token: string): Promise<EmailChangeConfirmResult>;
  createUserInCompany(companyId: CompanyId, input: CreateCompanyUserInput): Promise<CompanyUserInviteResult>;
  sendCompanyUserInviteEmail(companyId: CompanyId, userId: UserId): Promise<CompanyUserInviteResult>;

  // projects / companies
  createProject(companyId: CompanyId, input: ProjectCreateInput): Promise<Project>;
  updateProject(input: ProjectUpdateInput): Promise<Project>;
  createCompany(input: Pick<Company, 'name'> & { id?: CompanyId }): Promise<Company>;
  updateCompany(input: CompanyUpdateInput): Promise<Company>;

  // lifecycle management (superadmin; exec/admin for projects)
  deactivateCompany(companyId: CompanyId): Promise<void>;
  /** Reactivate a deactivated company (and associated projects/users). Superadmin only. */
  reactivateCompany(companyId: CompanyId): Promise<void>;
  deleteCompany(companyId: CompanyId): Promise<void>;
  deactivateProject(projectId: ProjectId): Promise<void>;
  /** Reactivate an archived project. Requires company edit access. */
  reactivateProject(projectId: ProjectId): Promise<void>;
  deleteProject(projectId: ProjectId): Promise<void>;
}

import type {
  BudgetLine,
  Category,
  Company,
  CompanyId,
  CompanyMembership,
  CompanyRole,
  Project,
  ProjectId,
  ProjectMembership,
  ProjectRole,
  SubCategory,
  Txn,
  TxnId,
  User,
  UserId,
} from '../types';

export type Session = {
  userId: UserId;
};

export type TxnCreateInput = Omit<Txn, 'id'> & { id?: TxnId };
export type TxnUpdateInput = Partial<Omit<Txn, 'id'>> & { id: TxnId };

export type BudgetCreateInput = Omit<BudgetLine, 'id'> & { id?: BudgetLine['id'] };
export type BudgetUpdateInput = Partial<Omit<BudgetLine, 'id'>> & { id: BudgetLine['id'] };

export type CategoryCreateInput = Omit<Category, 'id'> & { id?: Category['id'] };
export type CategoryUpdateInput = Partial<Omit<Category, 'id'>> & { id: Category['id'] };

export type SubCategoryCreateInput = Omit<SubCategory, 'id'> & { id?: SubCategory['id'] };
export type SubCategoryUpdateInput = Partial<Omit<SubCategory, 'id'>> & { id: SubCategory['id'] };

export type ProjectCreateInput = Pick<Project, 'name'> & { id?: ProjectId };
export type ProjectUpdateInput = Partial<Omit<Project, 'id'>> & { id: ProjectId };

export type CompanyUpdateInput = Partial<Omit<Company, 'id'>> & { id: CompanyId };

export type CsvImportMode = 'append' | 'replaceAll';

/**
 * API boundary used by UI + TanStack Query.
 *
 * Today: implemented by a localStorage-backed adapter.
 * Later: implemented by TanStack Start server functions.
 */
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
  getProject(projectId: ProjectId): Promise<Project | null>;

  // memberships / access
  /**
   * Returns memberships across all companies.
   *
   * Local mode uses this for "global" superadmin UX gating.
   * In a real backend, superadmin would typically be a session claim and
   * the server would enforce access regardless of what the client thinks.
   */
  listAllCompanyMemberships(): Promise<CompanyMembership[]>;
  listCompanyMemberships(companyId: CompanyId): Promise<CompanyMembership[]>;
  listProjectMemberships(projectId: ProjectId): Promise<ProjectMembership[]>;
  upsertCompanyMembership(
    companyId: CompanyId,
    userId: UserId,
    role: CompanyRole
  ): Promise<CompanyMembership>;
  upsertProjectMembership(
    projectId: ProjectId,
    userId: UserId,
    role: ProjectRole
  ): Promise<ProjectMembership>;
  deleteCompanyMembership(companyId: CompanyId, userId: UserId): Promise<void>;
  deleteProjectMembership(
    projectId: ProjectId,
    userId: UserId,
    role: ProjectRole
  ): Promise<void>;

  // transactions
  listTransactions(projectId: ProjectId): Promise<Txn[]>;
  createTransaction(projectId: ProjectId, input: TxnCreateInput): Promise<Txn>;
  updateTransaction(projectId: ProjectId, input: TxnUpdateInput): Promise<Txn>;
  deleteTransaction(projectId: ProjectId, txnId: TxnId): Promise<void>;

  // taxonomy
  listCategories(projectId: ProjectId): Promise<Category[]>;
  listSubCategories(projectId: ProjectId): Promise<SubCategory[]>;
  createCategory(projectId: ProjectId, input: CategoryCreateInput): Promise<Category>;
  updateCategory(projectId: ProjectId, input: CategoryUpdateInput): Promise<Category>;
  deleteCategory(projectId: ProjectId, categoryId: Category['id']): Promise<void>;

  createSubCategory(
    projectId: ProjectId,
    input: SubCategoryCreateInput
  ): Promise<SubCategory>;
  updateSubCategory(
    projectId: ProjectId,
    input: SubCategoryUpdateInput
  ): Promise<SubCategory>;
  deleteSubCategory(
    projectId: ProjectId,
    subCategoryId: SubCategory['id']
  ): Promise<void>;

  // budgets
  listBudgets(projectId: ProjectId): Promise<BudgetLine[]>;
  createBudget(projectId: ProjectId, input: BudgetCreateInput): Promise<BudgetLine>;
  updateBudget(projectId: ProjectId, input: BudgetUpdateInput): Promise<BudgetLine>;
  deleteBudget(projectId: ProjectId, budgetId: BudgetLine['id']): Promise<void>;

  // project/company admin
  createProject(companyId: CompanyId, input: ProjectCreateInput): Promise<Project>;
  updateProject(input: ProjectUpdateInput): Promise<Project>;
  updateCompany(input: CompanyUpdateInput): Promise<Company>;
  createUserInCompany(
    companyId: CompanyId,
    name: string,
    email: string,
    role: CompanyRole
  ): Promise<User>;

  // csv import
  importTransactions(
    projectId: ProjectId,
    txns: Txn[],
    mode: CsvImportMode
  ): Promise<{ imported: number }>;

  // local tooling (safe to no-op on server)
  resetToSeed(): Promise<void>;

  // “active” context helpers
  getDefaultCompanyIdForUser(userId: UserId): Promise<CompanyId | null>;
}

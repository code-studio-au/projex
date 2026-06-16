import type {
  BudgetLine,
  Category,
  Company,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyId,
  CompanyRole,
  ImportCandidate,
  ImportRule,
  ImportCandidateId,
  Project,
  ProjectAutoCodingRule,
  ProjectId,
  RuleSuggestion,
  RuleSuggestionReviewItem,
  SubCategory,
  Txn,
  TxnCommentId,
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

export type TxnImportMode = 'append' | 'replaceAll';
export type TxnListView =
  | 'all'
  | 'uncoded'
  | 'auto-mapped-pending'
  | 'assigned-to-me';
export type TxnListSortField = 'date' | 'transaction' | 'amountCents';
export type TxnListSortDirection = 'asc' | 'desc';
export type TxnListSort = {
  field: TxnListSortField;
  direction: TxnListSortDirection;
};
export type TxnListDrilldown =
  | {
      kind: 'category';
      categoryId: Txn['categoryId'];
    }
  | {
      kind: 'subcategory';
      categoryId: Txn['categoryId'];
      subCategoryId: Txn['subCategoryId'];
    };
export type TxnListPageInput = {
  pageIndex: number;
  pageSize: number;
  sort?: TxnListSort;
  yearFilter?: string | null;
  quarterFilter?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null;
  monthFilterKey?: string | null;
  transactionView?: TxnListView;
  drilldown?: TxnListDrilldown | null;
};
export type TxnListPageSummary = {
  totalCount: number;
  budgetImpactCents: number;
  uncodedCount: number;
  uncodedCents: number;
  sourceOnlyCount: number;
  assignedToMeCount: number;
  reviewedCount: number;
  lockedCount: number;
  invalidDateCount: number;
};
export type TxnListPageResult = {
  rows: Txn[];
  summary: TxnListPageSummary;
};
export type TxnImportTxnInput = Omit<
  Txn,
  | 'internalId'
  | 'createdAt'
  | 'updatedAt'
  | 'txnType'
  | 'parentTxnId'
  | 'sourceTxnId'
  | 'transferProjectId'
  | 'budgetImpact'
  | 'categorisable'
>;
export type TxnImportInput = {
  txns: TxnImportTxnInput[];
  mode: TxnImportMode;
  autoCreateBudgets?: boolean;
};
export type TxnImportPreviewInput = {
  csvText: string;
  sourceType?: 'powerbi_expenditure_actuals';
  fileName?: string;
  autoCreateStructures?: boolean;
};
export type TxnImportPreviewResult = {
  importBatchId?: Txn['importBatchId'];
  rows: ImportPreviewRow[];
};
export type ImportCandidateReviewInput = {
  candidateId: ImportCandidateId;
  decision: 'import' | 'reject';
};
export type ImportCandidateReviewResult = {
  candidate: ImportCandidate;
  txn?: Txn;
};

export type TxnSplitChildInput = {
  id?: TxnId;
  item?: string;
  description?: string;
  amountCents: number;
  categoryId?: Txn['categoryId'] | null;
  subCategoryId?: Txn['subCategoryId'] | null;
};

export type TxnSplitInput = {
  txnId: TxnId;
  children: TxnSplitChildInput[];
};

export type TxnSplitResult = {
  parent: Txn;
  children: Txn[];
};

export type TxnTransferInput = {
  txnId: TxnId;
  destinationProjectId: ProjectId;
  destinationTxnId?: TxnId;
  item?: string;
  description?: string;
};

export type TxnTransferResult = {
  source: Txn;
  destination: Txn;
};

export type TxnWorkflowStateInput = {
  txnId: TxnId;
  reviewed?: boolean;
  locked?: boolean;
};

export type TxnCommentCreateInput = {
  txnId: TxnId;
  body: string;
  parentCommentId?: TxnCommentId;
  assignedToUserId?: UserId | null;
};

export type TxnCommentUpdateInput = {
  id: TxnCommentId;
  body?: string;
  assignedToUserId?: UserId | null;
  resolved?: boolean;
};

// Inputs (command-style)
export type TxnCreateInput = Omit<
  Txn,
  | 'id'
  | 'internalId'
  | 'createdAt'
  | 'updatedAt'
  | 'txnType'
  | 'parentTxnId'
  | 'sourceTxnId'
  | 'transferProjectId'
  | 'budgetImpact'
  | 'categorisable'
> & { id?: TxnId };
export type TxnUpdateInput = Partial<
  Omit<
    Txn,
    | 'id'
    | 'internalId'
    | 'createdAt'
    | 'updatedAt'
    | 'txnType'
    | 'parentTxnId'
    | 'sourceTxnId'
    | 'transferProjectId'
    | 'budgetImpact'
    | 'categorisable'
    | 'externalId'
    | 'categoryId'
    | 'subCategoryId'
    | 'companyDefaultMappingRuleId'
  >
> & {
  id: TxnId;
  externalId?: string | null;
  categoryId?: Txn['categoryId'] | null;
  subCategoryId?: Txn['subCategoryId'] | null;
  companyDefaultMappingRuleId?: Txn['companyDefaultMappingRuleId'] | null;
};

export type TxnUpdateResult = {
  txn: Txn;
  projectRulePrompt: ProjectRuleSuggestionPrompt | null;
};

export type BudgetCreateInput = Omit<
  BudgetLine,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: BudgetLine['id'];
};
export type BudgetUpdateInput = Partial<
  Omit<BudgetLine, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: BudgetLine['id'];
};

export type CategoryCreateInput = Omit<
  Category,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: Category['id'] };
export type CategoryUpdateInput = Partial<
  Omit<Category, 'id' | 'createdAt' | 'updatedAt'>
> & {
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

export type SubCategoryCreateInput = Omit<
  SubCategory,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: SubCategory['id'];
};
export type SubCategoryUpdateInput = Partial<
  Omit<SubCategory, 'id' | 'createdAt' | 'updatedAt'>
> & {
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
  Omit<
    CompanyDefaultMappingRule,
    'id' | 'companyId' | 'createdAt' | 'updatedAt'
  >
> & {
  id: CompanyDefaultMappingRule['id'];
};

export type RuleSuggestionAcceptInput = {
  id: RuleSuggestion['id'];
  proposedMatchText: string;
  companyDefaultCategoryId: CompanyDefaultMappingRule['companyDefaultCategoryId'];
  companyDefaultSubCategoryId: CompanyDefaultMappingRule['companyDefaultSubCategoryId'];
};

export type RuleSuggestionDismissInput = {
  id: RuleSuggestion['id'];
};

export type RuleSuggestionsListResult = RuleSuggestionReviewItem[];

export type ProjectRuleSuggestionPrompt = {
  txnId: Txn['id'];
  suggestedMatchText: string;
  categoryId: ProjectAutoCodingRule['categoryId'];
  subCategoryId: ProjectAutoCodingRule['subCategoryId'];
  supportingCount: number;
};

export type CreateProjectAutoCodingRuleInput = Omit<
  ProjectAutoCodingRule,
  | 'id'
  | 'companyId'
  | 'projectId'
  | 'sortOrder'
  | 'createdByUserId'
  | 'createdAt'
  | 'updatedAt'
>;

export type CreateProjectAutoCodingRuleResult = {
  rule: ProjectAutoCodingRule;
  matchedTxnCount: number;
};

export type ProjectAutoCodingRuleUpdateInput = Partial<
  Omit<
    ProjectAutoCodingRule,
    | 'id'
    | 'companyId'
    | 'projectId'
    | 'createdByUserId'
    | 'createdAt'
    | 'updatedAt'
  >
> & {
  id: ProjectAutoCodingRule['id'];
};

export type ImportRuleCreateInput = Omit<
  ImportRule,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: ImportRule['id'];
};
export type ImportRuleUpdateInput = Partial<
  Omit<
    ImportRule,
    'id' | 'companyId' | 'projectId' | 'scope' | 'createdAt' | 'updatedAt'
  >
> & {
  id: ImportRule['id'];
};

export type ApplyCompanyDefaultsResult = {
  companyDefaultsConfigured: boolean;
  categoriesAdded: number;
  subCategoriesAdded: number;
};

export type CompanyCreateInput = Pick<Company, 'name'> & {
  id?: CompanyId;
  initialAdminName?: string;
  initialAdminEmail?: string;
};

export type CompanyCreateResult = {
  company: Company;
  initialAdmin?: CompanyUserInviteResult;
};

export type ProjectCreateInput = Pick<Project, 'name'> & {
  id?: ProjectId;
  projectType?: Project['projectType'];
  parentProjectId?: ProjectId | null;
  currency?: Project['currency'];
  initialOwnerUserId?: UserId;
  applyCompanyDefaultTaxonomy?: boolean;
};
export type ProjectUpdateInput = Pick<
  Partial<Project>,
  | 'name'
  | 'projectType'
  | 'budgetTotalCents'
  | 'currency'
  | 'visibility'
  | 'allowSuperadminAccess'
  | 'syncCompanyDefaults'
  | 'allowTxnTransfers'
> & {
  id: ProjectId;
  parentProjectId?: ProjectId | null;
};

export type BulkRecodeProjectTransactionsInput = {
  fromSubCategoryId: SubCategory['id'];
  toCategoryId: Category['id'];
  toSubCategoryId: SubCategory['id'];
};

export type BulkRecodeProjectTransactionsResult = {
  updatedCount: number;
};

export type BackfillProjectCodingInput = {
  mode: 'project_rules' | 'company_rules' | 'all';
};

export type BackfillProjectCodingResult = {
  projectRuleMatches: number;
  companyRuleMatches: number;
  updatedCount: number;
};

export type PromoteProjectSubCategoryToCompanyDefaultInput = {
  subCategoryId: SubCategory['id'];
};

export type PromoteProjectSubCategoryToCompanyDefaultResult = {
  companyDefaultCategoryId: CompanyDefaultCategory['id'];
  companyDefaultSubCategoryId: CompanyDefaultSubCategory['id'];
  categoryCreated: boolean;
  subCategoryCreated: boolean;
};

export type PromoteProjectRuleToCompanyDefaultInput = {
  ruleId: ProjectAutoCodingRule['id'];
};

export type PromoteProjectRuleToCompanyDefaultResult = {
  companyDefaultCategoryId: CompanyDefaultCategory['id'];
  companyDefaultSubCategoryId: CompanyDefaultSubCategory['id'];
  companyDefaultRuleId: CompanyDefaultMappingRule['id'];
  categoryCreated: boolean;
  subCategoryCreated: boolean;
  ruleCreated: boolean;
};

export type CompanyUpdateInput = Pick<Partial<Company>, 'name'> & {
  id: CompanyId;
};
export type DeleteCompanyInput = {
  companyId: CompanyId;
  confirmation: string;
};
export type DeleteProjectInput = {
  projectId: ProjectId;
  confirmation: string;
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

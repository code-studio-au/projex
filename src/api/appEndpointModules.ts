import type { AppEndpoint } from './appEndpoints';
import type {
  ApplyCompanyStandardsResult,
  BackfillProjectCodingInput,
  BackfillProjectCodingResult,
  BudgetCreateInput,
  BudgetUpdateInput,
  BulkRecodeProjectTransactionsInput,
  BulkRecodeProjectTransactionsResult,
  CategoryCreateInput,
  CategoryUpdateInput,
  CompanyUserInviteResult,
  CompanyCreateInput,
  CompanyCreateResult,
  CompanyDefaultCategoryCreateInput,
  CompanyDefaultCategoryUpdateInput,
  CompanyDefaultMappingRuleCreateInput,
  CompanyDefaultMappingRuleUpdateInput,
  CompanyDefaultSubCategoryCreateInput,
  CompanyDefaultSubCategoryUpdateInput,
  CompanyUpdateInput,
  CreateCompanyUserInput,
  CreateProjectAutoCodingRuleInput,
  CreateProjectAutoCodingRuleResult,
  DeleteCompanyInput,
  DeleteProjectInput,
  EmailChangeRequestInput,
  EmailChangeRequestResult,
  ImportCandidateReviewInput,
  ImportCandidateReviewResult,
  ImportRuleCreateInput,
  ImportRuleUpdateInput,
  PendingEmailChange,
  ProfileUpdateInput,
  ProjectAutoCodingRuleUpdateInput,
  ProjectCreateInput,
  ProjectUpdateInput,
  ProjectRuleSuggestionPrompt,
  PromoteProjectRuleToCompanyDefaultInput,
  PromoteProjectRuleToCompanyDefaultResult,
  PromoteProjectSubCategoryToCompanyDefaultInput,
  PromoteProjectSubCategoryToCompanyDefaultResult,
  RuleSuggestionAcceptInput,
  RuleSuggestionDismissInput,
  RuleSuggestionsListResult,
  Session,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
  TxnBulkActionInput,
  TxnBulkActionResult,
  TxnCommentCreateInput,
  TxnCommentUpdateInput,
  TxnCreateInput,
  TxnImportPreviewInput,
  TxnImportPreviewResult,
  TxnImportInput,
  TxnSplitInput,
  TxnSplitResult,
  TxnTransferInput,
  TxnTransferResult,
  TxnUpdateInput,
  TxnUpdateResult,
  TxnWorkflowStateInput,
} from './types';
import type {
  BudgetLine,
  Category,
  Company,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyId,
  CompanyMembership,
  ProjectId,
  CompanySummary,
  ImportCandidate,
  ImportRule,
  ProjectAutoCodingRule,
  ProjectMembership,
  SubCategory,
  Txn,
  TxnComment,
  TxnCommentId,
  TxnCommentSummary,
  TxnId,
  Project,
  User,
  UserId,
} from '../types';

type NoInput = void | undefined;

const appEndpointModuleLoaders = import.meta.glob('../server/app/*.ts');

export type PostLoginTarget =
  | { to: '/companies' }
  | {
      to: '/c/$companyId';
      params: { companyId: CompanyId };
    };

export type AuthEndpointsModule = {
  getSessionEndpoint: AppEndpoint<NoInput, Session | null>;
  getPostLoginTargetEndpoint: AppEndpoint<NoInput, PostLoginTarget>;
};

export type AccountEndpointsModule = {
  getPendingEmailChangeEndpoint: AppEndpoint<
    NoInput,
    PendingEmailChange | null
  >;
  getCurrentUserEndpoint: AppEndpoint<NoInput, User>;
  requestEmailChangeEndpoint: AppEndpoint<
    EmailChangeRequestInput,
    EmailChangeRequestResult
  >;
  resendEmailChangeEndpoint: AppEndpoint<NoInput, EmailChangeRequestResult>;
  cancelEmailChangeEndpoint: AppEndpoint<NoInput, void>;
};

export type CompanyEndpointsModule = {
  listUsersEndpoint: AppEndpoint<NoInput, User[]>;
  listCompaniesEndpoint: AppEndpoint<NoInput, Company[]>;
  getDefaultCompanyIdForUserEndpoint: AppEndpoint<NoInput, CompanyId | null>;
  createCompanyEndpoint: AppEndpoint<CompanyCreateInput, CompanyCreateResult>;
  getCompanyEndpoint: AppEndpoint<{ companyId: CompanyId }, Company | null>;
  getCompanySummaryEndpoint: AppEndpoint<
    { companyId: CompanyId },
    CompanySummary
  >;
  updateCompanyEndpoint: AppEndpoint<CompanyUpdateInput, Company>;
  deleteCompanyEndpoint: AppEndpoint<DeleteCompanyInput, void>;
  deactivateCompanyEndpoint: AppEndpoint<{ companyId: CompanyId }, void>;
  reactivateCompanyEndpoint: AppEndpoint<{ companyId: CompanyId }, void>;
  listProjectsEndpoint: AppEndpoint<{ companyId: CompanyId }, Project[]>;
  createProjectEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: ProjectCreateInput },
    Project
  >;
  getProjectEndpoint: AppEndpoint<{ projectId: ProjectId }, Project | null>;
  updateProjectEndpoint: AppEndpoint<ProjectUpdateInput, Project>;
  deleteProjectEndpoint: AppEndpoint<DeleteProjectInput, void>;
  deactivateProjectEndpoint: AppEndpoint<{ projectId: ProjectId }, void>;
  reactivateProjectEndpoint: AppEndpoint<{ projectId: ProjectId }, void>;
  createUserInCompanyEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: CreateCompanyUserInput },
    CompanyUserInviteResult
  >;
  sendCompanyUserInviteEmailEndpoint: AppEndpoint<
    { companyId: CompanyId; userId: UserId },
    CompanyUserInviteResult
  >;
  updateCurrentUserProfileEndpoint: AppEndpoint<ProfileUpdateInput, User>;
};

export type TransactionEndpointsModule = {
  listTransactionsEndpoint: AppEndpoint<{ projectId: ProjectId }, Txn[]>;
  listTransactionCommentsEndpoint: AppEndpoint<
    { projectId: ProjectId; txnId: TxnId },
    TxnComment[]
  >;
  listTransactionCommentSummariesEndpoint: AppEndpoint<
    { projectId: ProjectId },
    TxnCommentSummary[]
  >;
  createTransactionCommentEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: TxnCommentCreateInput },
    TxnComment
  >;
  updateTransactionCommentEndpoint: AppEndpoint<
    { projectId: ProjectId; txnId: TxnId; payload: TxnCommentUpdateInput },
    TxnComment
  >;
  deleteTransactionCommentEndpoint: AppEndpoint<
    { projectId: ProjectId; txnId: TxnId; commentId: TxnCommentId },
    void
  >;
  createTxnEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: TxnCreateInput },
    Txn
  >;
  updateTxnEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: TxnUpdateInput },
    TxnUpdateResult
  >;
  deleteTxnEndpoint: AppEndpoint<{ projectId: ProjectId; txnId: TxnId }, void>;
  splitTxnEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: TxnSplitInput },
    TxnSplitResult
  >;
  transferTxnEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: TxnTransferInput },
    TxnTransferResult
  >;
  updateTxnWorkflowStateEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: TxnWorkflowStateInput },
    Txn
  >;
  bulkTxnActionEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: TxnBulkActionInput },
    TxnBulkActionResult
  >;
  importTransactionsEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: TxnImportInput },
    { count: number }
  >;
};

export type MembershipEndpointsModule = {
  listCompanyMembershipsEndpoint: AppEndpoint<
    { companyId: CompanyId },
    CompanyMembership[]
  >;
  listAllCompanyMembershipsEndpoint: AppEndpoint<NoInput, CompanyMembership[]>;
  listProjectMembershipsEndpoint: AppEndpoint<
    { projectId: ProjectId },
    ProjectMembership[]
  >;
  listMyProjectMembershipsEndpoint: AppEndpoint<
    { companyId: CompanyId },
    ProjectMembership[]
  >;
  upsertCompanyMembershipEndpoint: AppEndpoint<
    { companyId: CompanyId; userId: UserId; role: CompanyMembership['role'] },
    CompanyMembership
  >;
  deleteCompanyMembershipEndpoint: AppEndpoint<
    { companyId: CompanyId; userId: UserId },
    void
  >;
  upsertProjectMembershipEndpoint: AppEndpoint<
    { projectId: ProjectId; userId: UserId; role: ProjectMembership['role'] },
    ProjectMembership
  >;
  deleteProjectMembershipEndpoint: AppEndpoint<
    { projectId: ProjectId; userId: UserId; role: ProjectMembership['role'] },
    void
  >;
};

export type ImportEndpointsModule = {
  listImportCandidatesEndpoint: AppEndpoint<
    { projectId: ProjectId },
    ImportCandidate[]
  >;
  listImportRulesEndpoint: AppEndpoint<{ companyId: CompanyId }, ImportRule[]>;
  reviewImportCandidateEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: ImportCandidateReviewInput },
    ImportCandidateReviewResult
  >;
  createImportRuleEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: ImportRuleCreateInput },
    ImportRule
  >;
  listProjectImportRulesEndpoint: AppEndpoint<
    { projectId: ProjectId },
    ImportRule[]
  >;
  createProjectImportRuleEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: ImportRuleCreateInput },
    ImportRule
  >;
  updateImportRuleEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: ImportRuleUpdateInput },
    ImportRule
  >;
  deleteImportRuleEndpoint: AppEndpoint<
    { companyId: CompanyId; ruleId: ImportRule['id'] },
    void
  >;
  updateProjectImportRuleEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: ImportRuleUpdateInput },
    ImportRule
  >;
  deleteProjectImportRuleEndpoint: AppEndpoint<
    { projectId: ProjectId; ruleId: ImportRule['id'] },
    void
  >;
  promoteProjectImportRuleEndpoint: AppEndpoint<
    { projectId: ProjectId; ruleId: ImportRule['id'] },
    ImportRule
  >;
  previewImportTransactionsEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: TxnImportPreviewInput },
    TxnImportPreviewResult
  >;
  cancelImportPreviewEndpoint: AppEndpoint<
    { projectId: ProjectId; importBatchId: Txn['importBatchId'] },
    void
  >;
};

export type ProjectAutoCodingEndpointsModule = {
  getProjectRuleSuggestionPromptEndpoint: AppEndpoint<
    { projectId: ProjectId; txnId: TxnId },
    ProjectRuleSuggestionPrompt | null
  >;
  listProjectAutoCodingRulesEndpoint: AppEndpoint<
    { projectId: ProjectId },
    ProjectAutoCodingRule[]
  >;
  createProjectAutoCodingRuleEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: CreateProjectAutoCodingRuleInput },
    CreateProjectAutoCodingRuleResult
  >;
  updateProjectAutoCodingRuleEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: ProjectAutoCodingRuleUpdateInput },
    ProjectAutoCodingRule
  >;
  deleteProjectAutoCodingRuleEndpoint: AppEndpoint<
    { projectId: ProjectId; ruleId: ProjectAutoCodingRule['id'] },
    void
  >;
  backfillProjectCodingEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: BackfillProjectCodingInput },
    BackfillProjectCodingResult
  >;
  promoteProjectRuleToCompanyDefaultEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: PromoteProjectRuleToCompanyDefaultInput },
    PromoteProjectRuleToCompanyDefaultResult
  >;
};

export type RuleSuggestionEndpointsModule = {
  listRuleSuggestionsEndpoint: AppEndpoint<
    { companyId: CompanyId },
    RuleSuggestionsListResult
  >;
  acceptRuleSuggestionEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: RuleSuggestionAcceptInput },
    { ruleId: CompanyDefaultMappingRule['id'] }
  >;
  dismissRuleSuggestionEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: RuleSuggestionDismissInput },
    void
  >;
};

export type TaxonomyEndpointsModule = {
  listCategoriesEndpoint: AppEndpoint<{ projectId: ProjectId }, Category[]>;
  getCompanyDefaultsEndpoint: AppEndpoint<
    { companyId: CompanyId },
    {
      categories: CompanyDefaultCategory[];
      subCategories: CompanyDefaultSubCategory[];
      mappingRules: CompanyDefaultMappingRule[];
    }
  >;
  listCompanyDefaultCategoriesEndpoint: AppEndpoint<
    { companyId: CompanyId },
    CompanyDefaultCategory[]
  >;
  listCompanyDefaultSubCategoriesEndpoint: AppEndpoint<
    { companyId: CompanyId },
    CompanyDefaultSubCategory[]
  >;
  listCompanyDefaultMappingRulesEndpoint: AppEndpoint<
    { companyId: CompanyId },
    CompanyDefaultMappingRule[]
  >;
  listSubCategoriesEndpoint: AppEndpoint<
    { projectId: ProjectId },
    SubCategory[]
  >;
  createCategoryEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: CategoryCreateInput },
    Category
  >;
  updateCategoryEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: CategoryUpdateInput },
    Category
  >;
  deleteCategoryEndpoint: AppEndpoint<
    { projectId: ProjectId; categoryId: Category['id'] },
    void
  >;
  createSubCategoryEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: SubCategoryCreateInput },
    SubCategory
  >;
  updateSubCategoryEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: SubCategoryUpdateInput },
    SubCategory
  >;
  deleteSubCategoryEndpoint: AppEndpoint<
    { projectId: ProjectId; subCategoryId: SubCategory['id'] },
    void
  >;
  createCompanyDefaultCategoryEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: CompanyDefaultCategoryCreateInput },
    CompanyDefaultCategory
  >;
  updateCompanyDefaultCategoryEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: CompanyDefaultCategoryUpdateInput },
    CompanyDefaultCategory
  >;
  deleteCompanyDefaultCategoryEndpoint: AppEndpoint<
    { companyId: CompanyId; categoryId: CompanyDefaultCategory['id'] },
    void
  >;
  createCompanyDefaultSubCategoryEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: CompanyDefaultSubCategoryCreateInput },
    CompanyDefaultSubCategory
  >;
  updateCompanyDefaultSubCategoryEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: CompanyDefaultSubCategoryUpdateInput },
    CompanyDefaultSubCategory
  >;
  deleteCompanyDefaultSubCategoryEndpoint: AppEndpoint<
    { companyId: CompanyId; subCategoryId: CompanyDefaultSubCategory['id'] },
    void
  >;
  createCompanyDefaultMappingRuleEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: CompanyDefaultMappingRuleCreateInput },
    CompanyDefaultMappingRule
  >;
  updateCompanyDefaultMappingRuleEndpoint: AppEndpoint<
    { companyId: CompanyId; payload: CompanyDefaultMappingRuleUpdateInput },
    CompanyDefaultMappingRule
  >;
  deleteCompanyDefaultMappingRuleEndpoint: AppEndpoint<
    { companyId: CompanyId; ruleId: CompanyDefaultMappingRule['id'] },
    void
  >;
  applyCompanyStandardsEndpoint: AppEndpoint<
    { projectId: ProjectId },
    ApplyCompanyStandardsResult
  >;
  bulkRecodeProjectTransactionsEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: BulkRecodeProjectTransactionsInput },
    BulkRecodeProjectTransactionsResult
  >;
  promoteProjectSubCategoryToCompanyDefaultEndpoint: AppEndpoint<
    {
      projectId: ProjectId;
      payload: PromoteProjectSubCategoryToCompanyDefaultInput;
    },
    PromoteProjectSubCategoryToCompanyDefaultResult
  >;
};

export type BudgetEndpointsModule = {
  listBudgetsEndpoint: AppEndpoint<{ projectId: ProjectId }, BudgetLine[]>;
  createBudgetEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: BudgetCreateInput },
    BudgetLine
  >;
  updateBudgetEndpoint: AppEndpoint<
    { projectId: ProjectId; payload: BudgetUpdateInput },
    BudgetLine
  >;
  deleteBudgetEndpoint: AppEndpoint<
    { projectId: ProjectId; budgetId: BudgetLine['id'] },
    void
  >;
};

export function appEndpointModuleSpecifier(fileStem: string): string {
  return ['..', '..', 'app', fileStem].join('/');
}

export function loadAppEndpointModule<TModule>(
  fileStem: string
): Promise<TModule> {
  const loader = appEndpointModuleLoaders[`../server/app/${fileStem}.ts`];
  if (!loader) {
    throw new Error(`Missing app endpoint module "${fileStem}"`);
  }
  return loader() as Promise<TModule>;
}

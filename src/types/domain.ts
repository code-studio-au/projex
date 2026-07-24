import type {
  BudgetLineId,
  CategoryId,
  CompanyId,
  CompanyDefaultCategoryId,
  CompanyDefaultMappingRuleId,
  CompanyDefaultSubCategoryId,
  ImportBatchId,
  ImportRuleId,
  CompanyExportJobId,
  ProjectId,
  ProjectAutoCodingRuleId,
  RuleSuggestionId,
  SubCategoryId,
  TxnCommentId,
  TxnId,
  TxnUnlockRequestId,
  UserId,
} from './ids.ts';
import type { CompanyRole, ProjectRole } from './roles.ts';

export type CompanyStatus = 'active' | 'deactivated';
export type ProjectStandardOriginScope = 'company' | 'project';
export type ProjectStandardSyncStatus =
  | 'local'
  | 'inherited'
  | 'overridden'
  | 'detached';

export type Company = {
  id: CompanyId;
  name: string;
  status: CompanyStatus;
  /** Audit timestamps as ISO strings (UTC). */
  deactivatedAt?: string;
};

export type ProjectVisibility = 'company' | 'private';
export type ProjectType = 'project' | 'programme';

export type Project = {
  id: ProjectId;
  companyId: CompanyId;
  name: string;
  /** Programmes are reporting-only containers. Projects are operational. */
  projectType: ProjectType;
  /** Optional reporting programme that this operational project rolls up into. */
  parentProjectId?: ProjectId;
  budgetTotalCents: number;
  currency: 'AUD' | 'USD' | 'EUR' | 'GBP';
  status: 'active' | 'archived';
  /** Audit timestamp as ISO string (UTC). */
  deactivatedAt?: string;
  /** Visibility within the company. */
  visibility: ProjectVisibility;
  /** Whether global superadmin support access is permitted for this project. */
  allowSuperadminAccess: boolean;
  /** Whether missing company defaults should be kept in sync into this project. */
  syncCompanyDefaults: boolean;
  /** Whether transactions can be transferred out of this project. */
  allowTxnTransfers: boolean;
};

export type TransactionDrilldownFilter =
  | {
      kind: 'category';
      categoryId: CategoryId;
      categoryName: string;
    }
  | {
      kind: 'subcategory';
      categoryId: CategoryId;
      categoryName: string;
      subCategoryId: SubCategoryId;
      subCategoryName: string;
    };

export type User = {
  id: UserId;
  email: string;
  name: string;
  disabled?: boolean;
  isGlobalSuperadmin?: boolean;
};

export type CompanyMembership = {
  companyId: CompanyId;
  userId: UserId;
  role: CompanyRole;
};

export type ProjectMembership = {
  projectId: ProjectId;
  userId: UserId;
  role: ProjectRole;
};

export type Category = {
  id: CategoryId;
  companyId: CompanyId;
  projectId: ProjectId;
  name: string;
  originScope?: ProjectStandardOriginScope;
  originCompanyItemId?: string;
  syncStatus?: ProjectStandardSyncStatus;
  lastSyncedAt?: string;
  sourceUpdatedAtSnapshot?: string;
  createdAt?: string;
  updatedAt?: string;
};
export type SubCategory = {
  id: SubCategoryId;
  companyId: CompanyId;
  projectId: ProjectId;
  categoryId: CategoryId;
  name: string;
  originScope?: ProjectStandardOriginScope;
  originCompanyItemId?: string;
  syncStatus?: ProjectStandardSyncStatus;
  lastSyncedAt?: string;
  sourceUpdatedAtSnapshot?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CompanyDefaultCategory = {
  id: CompanyDefaultCategoryId;
  companyId: CompanyId;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CompanyDefaultSubCategory = {
  id: CompanyDefaultSubCategoryId;
  companyId: CompanyId;
  companyDefaultCategoryId: CompanyDefaultCategoryId;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CompanyDefaultMappingRule = {
  id: CompanyDefaultMappingRuleId;
  companyId: CompanyId;
  matchText: string;
  companyDefaultCategoryId: CompanyDefaultCategoryId;
  companyDefaultSubCategoryId: CompanyDefaultSubCategoryId;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectAutoCodingRule = {
  id: ProjectAutoCodingRuleId;
  companyId: CompanyId;
  projectId: ProjectId;
  matchText: string;
  categoryId: CategoryId;
  subCategoryId: SubCategoryId;
  originScope?: ProjectStandardOriginScope;
  originCompanyItemId?: string;
  syncStatus?: ProjectStandardSyncStatus;
  lastSyncedAt?: string;
  sourceUpdatedAtSnapshot?: string;
  sortOrder: number;
  createdByUserId?: UserId;
  createdAt?: string;
  updatedAt?: string;
};

export type ImportRuleAction = 'import' | 'exclude' | 'review';
type ImportRuleScope = 'company' | 'project';
export type ImportRuleField =
  | 'ledger'
  | 'source'
  | 'journalId'
  | 'journalLineDescription'
  | 'ccAndDescription'
  | 'vendorName'
  | 'poId'
  | 'referenceNum'
  | 'anyText';
export type ImportRuleOperator =
  | 'equals'
  | 'equals_any'
  | 'contains'
  | 'contains_any'
  | 'starts_with'
  | 'starts_with_any'
  | 'ends_with'
  | 'ends_with_any';

export type ImportRule = {
  id: ImportRuleId;
  companyId: CompanyId;
  scope: ImportRuleScope;
  projectId?: ProjectId;
  name: string;
  originScope?: ProjectStandardOriginScope;
  originCompanyItemId?: string;
  syncStatus?: ProjectStandardSyncStatus;
  lastSyncedAt?: string;
  sourceUpdatedAtSnapshot?: string;
  action: ImportRuleAction;
  field: ImportRuleField;
  operator: ImportRuleOperator;
  value: string;
  sortOrder: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ImportCandidateStatus =
  | 'ready'
  | 'excluded'
  | 'needs_project_review'
  | 'imported'
  | 'invalid'
  | 'duplicate';

export type RuleSuggestionType = 'create_rule' | 'update_rule';
type RuleSuggestionStatus = 'open' | 'accepted' | 'dismissed';
export type RuleSuggestionAcceptanceAction =
  | 'create_rule'
  | 'update_existing'
  | 'create_narrower';
export type RuleSuggestionDismissReason =
  | 'noise'
  | 'one_off'
  | 'too_broad'
  | 'intentional_manual'
  | 'other';
type RuleSuggestionConfidence = 'low' | 'medium' | 'high';
export type RuleSuggestion = {
  id: RuleSuggestionId;
  companyId: CompanyId;
  status: RuleSuggestionStatus;
  suggestionType: RuleSuggestionType;
  sourceRuleId?: CompanyDefaultMappingRuleId;
  patternBasis: 'item' | 'description' | 'item_description';
  patternTextNormalized: string;
  proposedMatchText: string;
  matchTextAlternatives: string[];
  companyDefaultCategoryId: CompanyDefaultCategoryId;
  companyDefaultSubCategoryId: CompanyDefaultSubCategoryId;
  sampleCount: number;
  distinctTxnDateCount: number;
  distinctProjectCount: number;
  confidenceScore: number;
  confidence: RuleSuggestionConfidence;
  confidenceReasons: string[];
  recommendedAction: RuleSuggestionAcceptanceAction;
  firstSeenAt: string;
  lastSeenAt: string;
  acceptedRuleId?: CompanyDefaultMappingRuleId;
  acceptedAction?: RuleSuggestionAcceptanceAction;
  acceptedAt?: string;
  acceptedByUserId?: UserId;
  dismissedReason?: RuleSuggestionDismissReason;
  dismissedAt?: string;
  dismissedByUserId?: UserId;
  createdAt: string;
  updatedAt: string;
};

type RuleSuggestionEvidence = {
  txnId: TxnId;
  projectId: ProjectId;
  item: string;
  description: string;
  amountCents: number;
  projectName: string;
  currency: Project['currency'];
  txnDate: string;
  createdAt: string;
};

export type RuleSuggestionReviewItem = RuleSuggestion & {
  evidence: RuleSuggestionEvidence[];
  sourceRule?: CompanyDefaultMappingRule;
};

export type CompanyExportScope = 'all' | 'active';
export type CompanyExportDetail = 'full' | 'summary';
export type CompanyExportJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'expired';
export type CompanyExportReadyNotificationStatus =
  | 'not_requested'
  | 'pending'
  | 'sent'
  | 'failed';
export type CompanyExportReadyNotificationDelivery = 'email' | 'log';

export type CompanyExportOptions = {
  scope: CompanyExportScope;
  detail: CompanyExportDetail;
  fromDate?: string;
  toDate?: string;
  notifyWhenReady?: boolean;
};

export type CompanyExportJob = {
  id: CompanyExportJobId;
  companyId: CompanyId;
  createdByUserId: UserId;
  scope: CompanyExportScope;
  detail: CompanyExportDetail;
  status: CompanyExportJobStatus;
  fileName?: string;
  fileSizeBytes?: number;
  downloadPath?: string;
  errorMessage?: string;
  fromDate?: string;
  toDate?: string;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  expiresAt?: string;
  notifyWhenReady: boolean;
  readyNotificationStatus: CompanyExportReadyNotificationStatus;
  readyNotificationDelivery?: CompanyExportReadyNotificationDelivery;
  readyNotificationSentAt?: string;
  readyNotificationError?: string;
};

export const TXN_TYPES = [
  'standard',
  'split_parent',
  'split_child',
  'transfer_source',
  'transfer_child',
] as const;

export type TxnType = (typeof TXN_TYPES)[number];

export const TXN_REVERSAL_STATUSES = [
  'pending_reversal',
  'auto_matched_pending_approval',
  'auto_matched_ambiguous_pending_approval',
  'reversed_matched',
  'reversal_exception',
] as const;

export type TxnReversalStatus = (typeof TXN_REVERSAL_STATUSES)[number];

export const TXN_REVERSAL_SIDES = ['source', 'reversal'] as const;

export type TxnReversalSide = (typeof TXN_REVERSAL_SIDES)[number];

export type TxnReversalMatchMethod = 'manual' | 'auto_clear' | 'auto_default';

export type TxnReversalMatchComparison = {
  sourceValue?: string;
  counterpartValue?: string;
  outcome: 'match' | 'missing' | 'mismatch' | 'not_applicable';
};

export type TxnReversalTxnSummary = {
  txnId: TxnId;
  externalId?: string;
  date: string;
  item: string;
  description: string;
  amountCents: number;
  sourceType?: string;
  sourceSystem?: string;
  journalDescription?: string;
  reference?: string;
  costCentre?: string;
};

export type TxnReversalMatchEvidence = {
  amountExact?: boolean;
  oppositeSign?: boolean;
  dayDelta?: number;
  withinAutoWindow?: boolean;
  sourceSystem?: TxnReversalMatchComparison;
  journalDescription?: TxnReversalMatchComparison;
  reference?: TxnReversalMatchComparison;
  costCentre?: TxnReversalMatchComparison;
  sourceCandidateCount?: number;
  counterpartCandidateCount?: number;
  alternativeCounterparts?: TxnReversalTxnSummary[];
  reasons: string[];
  legacy?: boolean;
};

type TxnReversal = {
  id: string;
  status: TxnReversalStatus;
  side: TxnReversalSide;
  version: number;
  counterpartTxnId?: TxnId;
  expectedProjectId?: ProjectId;
  matchMethod?: TxnReversalMatchMethod;
  matchScore?: number;
  candidateCount?: number;
  matchEvidence?: TxnReversalMatchEvidence;
  sourceTxn?: TxnReversalTxnSummary;
  counterpartTxn?: TxnReversalTxnSummary;
  proposedAt?: string;
  proposedByUserId?: UserId;
  markedAt?: string;
  markedByUserId?: UserId;
  matchedAt?: string;
  matchedByUserId?: UserId;
  createdAt?: string;
  updatedAt?: string;
};

export type Txn = {
  id: TxnId;
  /**
   * Internal DB PK (BIGINT) for server mode.
   * Represented as decimal string to avoid bigint JSON transport issues.
   */
  internalId?: string;
  /** External/imported transaction reference used for dedupe + audit. */
  externalId?: string;
  companyId: CompanyId;
  projectId: ProjectId;
  date: string; // ISO yyyy-mm-dd
  item: string;
  description: string;
  /** Signed monetary amount in minor units. Positive increases spend; negative reduces net actuals. */
  amountCents: number;
  /** How this transaction participates in split/transfer workflows. */
  txnType: TxnType;
  /** Parent/source transaction in the current project when this is a split child. */
  parentTxnId?: TxnId;
  /** Original transaction when this row was created from a transfer. */
  sourceTxnId?: TxnId;
  /** The other project involved when this row represents a transfer. */
  transferProjectId?: ProjectId;
  /** Whether this row contributes to actual spend and budget rollups. */
  budgetImpact: boolean;
  /** Whether users are allowed to apply category/subcategory coding to this row. */
  categorisable: boolean;
  importBatchId?: ImportBatchId;
  importSourceType?: 'powerbi_expenditure_actuals';
  importSourceMeta?: Record<string, string>;
  categoryId?: CategoryId;
  subCategoryId?: SubCategoryId;
  companyDefaultMappingRuleId?: CompanyDefaultMappingRuleId;
  codingSource?: 'manual' | 'company_default_rule' | 'project_rule';
  codingPendingApproval?: boolean;
  reviewedAt?: string;
  reviewedByUserId?: UserId;
  lockedAt?: string;
  lockedByUserId?: UserId;
  /** Monotonic concurrency token for review and lock transitions. */
  workflowVersion?: number;
  pendingUnlockRequest?: TxnUnlockRequest;
  reversal?: TxnReversal;
  /** Audit timestamps as ISO strings (UTC). */
  createdAt?: string;
  updatedAt?: string;
};

export type TxnUnlockRequest = {
  id: TxnUnlockRequestId;
  txnId: TxnId;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string;
  requestedByUserId: UserId;
  requestedAt: string;
  resolvedByUserId?: UserId;
  resolvedAt?: string;
  resolutionReason?: string;
  version: number;
};

export type TxnComment = {
  id: TxnCommentId;
  companyId: CompanyId;
  projectId: ProjectId;
  txnId: TxnId;
  parentCommentId?: TxnCommentId;
  body: string;
  assignedToUserId?: UserId;
  createdByUserId: UserId;
  createdByName: string;
  resolvedAt?: string;
  resolvedByUserId?: UserId;
  createdAt: string;
  updatedAt: string;
};

export type TxnCommentSummary = {
  txnId: TxnId;
  totalCount: number;
  unresolvedCount: number;
  resolvedCount: number;
  assignedToMeUnresolvedCount: number;
  latestCommentBody?: string;
  latestCommentCreatedAt?: string;
  latestCommentAuthorName?: string;
};

export type BudgetLine = {
  id: BudgetLineId;
  companyId: CompanyId;
  projectId: ProjectId;
  categoryId?: CategoryId;
  subCategoryId?: SubCategoryId;
  /** Monetary amount in minor units (e.g. cents). */
  allocatedCents: number;
  /** Audit timestamps as ISO strings (UTC). */
  createdAt?: string;
  updatedAt?: string;
};

type CompanySummaryMonth = {
  monthKey: string;
  actualCodedCents: number;
  pendingReversalCount: number;
  pendingReversalCents: number;
  adjustedActualCodedCents: number;
  uncodedCount: number;
  uncodedAmountCents: number;
};

export type CompanySummaryProject = {
  id: ProjectId;
  name: string;
  projectType: ProjectType;
  parentProjectId?: ProjectId;
  status: Project['status'];
  visibility: ProjectVisibility;
  currency: Project['currency'];
  budgetCents: number;
  months: CompanySummaryMonth[];
  children?: CompanySummaryProject[];
};

export type CompanySummary = {
  projects: CompanySummaryProject[];
};

type CompanyWorkQueueProject = {
  projectId: ProjectId;
  projectName: string;
  needsCodingCount: number;
  oldestNeedsCodingDate?: string;
  codingApprovalCount: number;
  oldestCodingApprovalDate?: string;
  reversalReviewCount: number;
  oldestReversalReviewDate?: string;
  unlockRequestCount: number;
  oldestUnlockRequestAt?: string;
};

export type CompanyWorkQueue = {
  projects: CompanyWorkQueueProject[];
  ruleSuggestionCount: number;
};

export type CompanyDefaults = {
  categories: CompanyDefaultCategory[];
  subCategories: CompanyDefaultSubCategory[];
  mappingRules: CompanyDefaultMappingRule[];
};

export type RollupRow = BudgetLine & {
  categoryName: string;
  subCategoryName: string;
  /** Monetary amounts in minor units (e.g. cents). */
  actualByMonthKey: Record<string, number>;
  totalActualCents: number;
  remainingCents: number;
};

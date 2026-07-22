import type {
  BudgetLines,
  Categories,
  Companies,
  CompanyDefaultCategories,
  CompanyDefaultMappingRules,
  CompanyDefaultSubCategories,
  CompanyExportJobs,
  CompanyMemberships,
  DB as GeneratedDB,
  EmailChangeRequests,
  Generated,
  ImportBatches,
  ImportCandidates,
  ImportRules,
  ProjectAutoCodingRules,
  ProjectMemberships,
  Projects,
  RequestRateLimits,
  RuleSuggestionSignals,
  RuleSuggestions,
  SubCategories,
  TxnComments,
  TxnReversalMatchRejections,
  TxnReversals,
  Txns,
  Users,
} from './generated/db';
import type {
  CompanyExportDetail,
  CompanyExportJobStatus,
  CompanyExportReadyNotificationDelivery,
  CompanyExportReadyNotificationStatus,
  CompanyExportScope,
  CompanyRole,
  CompanyStatus,
  ImportCandidateStatus,
  ImportRuleAction,
  ImportRuleField,
  ImportRuleOperator,
  ProjectRole,
  ProjectStandardOriginScope,
  ProjectStandardSyncStatus,
  ProjectType,
  ProjectVisibility,
  TxnReversalStatus,
  TxnType,
} from '../../types';
import type {
  NullableStringRecordJsonColumn,
  StringRecordJsonColumn,
} from './generated/custom-types';

type Override<Base, Changes> = Omit<Base, keyof Changes> & Changes;

export type { Generated } from './generated/db';

export type CompanyTable = Override<
  Companies,
  {
    status: CompanyStatus;
    deactivated_at: string | null;
  }
>;

export type ProjectTable = Override<
  Projects,
  {
    project_type: ProjectType;
    budget_total_cents: number;
    currency: 'AUD' | 'USD' | 'EUR' | 'GBP';
    status: 'active' | 'archived';
    deactivated_at: string | null;
    visibility: ProjectVisibility;
  }
>;

export type UserTable = Override<
  Users,
  {
    disabled_reason: Generated<'company_deactivated' | 'admin_disabled' | null>;
  }
>;

export type EmailChangeRequestTable = Override<
  EmailChangeRequests,
  {
    requested_at: Generated<string>;
    expires_at: string;
    consumed_at: string | null;
  }
>;

export type CompanyMembershipTable = Override<
  CompanyMemberships,
  {
    role: CompanyRole;
  }
>;

export type ProjectMembershipTable = Override<
  ProjectMemberships,
  {
    role: ProjectRole;
  }
>;

export type TxnTable = Override<
  Txns,
  {
    id: Generated<string>;
    txn_date: string;
    amount_cents: number;
    txn_type: TxnType;
    import_source_type: 'powerbi_expenditure_actuals' | null;
    import_source_meta: NullableStringRecordJsonColumn;
    coding_source: 'manual' | 'company_default_rule' | 'project_rule' | null;
    reviewed_at: string | null;
    locked_at: string | null;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type TxnCommentTable = Override<
  TxnComments,
  {
    resolved_at: string | null;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type TxnReversalTable = Override<
  TxnReversals,
  {
    status: TxnReversalStatus;
    marked_at: Generated<string>;
    matched_at: string | null;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type TxnReversalMatchRejectionTable = Override<
  TxnReversalMatchRejections,
  {
    rejected_at: Generated<string>;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type BudgetLineTable = Override<
  BudgetLines,
  {
    allocated_cents: number;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type CategoryTable = Override<
  Categories,
  {
    origin_scope: ProjectStandardOriginScope | null;
    sync_status: ProjectStandardSyncStatus | null;
    last_synced_at: string | null;
    source_updated_at_snapshot: string | null;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type SubCategoryTable = Override<
  SubCategories,
  {
    origin_scope: ProjectStandardOriginScope | null;
    sync_status: ProjectStandardSyncStatus | null;
    last_synced_at: string | null;
    source_updated_at_snapshot: string | null;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type CompanyDefaultCategoryTable = Override<
  CompanyDefaultCategories,
  {
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type CompanyDefaultSubCategoryTable = Override<
  CompanyDefaultSubCategories,
  {
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type CompanyDefaultMappingRuleTable = Override<
  CompanyDefaultMappingRules,
  {
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type ProjectAutoCodingRuleTable = Override<
  ProjectAutoCodingRules,
  {
    origin_scope: ProjectStandardOriginScope | null;
    sync_status: ProjectStandardSyncStatus | null;
    last_synced_at: string | null;
    source_updated_at_snapshot: string | null;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type RuleSuggestionSignalTable = Override<
  RuleSuggestionSignals,
  {
    suggestion_type: 'create_rule';
    pattern_basis: 'item' | 'description' | 'item_description';
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type RuleSuggestionTable = Override<
  RuleSuggestions,
  {
    status: 'open' | 'accepted' | 'dismissed';
    suggestion_type: 'create_rule';
    first_seen_at: string;
    last_seen_at: string;
    accepted_at: string | null;
    dismissed_at: string | null;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type ImportRuleTable = Override<
  ImportRules,
  {
    origin_scope: ProjectStandardOriginScope | null;
    sync_status: ProjectStandardSyncStatus | null;
    last_synced_at: string | null;
    source_updated_at_snapshot: string | null;
    action: ImportRuleAction;
    field: ImportRuleField;
    operator: ImportRuleOperator;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type ImportBatchTable = Override<
  ImportBatches,
  {
    source_type: 'powerbi_expenditure_actuals';
    status: 'previewed' | 'imported';
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type ImportCandidateTable = Override<
  ImportCandidates,
  {
    raw_row: StringRecordJsonColumn;
    status: ImportCandidateStatus;
    reviewed_at: string | null;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  }
>;

export type CompanyExportJobTable = Override<
  CompanyExportJobs,
  {
    scope: CompanyExportScope;
    detail: CompanyExportDetail;
    status: CompanyExportJobStatus;
    from_date: string | null;
    to_date: string | null;
    ready_notification_status: CompanyExportReadyNotificationStatus;
    ready_notification_delivery: CompanyExportReadyNotificationDelivery | null;
    ready_notification_sent_at: string | null;
    requested_at: Generated<string>;
    started_at: string | null;
    completed_at: string | null;
    failed_at: string | null;
    expires_at: string | null;
    last_heartbeat_at: string | null;
    updated_at: Generated<string>;
  }
>;

export type RequestRateLimitTable = Override<
  RequestRateLimits,
  {
    window_started_at: string;
    updated_at: Generated<string>;
  }
>;

type AppTableOverrides = {
  companies: CompanyTable;
  projects: ProjectTable;
  users: UserTable;
  email_change_requests: EmailChangeRequestTable;
  company_memberships: CompanyMembershipTable;
  project_memberships: ProjectMembershipTable;
  txns: TxnTable;
  txn_comments: TxnCommentTable;
  txn_reversal_match_rejections: TxnReversalMatchRejectionTable;
  txn_reversals: TxnReversalTable;
  budget_lines: BudgetLineTable;
  categories: CategoryTable;
  sub_categories: SubCategoryTable;
  company_default_categories: CompanyDefaultCategoryTable;
  company_default_sub_categories: CompanyDefaultSubCategoryTable;
  company_default_mapping_rules: CompanyDefaultMappingRuleTable;
  project_auto_coding_rules: ProjectAutoCodingRuleTable;
  rule_suggestion_signals: RuleSuggestionSignalTable;
  rule_suggestions: RuleSuggestionTable;
  import_rules: ImportRuleTable;
  import_batches: ImportBatchTable;
  import_candidates: ImportCandidateTable;
  company_export_jobs: CompanyExportJobTable;
  request_rate_limits: RequestRateLimitTable;
};

export interface DB
  extends Omit<GeneratedDB, keyof AppTableOverrides>, AppTableOverrides {}

export const DB_TABLES = [
  'ba_account',
  'ba_session',
  'ba_user',
  'ba_verification',
  'budget_lines',
  'categories',
  'companies',
  'company_default_categories',
  'company_default_mapping_rules',
  'company_default_sub_categories',
  'company_export_jobs',
  'company_memberships',
  'email_change_requests',
  'import_batches',
  'import_candidates',
  'import_rules',
  'project_auto_coding_rules',
  'project_memberships',
  'projects',
  'request_rate_limits',
  'rule_suggestion_signals',
  'rule_suggestions',
  'sub_categories',
  'txn_comments',
  'txn_reversal_match_rejections',
  'txn_reversals',
  'txns',
  'users',
] as const satisfies ReadonlyArray<keyof DB>;

export const APP_DB_TABLES = DB_TABLES;

type DbTableName = (typeof DB_TABLES)[number];
type AssertEveryDbTableIsListed =
  Exclude<keyof DB, DbTableName> extends never ? true : never;
export const _assertEveryDbTableIsListed: AssertEveryDbTableIsListed = true;

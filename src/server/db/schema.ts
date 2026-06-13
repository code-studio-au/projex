import type { Generated } from 'kysely';
import type {
  ImportCandidateStatus,
  ImportRuleAction,
  ImportRuleField,
  ImportRuleOperator,
  TxnType,
} from '../../types';

// Application DB schema mirrored from the squashed SQL baseline. Keep this
// exhaustive so Kysely query typing and the SQL baseline evolve together.

export interface CompanyTable {
  id: string;
  name: string;
  status: 'active' | 'deactivated';
  deactivated_at: string | null;
}

export interface ProjectTable {
  id: string;
  company_id: string;
  name: string;
  project_type: 'project' | 'programme';
  parent_project_id: string | null;
  budget_total_cents: number;
  currency: 'AUD' | 'USD' | 'EUR' | 'GBP';
  status: 'active' | 'archived';
  deactivated_at: string | null;
  visibility: 'company' | 'private';
  allow_superadmin_access: boolean;
  allow_txn_transfers: Generated<boolean>;
}

export interface UserTable {
  id: string;
  email: string;
  name: string;
  disabled: boolean;
  disabled_reason: Generated<'company_deactivated' | 'admin_disabled' | null>;
  is_global_superadmin: boolean;
}

export interface EmailChangeRequestTable {
  id: string;
  user_id: string;
  current_email: string;
  new_email: string;
  token_hash: string;
  requested_at: Generated<string>;
  expires_at: string;
  consumed_at: string | null;
}

export interface CompanyMembershipTable {
  company_id: string;
  user_id: string;
  role: 'admin' | 'executive' | 'management' | 'member';
}

export interface ProjectMembershipTable {
  project_id: string;
  user_id: string;
  role: 'owner' | 'lead' | 'member' | 'viewer';
}

export interface TxnTable {
  /** Internal PK (BIGINT). */
  id: Generated<string>;
  /** Public/client transaction ID. */
  public_id: string;
  /** External/import source reference used for dedupe. */
  external_id: string | null;
  company_id: string;
  project_id: string;
  txn_date: string; // Postgres DATE (YYYY-MM-DD)
  item: string;
  description: string;
  amount_cents: number; // BIGINT in Postgres, represented as number in JS
  txn_type: TxnType;
  parent_public_id: string | null;
  source_public_id: string | null;
  transfer_project_id: string | null;
  budget_impact: boolean;
  categorisable: boolean;
  import_batch_id: string | null;
  import_source_type: 'powerbi_expenditure_actuals' | null;
  import_source_meta: Record<string, string> | null;
  category_id: string | null;
  sub_category_id: string | null;
  company_default_mapping_rule_id: string | null;
  coding_source: 'manual' | 'company_default_rule' | null;
  coding_pending_approval: boolean;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  locked_at: string | null;
  locked_by_user_id: string | null;
  created_at: Generated<string>; // TIMESTAMPTZ (ISO)
  updated_at: Generated<string>; // TIMESTAMPTZ (ISO)
}

export interface TxnCommentTable {
  id: string;
  company_id: string;
  project_id: string;
  txn_public_id: string;
  parent_comment_id: string | null;
  body: string;
  assigned_to_user_id: string | null;
  created_by_user_id: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface BudgetLineTable {
  id: string;
  company_id: string;
  project_id: string;
  category_id: string | null;
  sub_category_id: string | null;
  allocated_cents: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CategoryTable {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface SubCategoryTable {
  id: string;
  company_id: string;
  project_id: string;
  category_id: string;
  name: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CompanyDefaultCategoryTable {
  id: string;
  company_id: string;
  name: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CompanyDefaultSubCategoryTable {
  id: string;
  company_id: string;
  company_default_category_id: string;
  name: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CompanyDefaultMappingRuleTable {
  id: string;
  company_id: string;
  match_text: string;
  company_default_category_id: string;
  company_default_sub_category_id: string;
  sort_order: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface ImportRuleTable {
  id: string;
  company_id: string;
  name: string;
  action: ImportRuleAction;
  field: ImportRuleField;
  operator: ImportRuleOperator;
  value: string;
  sort_order: number;
  enabled: boolean;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface ImportBatchTable {
  id: string;
  company_id: string;
  project_id: string;
  source_type: 'powerbi_expenditure_actuals';
  file_name: string;
  status: 'previewed' | 'partially_imported' | 'imported' | 'cancelled';
  created_by_user_id: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface ImportCandidateTable {
  id: string;
  company_id: string;
  project_id: string;
  batch_id: string;
  source_row_index: number;
  preview_import_id: string | null;
  raw_row: Record<string, string>;
  status: ImportCandidateStatus;
  matched_import_rule_id: string | null;
  status_reason: string | null;
  txn_public_id: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CompanyExportJobTable {
  id: string;
  company_id: string;
  created_by_user_id: string;
  scope: 'all' | 'active';
  detail: 'full' | 'summary';
  status: 'queued' | 'running' | 'completed' | 'failed';
  from_date: string | null;
  to_date: string | null;
  notify_when_ready: boolean;
  notify_email: string | null;
  ready_notification_status: 'not_requested' | 'pending' | 'sent' | 'failed';
  ready_notification_delivery: 'email' | 'log' | null;
  ready_notification_sent_at: string | null;
  ready_notification_error: string | null;
  file_name: string | null;
  content_type: string | null;
  file_bytes: Uint8Array | null;
  file_size_bytes: number | null;
  error_message: string | null;
  requested_at: Generated<string>;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  expires_at: string | null;
  last_heartbeat_at: string | null;
  updated_at: Generated<string>;
}

export interface RequestRateLimitTable {
  bucket: string;
  window_started_at: string;
  count: number;
  updated_at: Generated<string>;
}

export interface DB {
  companies: CompanyTable;
  projects: ProjectTable;
  users: UserTable;
  email_change_requests: EmailChangeRequestTable;
  company_memberships: CompanyMembershipTable;
  project_memberships: ProjectMembershipTable;
  txns: TxnTable;
  txn_comments: TxnCommentTable;
  budget_lines: BudgetLineTable;
  categories: CategoryTable;
  sub_categories: SubCategoryTable;
  company_default_categories: CompanyDefaultCategoryTable;
  company_default_sub_categories: CompanyDefaultSubCategoryTable;
  company_default_mapping_rules: CompanyDefaultMappingRuleTable;
  import_rules: ImportRuleTable;
  import_batches: ImportBatchTable;
  import_candidates: ImportCandidateTable;
  company_export_jobs: CompanyExportJobTable;
  request_rate_limits: RequestRateLimitTable;
}

export const APP_DB_TABLES = [
  'companies',
  'projects',
  'users',
  'email_change_requests',
  'company_memberships',
  'project_memberships',
  'txns',
  'txn_comments',
  'budget_lines',
  'categories',
  'sub_categories',
  'company_default_categories',
  'company_default_sub_categories',
  'company_default_mapping_rules',
  'import_rules',
  'import_batches',
  'import_candidates',
  'company_export_jobs',
  'request_rate_limits',
] as const satisfies ReadonlyArray<keyof DB>;

type AppDbTableName = (typeof APP_DB_TABLES)[number];
type AssertEveryDbTableIsListed =
  Exclude<keyof DB, AppDbTableName> extends never ? true : never;
export const _assertEveryDbTableIsListed: AssertEveryDbTableIsListed = true;

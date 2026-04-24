import type { Generated } from 'kysely';

// Minimal DB schema types for the Start + Kysely migration.
// Extend as you move more logic server-side.

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
  budget_total_cents: number;
  currency: 'AUD' | 'USD' | 'EUR' | 'GBP';
  status: 'active' | 'archived';
  deactivated_at: string | null;
  visibility: 'company' | 'private';
  allow_superadmin_access: boolean;
}

export interface UserTable {
  id: string;
  email: string;
  name: string;
  disabled: boolean;
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
  category_id: string | null;
  sub_category_id: string | null;
  company_default_mapping_rule_id: string | null;
  coding_source: 'manual' | 'company_default_rule' | null;
  coding_pending_approval: boolean;
  created_at: Generated<string>; // TIMESTAMPTZ (ISO)
  updated_at: Generated<string>; // TIMESTAMPTZ (ISO)
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

export interface DB {
  companies: CompanyTable;
  projects: ProjectTable;
  users: UserTable;
  email_change_requests: EmailChangeRequestTable;
  company_memberships: CompanyMembershipTable;
  project_memberships: ProjectMembershipTable;
  txns: TxnTable;
  budget_lines: BudgetLineTable;
  categories: CategoryTable;
  sub_categories: SubCategoryTable;
  company_default_categories: CompanyDefaultCategoryTable;
  company_default_sub_categories: CompanyDefaultSubCategoryTable;
  company_default_mapping_rules: CompanyDefaultMappingRuleTable;
}

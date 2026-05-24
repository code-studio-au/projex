-- 0001_init.sql
-- Core schema aligned with src/api/invariants.ts and local adapter behavior.

create table if not exists companies (
  id text primary key,
  name text not null,
  status text not null check (status in ('active', 'deactivated')),
  deactivated_at timestamptz null
);

create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  disabled boolean not null default false,
  disabled_reason text null check (disabled_reason in ('company_deactivated', 'admin_disabled')),
  is_global_superadmin boolean not null default false
);

create table if not exists email_change_requests (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  current_email text not null,
  new_email text not null,
  token_hash text not null unique,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz null
);

create index if not exists idx_email_change_requests_user
  on email_change_requests(user_id, requested_at desc);

create table if not exists projects (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  name text not null,
  project_type text not null default 'project' check (project_type in ('project', 'programme')),
  parent_project_id text null references projects(id) on delete set null,
  currency text not null check (currency in ('AUD', 'USD', 'EUR', 'GBP')),
  status text not null check (status in ('active', 'archived')),
  deactivated_at timestamptz null,
  visibility text not null check (visibility in ('company', 'private')),
  allow_superadmin_access boolean not null default true,
  allow_txn_transfers boolean not null default false
);

create index if not exists idx_projects_company on projects(company_id);
create index if not exists idx_projects_parent_project on projects(parent_project_id);

create table if not exists company_memberships (
  company_id text not null references companies(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('admin', 'executive', 'management', 'member')),
  primary key (company_id, user_id)
);

create index if not exists idx_company_memberships_user on company_memberships(user_id);

create table if not exists project_memberships (
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'lead', 'member', 'viewer')),
  primary key (project_id, user_id)
);

create index if not exists idx_project_memberships_user on project_memberships(user_id);

create table if not exists categories (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive uniqueness per project
create unique index if not exists uq_categories_project_lower_name
  on categories(project_id, lower(name));

create table if not exists sub_categories (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  category_id text not null references categories(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive uniqueness per (project, category)
create unique index if not exists uq_sub_categories_project_category_lower_name
  on sub_categories(project_id, category_id, lower(name));

create table if not exists company_default_categories (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_company_default_categories_company_lower_name
  on company_default_categories(company_id, lower(name));

create table if not exists company_default_sub_categories (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  company_default_category_id text not null references company_default_categories(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_company_default_sub_categories_company_category_lower_name
  on company_default_sub_categories(company_id, company_default_category_id, lower(name));

create table if not exists company_default_mapping_rules (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  match_text text not null,
  company_default_category_id text not null references company_default_categories(id) on delete cascade,
  company_default_sub_category_id text not null references company_default_sub_categories(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_default_mapping_rules_company_sort
  on company_default_mapping_rules(company_id, sort_order, created_at);

create table if not exists import_rules (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  name text not null,
  action text not null check (action in ('import', 'exclude', 'review')),
  field text not null check (field in ('ledger', 'source', 'journalId', 'journalLineDescription', 'ccAndDescription', 'vendorName', 'poId', 'referenceNum', 'anyText')),
  operator text not null check (operator in ('equals', 'contains', 'starts_with', 'regex')),
  value text not null,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_import_rules_company_sort
  on import_rules(company_id, enabled, sort_order, created_at);

create table if not exists import_batches (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  source_type text not null check (source_type in ('powerbi_expenditure_actuals')),
  file_name text not null,
  status text not null default 'previewed' check (status in ('previewed', 'partially_imported', 'imported', 'cancelled')),
  created_by_user_id text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_import_batches_project_created
  on import_batches(project_id, created_at desc);

create table if not exists budget_lines (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  category_id text null references categories(id) on delete set null,
  sub_category_id text null references sub_categories(id) on delete set null,
  allocated_cents bigint not null check (allocated_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique per (project, sub_category), but allow null sub_category_id.
create unique index if not exists uq_budget_lines_project_sub_category
  on budget_lines(project_id, sub_category_id)
  where sub_category_id is not null;

create table if not exists txns (
  id bigint generated always as identity primary key,
  public_id text not null,
  external_id text null,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  txn_date date not null,
  item text not null,
  description text not null,
  amount_cents bigint not null,
  txn_type text not null default 'standard' constraint txns_txn_type_check check (txn_type in ('standard', 'split_parent', 'split_child', 'transfer_source', 'transfer_child')),
  parent_public_id text null,
  source_public_id text null,
  transfer_project_id text null references projects(id) on delete set null,
  budget_impact boolean not null default true,
  categorisable boolean not null default true,
  import_batch_id text null references import_batches(id) on delete set null,
  import_source_type text null check (import_source_type in ('powerbi_expenditure_actuals')),
  import_source_meta jsonb null,
  category_id text null references categories(id) on delete set null,
  sub_category_id text null references sub_categories(id) on delete set null,
  company_default_mapping_rule_id text null references company_default_mapping_rules(id) on delete set null,
  coding_source text null check (coding_source in ('manual', 'company_default_rule')),
  coding_pending_approval boolean not null default false,
  reviewed_at timestamptz null,
  reviewed_by_user_id text null references users(id) on delete set null,
  locked_at timestamptz null,
  locked_by_user_id text null references users(id) on delete set null,
  constraint txns_uncategorisable_has_no_coding_check check (
    categorisable
    or (
      category_id is null
      and sub_category_id is null
      and company_default_mapping_rule_id is null
      and coding_source is null
      and coding_pending_approval = false
    )
  ),
  constraint txns_reviewed_consistency_check check (
    (reviewed_at is null and reviewed_by_user_id is null)
    or (reviewed_at is not null and reviewed_by_user_id is not null)
  ),
  constraint txns_locked_consistency_check check (
    (locked_at is null and locked_by_user_id is null)
    or (
      locked_at is not null
      and locked_by_user_id is not null
      and reviewed_at is not null
      and reviewed_by_user_id is not null
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Public ID uniqueness in project scope.
create unique index if not exists uq_txns_project_public_id
  on txns(project_id, public_id);

-- External ID uniqueness in project scope when provided.
create unique index if not exists uq_txns_project_external_id
  on txns(project_id, external_id)
  where external_id is not null and length(trim(external_id)) > 0;

create index if not exists idx_txns_project_parent_public_id
  on txns(project_id, parent_public_id)
  where parent_public_id is not null;

create index if not exists idx_txns_project_source_public_id
  on txns(project_id, source_public_id)
  where source_public_id is not null;

create index if not exists idx_txns_transfer_project_id
  on txns(transfer_project_id)
  where transfer_project_id is not null;

create table if not exists import_candidates (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  batch_id text not null references import_batches(id) on delete cascade,
  source_row_index integer not null,
  preview_import_id text null,
  raw_row jsonb not null,
  status text not null check (status in ('ready', 'excluded', 'needs_project_review', 'approved', 'rejected', 'imported', 'invalid', 'duplicate')),
  matched_import_rule_id text null references import_rules(id) on delete set null,
  status_reason text null,
  txn_public_id text null,
  reviewed_by_user_id text null references users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, source_row_index)
);

create index if not exists idx_import_candidates_project_status
  on import_candidates(project_id, status, created_at);

create table if not exists txn_comments (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  txn_public_id text not null,
  parent_comment_id text null references txn_comments(id) on delete cascade,
  body text not null check (length(trim(body)) > 0 and length(body) <= 2000),
  assigned_to_user_id text null references users(id) on delete set null,
  created_by_user_id text not null references users(id),
  resolved_at timestamptz null,
  resolved_by_user_id text null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint txn_comments_resolved_consistency_check check (
    (resolved_at is null and resolved_by_user_id is null)
    or (resolved_at is not null and resolved_by_user_id is not null)
  ),
  constraint txn_comments_txn_fk foreign key (project_id, txn_public_id)
    references txns(project_id, public_id)
    on delete cascade
);

create index if not exists idx_txn_comments_project_txn_created
  on txn_comments(project_id, txn_public_id, created_at, id);

create index if not exists idx_txn_comments_parent
  on txn_comments(parent_comment_id)
  where parent_comment_id is not null;

create index if not exists idx_txn_comments_assigned_to
  on txn_comments(assigned_to_user_id)
  where assigned_to_user_id is not null;

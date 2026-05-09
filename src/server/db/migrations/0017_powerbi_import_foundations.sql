create table if not exists import_rules (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  name text not null,
  action text not null check (action in ('import', 'exclude', 'review')),
  field text not null check (field in ('source', 'journalId', 'journalLineDescription', 'ccAndDescription', 'vendorName', 'poId', 'referenceNum', 'anyText')),
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

alter table txns
  add column if not exists import_batch_id text references import_batches(id) on delete set null;

alter table txns
  add column if not exists import_source_type text check (import_source_type in ('powerbi_expenditure_actuals'));

alter table txns
  add column if not exists import_source_meta jsonb;

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

alter table import_candidates
  add column if not exists preview_import_id text null;

create index if not exists idx_import_candidates_project_status
  on import_candidates(project_id, status, created_at);

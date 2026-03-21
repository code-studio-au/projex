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
  disabled boolean not null default false
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
  currency text not null check (currency in ('AUD', 'USD', 'EUR', 'GBP')),
  status text not null check (status in ('active', 'archived')),
  deactivated_at timestamptz null,
  visibility text not null check (visibility in ('company', 'private')),
  allow_superadmin_access boolean not null default true
);

create index if not exists idx_projects_company on projects(company_id);

create table if not exists company_memberships (
  company_id text not null references companies(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('superadmin', 'admin', 'executive', 'management', 'member')),
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
  amount_cents bigint not null check (amount_cents >= 0),
  category_id text null references categories(id) on delete set null,
  sub_category_id text null references sub_categories(id) on delete set null,
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

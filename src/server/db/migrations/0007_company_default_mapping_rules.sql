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

alter table txns
  add column if not exists company_default_mapping_rule_id text references company_default_mapping_rules(id) on delete set null;

alter table txns
  add column if not exists coding_source text null check (coding_source in ('manual', 'company_default_rule'));

alter table txns
  add column if not exists coding_pending_approval boolean not null default false;

create table if not exists project_auto_coding_rules (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  match_text text not null,
  category_id text not null references categories(id) on delete cascade,
  sub_category_id text not null references sub_categories(id) on delete cascade,
  sort_order integer not null,
  created_by_user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_auto_coding_rules_project_sort
  on project_auto_coding_rules(project_id, sort_order, created_at);

create unique index if not exists uq_project_auto_coding_rules_project_match_target
  on project_auto_coding_rules(project_id, lower(match_text), sub_category_id);

alter table txns
  drop constraint if exists txns_coding_source_check;

alter table txns
  add constraint txns_coding_source_check
  check (coding_source in ('manual', 'company_default_rule', 'project_rule'));

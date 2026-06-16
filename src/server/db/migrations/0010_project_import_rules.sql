alter table import_rules
  add column if not exists project_id text null references projects(id) on delete cascade;

create index if not exists idx_import_rules_company_scope_sort
  on import_rules(company_id, project_id, sort_order, created_at);

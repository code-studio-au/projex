alter table project_auto_coding_rules
  add column if not exists origin_scope text null check (origin_scope in ('company', 'project')),
  add column if not exists origin_company_item_id text null,
  add column if not exists sync_status text null check (sync_status in ('local', 'inherited', 'overridden', 'detached')),
  add column if not exists last_synced_at timestamptz null,
  add column if not exists source_updated_at_snapshot timestamptz null;

create index if not exists idx_project_auto_coding_rules_project_origin_company
  on project_auto_coding_rules(project_id, origin_company_item_id);

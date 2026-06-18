alter table categories
  add column if not exists origin_scope text null check (origin_scope in ('company', 'project')),
  add column if not exists origin_company_item_id text null,
  add column if not exists sync_status text null check (sync_status in ('local', 'inherited', 'overridden', 'detached')),
  add column if not exists last_synced_at timestamptz null,
  add column if not exists source_updated_at_snapshot timestamptz null;

alter table sub_categories
  add column if not exists origin_scope text null check (origin_scope in ('company', 'project')),
  add column if not exists origin_company_item_id text null,
  add column if not exists sync_status text null check (sync_status in ('local', 'inherited', 'overridden', 'detached')),
  add column if not exists last_synced_at timestamptz null,
  add column if not exists source_updated_at_snapshot timestamptz null;

alter table import_rules
  add column if not exists origin_scope text null check (origin_scope in ('company', 'project')),
  add column if not exists origin_company_item_id text null,
  add column if not exists sync_status text null check (sync_status in ('local', 'inherited', 'overridden', 'detached')),
  add column if not exists last_synced_at timestamptz null,
  add column if not exists source_updated_at_snapshot timestamptz null;

create index if not exists idx_categories_project_origin_company
  on categories(project_id, origin_company_item_id);

create index if not exists idx_sub_categories_project_origin_company
  on sub_categories(project_id, origin_company_item_id);

create index if not exists idx_import_rules_project_origin_company
  on import_rules(project_id, origin_company_item_id);

update categories
set origin_scope = 'project',
    origin_company_item_id = null,
    sync_status = 'local',
    last_synced_at = coalesce(last_synced_at, updated_at),
    source_updated_at_snapshot = null
where origin_scope is distinct from 'company'
   or origin_company_item_id is null
   or sync_status not in ('inherited', 'overridden', 'detached');

update categories
set last_synced_at = coalesce(last_synced_at, updated_at),
    source_updated_at_snapshot = coalesce(source_updated_at_snapshot, updated_at)
where origin_scope = 'company';

update sub_categories
set origin_scope = 'project',
    origin_company_item_id = null,
    sync_status = 'local',
    last_synced_at = coalesce(last_synced_at, updated_at),
    source_updated_at_snapshot = null
where origin_scope is distinct from 'company'
   or origin_company_item_id is null
   or sync_status not in ('inherited', 'overridden', 'detached');

update sub_categories
set last_synced_at = coalesce(last_synced_at, updated_at),
    source_updated_at_snapshot = coalesce(source_updated_at_snapshot, updated_at)
where origin_scope = 'company';

update project_auto_coding_rules
set origin_scope = 'project',
    origin_company_item_id = null,
    sync_status = 'local',
    last_synced_at = coalesce(last_synced_at, updated_at),
    source_updated_at_snapshot = null
where origin_scope is distinct from 'company'
   or origin_company_item_id is null
   or sync_status not in ('inherited', 'overridden', 'detached');

update project_auto_coding_rules
set last_synced_at = coalesce(last_synced_at, updated_at),
    source_updated_at_snapshot = coalesce(source_updated_at_snapshot, updated_at)
where origin_scope = 'company';

update import_rules
set origin_scope = null,
    origin_company_item_id = null,
    sync_status = null,
    last_synced_at = null,
    source_updated_at_snapshot = null
where project_id is null;

update import_rules
set origin_scope = 'project',
    origin_company_item_id = null,
    sync_status = 'local',
    last_synced_at = coalesce(last_synced_at, updated_at),
    source_updated_at_snapshot = null
where project_id is not null
  and (
    origin_scope is distinct from 'company'
    or origin_company_item_id is null
    or sync_status not in ('inherited', 'overridden', 'detached')
  );

update import_rules
set last_synced_at = coalesce(last_synced_at, updated_at),
    source_updated_at_snapshot = coalesce(source_updated_at_snapshot, updated_at)
where project_id is not null
  and origin_scope = 'company';

alter table categories
  add constraint chk_categories_standard_provenance check (
    (
      origin_scope = 'project'
      and origin_company_item_id is null
      and sync_status = 'local'
      and last_synced_at is not null
      and source_updated_at_snapshot is null
    )
    or (
      origin_scope = 'company'
      and origin_company_item_id is not null
      and sync_status in ('inherited', 'overridden', 'detached')
      and last_synced_at is not null
      and source_updated_at_snapshot is not null
    )
  );

alter table sub_categories
  add constraint chk_sub_categories_standard_provenance check (
    (
      origin_scope = 'project'
      and origin_company_item_id is null
      and sync_status = 'local'
      and last_synced_at is not null
      and source_updated_at_snapshot is null
    )
    or (
      origin_scope = 'company'
      and origin_company_item_id is not null
      and sync_status in ('inherited', 'overridden', 'detached')
      and last_synced_at is not null
      and source_updated_at_snapshot is not null
    )
  );

alter table project_auto_coding_rules
  add constraint chk_project_auto_coding_rules_standard_provenance check (
    (
      origin_scope = 'project'
      and origin_company_item_id is null
      and sync_status = 'local'
      and last_synced_at is not null
      and source_updated_at_snapshot is null
    )
    or (
      origin_scope = 'company'
      and origin_company_item_id is not null
      and sync_status in ('inherited', 'overridden', 'detached')
      and last_synced_at is not null
      and source_updated_at_snapshot is not null
    )
  );

alter table import_rules
  add constraint chk_import_rules_standard_provenance check (
    (
      project_id is null
      and origin_scope is null
      and origin_company_item_id is null
      and sync_status is null
      and last_synced_at is null
      and source_updated_at_snapshot is null
    )
    or (
      project_id is not null
      and origin_scope = 'project'
      and origin_company_item_id is null
      and sync_status = 'local'
      and last_synced_at is not null
      and source_updated_at_snapshot is null
    )
    or (
      project_id is not null
      and origin_scope = 'company'
      and origin_company_item_id is not null
      and sync_status in ('inherited', 'overridden', 'detached')
      and last_synced_at is not null
      and source_updated_at_snapshot is not null
    )
  );

create unique index if not exists uq_categories_project_company_origin
  on categories(project_id, origin_company_item_id)
  where origin_company_item_id is not null;

create unique index if not exists uq_sub_categories_project_company_origin
  on sub_categories(project_id, origin_company_item_id)
  where origin_company_item_id is not null;

create unique index if not exists uq_import_rules_project_company_origin
  on import_rules(project_id, origin_company_item_id)
  where project_id is not null and origin_company_item_id is not null;

create unique index if not exists uq_project_auto_coding_rules_company_origin
  on project_auto_coding_rules(project_id, origin_company_item_id)
  where origin_company_item_id is not null;

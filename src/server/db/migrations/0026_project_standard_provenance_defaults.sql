alter table categories
  alter column origin_scope set default 'project',
  alter column sync_status set default 'local',
  alter column last_synced_at set default now();

alter table sub_categories
  alter column origin_scope set default 'project',
  alter column sync_status set default 'local',
  alter column last_synced_at set default now();

alter table project_auto_coding_rules
  alter column origin_scope set default 'project',
  alter column sync_status set default 'local',
  alter column last_synced_at set default now();

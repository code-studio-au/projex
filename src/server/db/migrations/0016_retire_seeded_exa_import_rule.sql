with seeded_exa_rules as (
  select id
  from import_rules
  where project_id is null
    and origin_scope is null
    and origin_company_item_id is null
    and sync_status is null
    and name = 'Exclude EXA unacquitted Concur source'
    and action = 'exclude'
    and field = 'source'
    and operator = 'equals'
    and value = 'EXA'
    and sort_order = 20
    and enabled = true
    and created_at = updated_at
),
detached_overrides as (
  update import_rules as project_rule
  set sync_status = 'detached',
      last_synced_at = now(),
      updated_at = now()
  from seeded_exa_rules as seeded
  where project_rule.origin_company_item_id = seeded.id
    and project_rule.project_id is not null
    and project_rule.origin_scope = 'company'
    and project_rule.sync_status = 'overridden'
  returning project_rule.id
),
deleted_inherited_rules as (
  delete from import_rules as project_rule
  using seeded_exa_rules as seeded
  where project_rule.origin_company_item_id = seeded.id
    and project_rule.project_id is not null
    and project_rule.origin_scope = 'company'
    and project_rule.sync_status = 'inherited'
  returning project_rule.id
)
delete from import_rules as company_rule
using seeded_exa_rules as seeded
where company_rule.id = seeded.id;

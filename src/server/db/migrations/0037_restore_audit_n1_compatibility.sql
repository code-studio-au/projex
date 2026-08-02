-- Forward repair for environments that applied the original destructive 0036
-- before its N-1 rollback incompatibility was found. New environments retain
-- the existing table; affected environments receive the exact legacy write
-- contract required by the immediately previous application release.
create table if not exists audit_events (
  id text primary key,
  company_id text not null,
  project_id text null,
  actor_user_id text not null,
  event_class text not null check (
    event_class in (
      'workflow',
      'import',
      'coding',
      'taxonomy',
      'structural',
      'rules',
      'membership',
      'access',
      'lifecycle',
      'inheritance'
    )
  ),
  event_type text not null check (length(trim(event_type)) > 0),
  entity_type text not null check (length(trim(entity_type)) > 0),
  entity_id text not null check (length(trim(entity_id)) > 0),
  reason text not null check (length(trim(reason)) > 0),
  previous_state jsonb not null default '{}'::jsonb,
  resulting_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  retention_class text not null check (
    retention_class in ('financial', 'security', 'operational', 'diagnostic')
  ),
  retain_until timestamptz null,
  created_at timestamptz not null,
  constraint chk_audit_events_previous_state_object
    check (jsonb_typeof(previous_state) = 'object'),
  constraint chk_audit_events_resulting_state_object
    check (jsonb_typeof(resulting_state) = 'object'),
  constraint chk_audit_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_audit_events_entity
  on audit_events(company_id, entity_type, entity_id, created_at desc);

create index if not exists idx_audit_events_project_class
  on audit_events(project_id, event_class, created_at desc)
  where project_id is not null;

create index if not exists idx_audit_events_retention
  on audit_events(retention_class, retain_until)
  where retain_until is not null;

create or replace function prevent_audit_event_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
    and old.retain_until is not null
    and old.retain_until <= now()
    and current_setting('app.audit_retention_cleanup', true) = 'on'
  then
    return old;
  end if;

  raise exception 'audit events are immutable';
end;
$$;

drop trigger if exists trg_audit_events_immutable on audit_events;
create trigger trg_audit_events_immutable
before update or delete on audit_events
for each row execute function prevent_audit_event_mutation();

comment on table audit_events is
  'Legacy N-1 rollback compatibility only; current releases emit audit telemetry through the structured server logger.';

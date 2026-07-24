alter table audit_events
  drop constraint if exists fk_audit_events_project_company;

create or replace function protect_locked_subcategory_history()
returns trigger
language plpgsql
as $$
declare
  affected_sub_category_id text;
  affected_project_id text;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id
  then
    return new;
  end if;

  affected_sub_category_id := old.id;
  affected_project_id := old.project_id;

  if exists (
    select 1
    from txns as txn
    where txn.project_id = affected_project_id
      and txn.sub_category_id = affected_sub_category_id
      and txn.locked_at is not null
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'locked_subcategory_history_check',
      message = 'Locked transaction history prevents this subcategory change';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create or replace function protect_locked_category_history()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  if exists (
    select 1
    from txns as txn
    where txn.project_id = old.project_id
      and txn.category_id = old.id
      and txn.locked_at is not null
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'locked_category_history_check',
      message = 'Locked transaction history prevents this category change';
  end if;

  return old;
end
$$;

drop trigger if exists trg_protect_locked_category_history
  on categories;

create trigger trg_protect_locked_category_history
before delete on categories
for each row
execute function protect_locked_category_history();

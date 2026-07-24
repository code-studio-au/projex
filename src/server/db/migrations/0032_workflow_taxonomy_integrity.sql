create or replace function enforce_txn_lock_eligibility()
returns trigger
language plpgsql
as $$
begin
  if new.locked_at is null
    or (tg_op = 'UPDATE' and old.locked_at is not null)
  then
    return new;
  end if;

  if new.coding_pending_approval then
    raise exception using
      errcode = '23514',
      constraint = 'txns_lock_eligibility_check',
      message = 'A transaction awaiting coding approval cannot be locked';
  end if;

  if new.categorisable and (
    new.sub_category_id is null
    or not exists (
      select 1
      from sub_categories as sub
      where sub.project_id = new.project_id
        and sub.id = new.sub_category_id
        and sub.category_id = new.category_id
    )
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'txns_lock_eligibility_check',
      message = 'An uncoded transaction cannot be locked';
  end if;

  if exists (
    select 1
    from txn_reversals as reversal
    where reversal.project_id = new.project_id
      and reversal.status <> 'reversed_matched'
      and (
        reversal.source_txn_public_id = new.public_id
        or reversal.matched_reversal_txn_public_id = new.public_id
      )
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'txns_lock_eligibility_check',
      message = 'A transaction with unresolved reversal work cannot be locked';
  end if;

  return new;
end
$$;

drop trigger if exists trg_txns_lock_eligibility on txns;

create trigger trg_txns_lock_eligibility
before insert or update of locked_at on txns
for each row
execute function enforce_txn_lock_eligibility();

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

drop trigger if exists trg_protect_locked_subcategory_history
  on sub_categories;

create trigger trg_protect_locked_subcategory_history
before delete or update of category_id on sub_categories
for each row
execute function protect_locked_subcategory_history();

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

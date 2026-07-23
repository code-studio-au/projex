create unique index if not exists uq_txns_company_project_public_id
  on txns(company_id, project_id, public_id);

-- Earlier releases allowed either side of a structural relationship to be
-- deleted. Preserve surviving financial rows while repairing stale lineage.
update txns as child
set parent_public_id = null,
    txn_type = case
      when child.txn_type = 'split_child' and child.source_public_id is not null
        then 'transfer_child'
      when child.txn_type = 'split_child' then 'standard'
      else child.txn_type
    end,
    updated_at = now()
where child.parent_public_id is not null
  and not exists (
    select 1
    from txns as parent
    where parent.company_id = child.company_id
      and parent.project_id = child.project_id
      and parent.public_id = child.parent_public_id
  );

update txns as target
set source_public_id = null,
    transfer_project_id = null,
    txn_type = case
      when target.txn_type = 'transfer_child' then 'standard'
      else target.txn_type
    end,
    updated_at = now()
where target.source_public_id is not null
  and not exists (
    select 1
    from txns as source
    where source.company_id = target.company_id
      and source.project_id = target.transfer_project_id
      and source.public_id = target.source_public_id
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txns_split_parent'
  ) then
    alter table txns
      add constraint fk_txns_split_parent
      foreign key (company_id, project_id, parent_public_id)
      references txns(company_id, project_id, public_id)
      deferrable initially deferred;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txns_transfer_source'
  ) then
    alter table txns
      add constraint fk_txns_transfer_source
      foreign key (company_id, transfer_project_id, source_public_id)
      references txns(company_id, project_id, public_id)
      deferrable initially deferred;
  end if;
end
$$;

create table if not exists txn_links (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  link_type text not null check (link_type in ('split', 'transfer')),
  source_project_id text not null,
  source_txn_public_id text not null,
  target_project_id text not null,
  target_txn_public_id text not null,
  amount_cents bigint not null check (amount_cents <> 0),
  created_by_user_id text null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint txn_links_distinct_endpoints_check check (
    source_project_id <> target_project_id
    or source_txn_public_id <> target_txn_public_id
  ),
  constraint uq_txn_links_target unique (
    target_project_id,
    target_txn_public_id
  ),
  constraint fk_txn_links_source
    foreign key (company_id, source_project_id, source_txn_public_id)
    references txns(company_id, project_id, public_id)
    deferrable initially deferred,
  constraint fk_txn_links_target
    foreign key (company_id, target_project_id, target_txn_public_id)
    references txns(company_id, project_id, public_id)
    deferrable initially deferred
);

create index if not exists idx_txn_links_source
  on txn_links(source_project_id, source_txn_public_id, link_type);

-- Migrate split links first because a transferred transaction may itself have
-- been split. Each target can belong to only one immediate structural parent.
insert into txn_links (
  id,
  company_id,
  link_type,
  source_project_id,
  source_txn_public_id,
  target_project_id,
  target_txn_public_id,
  amount_cents,
  created_by_user_id,
  created_at
)
select
  'txnl_migrated_' || md5(
    'split|' || child.project_id || '|' || child.parent_public_id || '|' || child.public_id
  ),
  child.company_id,
  'split',
  child.project_id,
  child.parent_public_id,
  child.project_id,
  child.public_id,
  child.amount_cents,
  null,
  child.created_at
from txns as child
join txns as parent
  on parent.company_id = child.company_id
 and parent.project_id = child.project_id
 and parent.public_id = child.parent_public_id
where child.parent_public_id is not null
on conflict (target_project_id, target_txn_public_id) do nothing;

insert into txn_links (
  id,
  company_id,
  link_type,
  source_project_id,
  source_txn_public_id,
  target_project_id,
  target_txn_public_id,
  amount_cents,
  created_by_user_id,
  created_at
)
select
  'txnl_migrated_' || md5(
    'transfer|' || target.transfer_project_id || '|' || target.source_public_id || '|' || target.project_id || '|' || target.public_id
  ),
  target.company_id,
  'transfer',
  target.transfer_project_id,
  target.source_public_id,
  target.project_id,
  target.public_id,
  target.amount_cents,
  null,
  target.created_at
from txns as target
join txns as source
  on source.company_id = target.company_id
 and source.project_id = target.transfer_project_id
 and source.public_id = target.source_public_id
where target.source_public_id is not null
  and target.transfer_project_id is not null
  and target.parent_public_id is null
on conflict (target_project_id, target_txn_public_id) do nothing;

create or replace function validate_txn_link_group(
  p_company_id text,
  p_link_type text,
  p_source_project_id text,
  p_source_txn_public_id text
) returns void
language plpgsql
as $$
declare
  source_row txns%rowtype;
  target_count integer;
  target_total bigint;
  targets_valid boolean;
begin
  select * into source_row
  from txns
  where company_id = p_company_id
    and project_id = p_source_project_id
    and public_id = p_source_txn_public_id;

  if not found then
    return;
  end if;

  select
    count(*)::integer,
    coalesce(sum(target.amount_cents), 0),
    coalesce(bool_and(link.amount_cents = target.amount_cents), false)
  into target_count, target_total, targets_valid
  from txn_links as link
  join txns as target
    on target.company_id = link.company_id
   and target.project_id = link.target_project_id
   and target.public_id = link.target_txn_public_id
  where link.company_id = p_company_id
    and link.link_type = p_link_type
    and link.source_project_id = p_source_project_id
    and link.source_txn_public_id = p_source_txn_public_id;

  if p_link_type = 'split' then
    if source_row.txn_type <> 'split_parent'
      or target_count < 2
      or target_total <> source_row.amount_cents
      or not targets_valid
    then
      raise exception using
        errcode = '23514',
        constraint = 'txn_links_split_balance_check',
        message = 'Split lineage must contain at least two children that exactly balance the parent amount';
    end if;
  elsif p_link_type = 'transfer' then
    if source_row.txn_type <> 'transfer_source'
      or target_count <> 1
      or target_total <> source_row.amount_cents
      or not targets_valid
    then
      raise exception using
        errcode = '23514',
        constraint = 'txn_links_transfer_balance_check',
        message = 'Transfer lineage must contain one destination matching the source amount';
    end if;
  end if;
end
$$;

create or replace function validate_changed_txn_link()
returns trigger
language plpgsql
as $$
begin
  if tg_op <> 'INSERT' then
    perform validate_txn_link_group(
      old.company_id,
      old.link_type,
      old.source_project_id,
      old.source_txn_public_id
    );
  end if;
  if tg_op <> 'DELETE' then
    perform validate_txn_link_group(
      new.company_id,
      new.link_type,
      new.source_project_id,
      new.source_txn_public_id
    );
  end if;
  return null;
end
$$;

drop trigger if exists trg_validate_changed_txn_link on txn_links;
create constraint trigger trg_validate_changed_txn_link
after insert or update or delete on txn_links
deferrable initially deferred
for each row execute function validate_changed_txn_link();

create or replace function validate_changed_structural_txn()
returns trigger
language plpgsql
as $$
declare
  row_value txns%rowtype;
  has_required_link boolean;
  link_group record;
begin
  if tg_op = 'DELETE' then
    return null;
  end if;
  row_value := new;

  if row_value.txn_type = 'standard' then
    select exists (
      select 1 from txn_links
      where company_id = row_value.company_id
        and (
          (source_project_id = row_value.project_id and source_txn_public_id = row_value.public_id)
          or (target_project_id = row_value.project_id and target_txn_public_id = row_value.public_id)
        )
    ) into has_required_link;
    if has_required_link then
      raise exception using
        errcode = '23514',
        constraint = 'txns_standard_has_no_lineage_check',
        message = 'Standard transactions cannot participate in structural lineage';
    end if;
  elsif row_value.txn_type = 'split_parent' then
    select exists (
      select 1 from txn_links
      where company_id = row_value.company_id
        and link_type = 'split'
        and source_project_id = row_value.project_id
        and source_txn_public_id = row_value.public_id
    ) into has_required_link;
  elsif row_value.txn_type = 'split_child' then
    select exists (
      select 1 from txn_links
      where company_id = row_value.company_id
        and link_type = 'split'
        and target_project_id = row_value.project_id
        and target_txn_public_id = row_value.public_id
    ) into has_required_link;
  elsif row_value.txn_type = 'transfer_source' then
    select exists (
      select 1 from txn_links
      where company_id = row_value.company_id
        and link_type = 'transfer'
        and source_project_id = row_value.project_id
        and source_txn_public_id = row_value.public_id
    ) into has_required_link;
  elsif row_value.txn_type = 'transfer_child' then
    select exists (
      select 1 from txn_links
      where company_id = row_value.company_id
        and link_type = 'transfer'
        and target_project_id = row_value.project_id
        and target_txn_public_id = row_value.public_id
    ) into has_required_link;
  else
    has_required_link := false;
  end if;

  if row_value.txn_type <> 'standard' and not has_required_link then
    raise exception using
      errcode = '23514',
      constraint = 'txns_structural_lineage_required_check',
      message = 'Structural transactions require an explicit lineage link';
  end if;

  for link_group in
    select distinct link_type, source_project_id, source_txn_public_id
    from txn_links
    where company_id = row_value.company_id
      and (
        (source_project_id = row_value.project_id and source_txn_public_id = row_value.public_id)
        or (target_project_id = row_value.project_id and target_txn_public_id = row_value.public_id)
      )
  loop
    perform validate_txn_link_group(
      row_value.company_id,
      link_group.link_type,
      link_group.source_project_id,
      link_group.source_txn_public_id
    );
  end loop;
  return null;
end
$$;

drop trigger if exists trg_validate_changed_structural_txn on txns;
create constraint trigger trg_validate_changed_structural_txn
after insert or update on txns
deferrable initially deferred
for each row execute function validate_changed_structural_txn();

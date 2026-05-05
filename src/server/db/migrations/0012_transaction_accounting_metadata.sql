alter table txns
  add column if not exists txn_type text not null default 'standard';

alter table txns
  add column if not exists parent_public_id text null;

alter table txns
  add column if not exists source_public_id text null;

alter table txns
  add column if not exists transfer_project_id text null references projects(id) on delete set null;

alter table txns
  add column if not exists budget_impact boolean not null default true;

alter table txns
  add column if not exists categorisable boolean not null default true;

alter table txns
  drop constraint if exists txns_txn_type_check;

alter table txns
  add constraint txns_txn_type_check
  check (txn_type in ('standard', 'split_parent', 'split_child', 'transfer_source', 'transfer_child'));

alter table txns
  drop constraint if exists txns_uncategorisable_has_no_coding_check;

alter table txns
  add constraint txns_uncategorisable_has_no_coding_check
  check (
    categorisable
    or (
      category_id is null
      and sub_category_id is null
      and company_default_mapping_rule_id is null
      and coding_source is null
      and coding_pending_approval = false
    )
  );

create index if not exists idx_txns_project_parent_public_id
  on txns(project_id, parent_public_id)
  where parent_public_id is not null;

create index if not exists idx_txns_project_source_public_id
  on txns(project_id, source_public_id)
  where source_public_id is not null;

create index if not exists idx_txns_transfer_project_id
  on txns(transfer_project_id)
  where transfer_project_id is not null;

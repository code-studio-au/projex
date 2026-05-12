alter table projects
  add column if not exists allow_txn_transfers boolean not null default false;

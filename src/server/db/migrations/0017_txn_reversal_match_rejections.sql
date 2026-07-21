create table if not exists txn_reversal_match_rejections (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  source_txn_public_id text not null,
  counterpart_txn_public_id text not null,
  rejected_at timestamptz not null default now(),
  rejected_by_user_id text null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint txn_reversal_match_rejections_source_txn_fk
    foreign key (project_id, source_txn_public_id)
    references txns(project_id, public_id)
    on delete cascade,
  constraint txn_reversal_match_rejections_counterpart_txn_fk
    foreign key (project_id, counterpart_txn_public_id)
    references txns(project_id, public_id)
    on delete cascade,
  constraint txn_reversal_match_rejections_distinct_txns_check
    check (source_txn_public_id <> counterpart_txn_public_id),
  unique (project_id, source_txn_public_id, counterpart_txn_public_id)
);

create index if not exists idx_txn_reversal_match_rejections_project_source
  on txn_reversal_match_rejections(project_id, source_txn_public_id);

create index if not exists idx_txn_reversal_match_rejections_project_counterpart
  on txn_reversal_match_rejections(project_id, counterpart_txn_public_id);

create table if not exists txn_reversals (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  source_txn_public_id text not null,
  matched_reversal_txn_public_id text null,
  expected_project_id text null references projects(id) on delete set null,
  status text not null check (
    status in ('pending_reversal', 'reversed_matched', 'reversal_exception')
  ),
  marked_at timestamptz not null default now(),
  marked_by_user_id text not null references users(id),
  matched_at timestamptz null,
  matched_by_user_id text null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint txn_reversals_source_txn_fk
    foreign key (project_id, source_txn_public_id)
    references txns(project_id, public_id)
    on delete cascade,
  constraint txn_reversals_matched_txn_fk
    foreign key (project_id, matched_reversal_txn_public_id)
    references txns(project_id, public_id)
    on delete cascade,
  constraint txn_reversals_matched_consistency_check check (
    (
      status = 'reversed_matched'
      and matched_reversal_txn_public_id is not null
      and matched_reversal_txn_public_id <> source_txn_public_id
      and matched_at is not null
      and matched_by_user_id is not null
    )
    or (
      status in ('pending_reversal', 'reversal_exception')
      and matched_reversal_txn_public_id is null
      and matched_at is null
      and matched_by_user_id is null
    )
  ),
  unique (project_id, source_txn_public_id)
);

create unique index if not exists uq_txn_reversals_project_matched_txn
  on txn_reversals(project_id, matched_reversal_txn_public_id)
  where matched_reversal_txn_public_id is not null;

create index if not exists idx_txn_reversals_project_status
  on txn_reversals(project_id, status, marked_at desc);

create index if not exists idx_txn_reversals_expected_project
  on txn_reversals(expected_project_id)
  where expected_project_id is not null;

-- 0015_transaction_review_workflow.sql
-- Explicit transaction review and lock state.

alter table txns
  add column if not exists reviewed_at timestamptz null,
  add column if not exists reviewed_by_user_id text null references users(id) on delete set null,
  add column if not exists locked_at timestamptz null,
  add column if not exists locked_by_user_id text null references users(id) on delete set null;

alter table txns
  drop constraint if exists txns_reviewed_consistency_check;

alter table txns
  add constraint txns_reviewed_consistency_check check (
    (reviewed_at is null and reviewed_by_user_id is null)
    or (reviewed_at is not null and reviewed_by_user_id is not null)
  );

alter table txns
  drop constraint if exists txns_locked_consistency_check;

alter table txns
  add constraint txns_locked_consistency_check check (
    (locked_at is null and locked_by_user_id is null)
    or (
      locked_at is not null
      and locked_by_user_id is not null
      and reviewed_at is not null
      and reviewed_by_user_id is not null
    )
  );

create index if not exists idx_txns_project_reviewed
  on txns(project_id, reviewed_at)
  where reviewed_at is not null;

create index if not exists idx_txns_project_locked
  on txns(project_id, locked_at)
  where locked_at is not null;

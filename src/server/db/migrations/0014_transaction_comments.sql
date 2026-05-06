-- 0014_transaction_comments.sql
-- Threaded transaction comments with assignment and resolution metadata.

create table if not exists txn_comments (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  txn_public_id text not null,
  parent_comment_id text null references txn_comments(id) on delete cascade,
  body text not null check (length(trim(body)) > 0 and length(body) <= 2000),
  assigned_to_user_id text null references users(id) on delete set null,
  created_by_user_id text not null references users(id),
  resolved_at timestamptz null,
  resolved_by_user_id text null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint txn_comments_resolved_consistency_check check (
    (resolved_at is null and resolved_by_user_id is null)
    or (resolved_at is not null and resolved_by_user_id is not null)
  ),
  constraint txn_comments_txn_fk foreign key (project_id, txn_public_id)
    references txns(project_id, public_id)
    on delete cascade
);

create index if not exists idx_txn_comments_project_txn_created
  on txn_comments(project_id, txn_public_id, created_at, id);

create index if not exists idx_txn_comments_parent
  on txn_comments(parent_comment_id)
  where parent_comment_id is not null;

create index if not exists idx_txn_comments_assigned_to
  on txn_comments(assigned_to_user_id)
  where assigned_to_user_id is not null;

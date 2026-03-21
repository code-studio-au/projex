create table if not exists email_change_requests (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  current_email text not null,
  new_email text not null,
  token_hash text not null unique,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz null
);

create index if not exists idx_email_change_requests_user
  on email_change_requests(user_id, requested_at desc);

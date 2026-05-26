create table if not exists request_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null,
  count integer not null check (count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists idx_request_rate_limits_updated_at
  on request_rate_limits (updated_at);

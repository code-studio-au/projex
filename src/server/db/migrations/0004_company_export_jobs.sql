create table if not exists company_export_jobs (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  created_by_user_id text not null references users(id) on delete restrict,
  scope text not null check (scope in ('all', 'active')),
  detail text not null check (detail in ('full', 'summary')),
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  from_date date null,
  to_date date null,
  file_name text null,
  content_type text null,
  file_bytes bytea null,
  file_size_bytes integer null check (file_size_bytes is null or file_size_bytes >= 0),
  error_message text null,
  requested_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  failed_at timestamptz null,
  expires_at timestamptz null,
  last_heartbeat_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint company_export_jobs_date_range_check check (
    from_date is null or to_date is null or from_date <= to_date
  )
);

create index if not exists idx_company_export_jobs_company_requested
  on company_export_jobs(company_id, requested_at desc);

create index if not exists idx_company_export_jobs_creator_requested
  on company_export_jobs(created_by_user_id, requested_at desc);

create index if not exists idx_company_export_jobs_status_requested
  on company_export_jobs(status, requested_at desc);

create index if not exists idx_company_export_jobs_expires
  on company_export_jobs(expires_at)
  where expires_at is not null;

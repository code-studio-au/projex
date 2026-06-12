create table if not exists company_export_presets (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  name text not null,
  scope text not null check (scope in ('all', 'active')),
  detail text not null check (detail in ('full', 'summary')),
  from_date date null,
  to_date date null,
  created_by_user_id text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_export_presets_date_range_check check (
    from_date is null or to_date is null or from_date <= to_date
  )
);

create unique index if not exists uq_company_export_presets_company_lower_name
  on company_export_presets(company_id, lower(name));

create index if not exists idx_company_export_presets_company_updated
  on company_export_presets(company_id, updated_at desc, created_at desc);

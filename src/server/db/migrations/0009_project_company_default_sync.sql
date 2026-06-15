alter table projects
  add column if not exists sync_company_defaults boolean not null default false;

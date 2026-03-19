alter table projects
  add column if not exists allow_superadmin_access boolean not null default true;

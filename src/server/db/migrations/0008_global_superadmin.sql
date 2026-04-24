alter table users
  add column if not exists is_global_superadmin boolean not null default false;

update users u
set is_global_superadmin = true
where exists (
  select 1
  from company_memberships m
  where m.user_id = u.id
    and m.role = 'superadmin'
);

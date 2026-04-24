alter table company_memberships
  drop constraint if exists company_memberships_role_check;

alter table company_memberships
  add constraint company_memberships_role_check
  check (role in ('admin', 'executive', 'management', 'member'));

alter table users
  add column if not exists disabled_reason text null
  check (disabled_reason in ('company_deactivated', 'admin_disabled'));

alter table projects
  add column if not exists budget_total_cents bigint not null default 0

alter table company_export_jobs
  add column if not exists notify_when_ready boolean not null default false,
  add column if not exists notify_email text null,
  add column if not exists ready_notification_status text not null default 'not_requested',
  add column if not exists ready_notification_delivery text null,
  add column if not exists ready_notification_sent_at timestamptz null,
  add column if not exists ready_notification_error text null;

alter table company_export_jobs
  drop constraint if exists company_export_jobs_ready_notification_status_check;

alter table company_export_jobs
  add constraint company_export_jobs_ready_notification_status_check
  check (ready_notification_status in ('not_requested', 'pending', 'sent', 'failed'));

alter table company_export_jobs
  drop constraint if exists company_export_jobs_ready_notification_delivery_check;

alter table company_export_jobs
  add constraint company_export_jobs_ready_notification_delivery_check
  check (
    ready_notification_delivery is null
    or ready_notification_delivery in ('email', 'log')
  );

create index if not exists idx_company_export_jobs_ready_notification_status
  on company_export_jobs(ready_notification_status, requested_at desc);

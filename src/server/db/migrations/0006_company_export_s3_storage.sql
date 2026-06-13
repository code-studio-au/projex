delete from company_export_jobs;

alter table company_export_jobs
  drop column if exists file_bytes;

alter table company_export_jobs
  add column if not exists storage_bucket text null,
  add column if not exists storage_key text null,
  add column if not exists storage_etag text null;

alter table company_export_jobs
  drop constraint if exists company_export_jobs_completed_storage_check;

alter table company_export_jobs
  add constraint company_export_jobs_completed_storage_check
  check (
    status <> 'completed'
    or (
      file_name is not null
      and content_type is not null
      and file_size_bytes is not null
      and storage_bucket is not null
      and storage_key is not null
    )
  );

create index if not exists idx_company_export_jobs_storage_lookup
  on company_export_jobs(storage_bucket, storage_key)
  where storage_bucket is not null and storage_key is not null;

alter table import_batches
  add column if not exists preview_from_date date null,
  add column if not exists preview_to_date date null;

with preview_periods as (
  select
    batch_id,
    min((preview_plan ->> 'parsedDate')::date) as preview_from_date,
    max((preview_plan ->> 'parsedDate')::date) as preview_to_date
  from import_candidates
  where preview_plan ->> 'parsedDate' ~ '^\d{4}-\d{2}-\d{2}$'
  group by batch_id
)
update import_batches as batch
set
  preview_from_date = period.preview_from_date,
  preview_to_date = period.preview_to_date
from preview_periods as period
where batch.id = period.batch_id
  and batch.preview_from_date is null
  and batch.preview_to_date is null;

alter table import_batches
  drop constraint if exists import_batches_preview_period_check,
  add constraint import_batches_preview_period_check
    check (
      (preview_from_date is null and preview_to_date is null)
      or (
        preview_from_date is not null
        and preview_to_date is not null
        and preview_from_date <= preview_to_date
      )
    );

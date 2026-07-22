delete from import_batches
where status = 'cancelled';

update import_candidates
set
  status = case
    when txn_public_id is not null then 'imported'
    else 'excluded'
  end,
  updated_at = now()
where status in ('approved', 'rejected');

update import_candidates
set
  status = 'excluded',
  updated_at = now()
where batch_id in (
  select id
  from import_batches
  where status = 'partially_imported'
)
and status in ('ready', 'needs_project_review');

update import_batches
set
  status = 'imported',
  updated_at = now()
where status = 'partially_imported';

alter table import_batches
  drop constraint if exists import_batches_status_check;

alter table import_batches
  add constraint import_batches_status_check
  check (status in ('previewed', 'imported'));

alter table import_candidates
  drop constraint if exists import_candidates_status_check;

alter table import_candidates
  add constraint import_candidates_status_check
  check (status in ('ready', 'excluded', 'needs_project_review', 'imported', 'invalid', 'duplicate'));

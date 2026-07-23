alter table import_batches
  add column if not exists auto_create_structures boolean not null default false;

alter table import_candidates
  add column if not exists preview_plan jsonb null;

alter table import_candidates
  drop constraint if exists import_candidates_preview_plan_object_check;

alter table import_candidates
  add constraint import_candidates_preview_plan_object_check
  check (preview_plan is null or jsonb_typeof(preview_plan) = 'object');

comment on column import_candidates.preview_plan is
  'Immutable canonical import plan produced by preview and consumed by commit.';

alter table txn_reversals
  add column if not exists match_method text null,
  add column if not exists match_score integer null,
  add column if not exists candidate_count integer null,
  add column if not exists match_evidence jsonb null,
  add column if not exists source_snapshot jsonb null,
  add column if not exists counterpart_snapshot jsonb null,
  add column if not exists proposed_at timestamptz null,
  add column if not exists proposed_by_user_id text null references users(id) on delete set null,
  add column if not exists version integer not null default 1;

alter table txn_reversals
  drop constraint if exists txn_reversals_match_method_check,
  add constraint txn_reversals_match_method_check check (
    match_method is null
    or match_method in ('manual', 'auto_clear', 'auto_default')
  ),
  drop constraint if exists txn_reversals_match_score_check,
  add constraint txn_reversals_match_score_check check (
    match_score is null or match_score >= 0
  ),
  drop constraint if exists txn_reversals_candidate_count_check,
  add constraint txn_reversals_candidate_count_check check (
    candidate_count is null or candidate_count > 0
  ),
  drop constraint if exists txn_reversals_match_evidence_object_check,
  add constraint txn_reversals_match_evidence_object_check check (
    match_evidence is null or jsonb_typeof(match_evidence) = 'object'
  ),
  drop constraint if exists txn_reversals_source_snapshot_object_check,
  add constraint txn_reversals_source_snapshot_object_check check (
    source_snapshot is null or jsonb_typeof(source_snapshot) = 'object'
  ),
  drop constraint if exists txn_reversals_counterpart_snapshot_object_check,
  add constraint txn_reversals_counterpart_snapshot_object_check check (
    counterpart_snapshot is null or jsonb_typeof(counterpart_snapshot) = 'object'
  ),
  drop constraint if exists txn_reversals_version_check,
  add constraint txn_reversals_version_check check (version > 0);

update txn_reversals as reversal
set company_id = source.company_id
from txns as source
where source.project_id = reversal.project_id
  and source.public_id = reversal.source_txn_public_id
  and reversal.company_id <> source.company_id;

update txn_reversals as reversal
set match_method = case
      when reversal.status = 'auto_matched_pending_approval'
        then 'auto_clear'
      when reversal.status = 'auto_matched_ambiguous_pending_approval'
        then 'auto_default'
      else 'manual'
    end,
    match_score = null,
    candidate_count = 1,
    match_evidence = jsonb_build_object(
      'legacy', true,
      'reasons', jsonb_build_array('Migrated from an earlier reversal record')
    ),
    proposed_at = coalesce(reversal.matched_at, reversal.updated_at, reversal.marked_at),
    proposed_by_user_id = coalesce(
      reversal.matched_by_user_id,
      reversal.marked_by_user_id
    ),
    source_snapshot = (
      select jsonb_strip_nulls(
        jsonb_build_object(
          'txnId', source.public_id,
          'externalId', source.external_id,
          'date', source.txn_date,
          'item', source.item,
          'description', source.description,
          'amountCents', source.amount_cents,
          'sourceType', source.import_source_type,
          'sourceSystem', coalesce(
            source.import_source_meta ->> 'sourceSystem',
            source.import_source_meta ->> 'Source System',
            source.import_source_meta ->> 'source',
            source.import_source_meta ->> 'Source'
          ),
          'journalDescription', coalesce(
            source.import_source_meta ->> 'journalLineDescription',
            source.import_source_meta ->> 'Journal Line Description'
          ),
          'reference', coalesce(
            source.import_source_meta ->> 'referenceNum',
            source.import_source_meta ->> 'Reference Num',
            source.import_source_meta ->> 'reference',
            source.import_source_meta ->> 'Reference'
          ),
          'costCentre', coalesce(
            source.import_source_meta ->> 'ccAndDescription',
            source.import_source_meta ->> 'CC and Description',
            source.import_source_meta ->> 'costCentre',
            source.import_source_meta ->> 'Cost Centre'
          )
        )
      )
      from txns as source
      where source.company_id = reversal.company_id
        and source.project_id = reversal.project_id
        and source.public_id = reversal.source_txn_public_id
    ),
    counterpart_snapshot = (
      select jsonb_strip_nulls(
        jsonb_build_object(
          'txnId', counterpart.public_id,
          'externalId', counterpart.external_id,
          'date', counterpart.txn_date,
          'item', counterpart.item,
          'description', counterpart.description,
          'amountCents', counterpart.amount_cents,
          'sourceType', counterpart.import_source_type,
          'sourceSystem', coalesce(
            counterpart.import_source_meta ->> 'sourceSystem',
            counterpart.import_source_meta ->> 'Source System',
            counterpart.import_source_meta ->> 'source',
            counterpart.import_source_meta ->> 'Source'
          ),
          'journalDescription', coalesce(
            counterpart.import_source_meta ->> 'journalLineDescription',
            counterpart.import_source_meta ->> 'Journal Line Description'
          ),
          'reference', coalesce(
            counterpart.import_source_meta ->> 'referenceNum',
            counterpart.import_source_meta ->> 'Reference Num',
            counterpart.import_source_meta ->> 'reference',
            counterpart.import_source_meta ->> 'Reference'
          ),
          'costCentre', coalesce(
            counterpart.import_source_meta ->> 'ccAndDescription',
            counterpart.import_source_meta ->> 'CC and Description',
            counterpart.import_source_meta ->> 'costCentre',
            counterpart.import_source_meta ->> 'Cost Centre'
          )
        )
      )
      from txns as counterpart
      where counterpart.company_id = reversal.company_id
        and counterpart.project_id = reversal.project_id
        and counterpart.public_id = reversal.matched_reversal_txn_public_id
    )
where reversal.matched_reversal_txn_public_id is not null
  and (
    reversal.match_method is null
    or reversal.match_evidence is null
    or reversal.source_snapshot is null
    or reversal.counterpart_snapshot is null
    or reversal.proposed_at is null
  );

alter table txn_reversals
  drop constraint if exists txn_reversals_matched_consistency_check;

alter table txn_reversals
  add constraint txn_reversals_matched_consistency_check check (
    (
      status = 'reversed_matched'
      and matched_reversal_txn_public_id is not null
      and matched_reversal_txn_public_id <> source_txn_public_id
      and matched_at is not null
      and matched_by_user_id is not null
      and match_method is not null
      and match_evidence is not null
      and source_snapshot is not null
      and counterpart_snapshot is not null
      and proposed_at is not null
    )
    or (
      status = 'auto_matched_pending_approval'
      and matched_reversal_txn_public_id is not null
      and matched_reversal_txn_public_id <> source_txn_public_id
      and matched_at is null
      and matched_by_user_id is null
      and match_method = 'auto_clear'
      and match_evidence is not null
      and source_snapshot is not null
      and counterpart_snapshot is not null
      and proposed_at is not null
      and candidate_count is not null
    )
    or (
      status = 'auto_matched_ambiguous_pending_approval'
      and matched_reversal_txn_public_id is not null
      and matched_reversal_txn_public_id <> source_txn_public_id
      and matched_at is null
      and matched_by_user_id is null
      and match_method = 'auto_default'
      and match_evidence is not null
      and source_snapshot is not null
      and counterpart_snapshot is not null
      and proposed_at is not null
      and candidate_count is not null
    )
    or (
      status in ('pending_reversal', 'reversal_exception')
      and matched_reversal_txn_public_id is null
      and matched_at is null
      and matched_by_user_id is null
      and match_method is null
      and match_score is null
      and candidate_count is null
      and match_evidence is null
      and source_snapshot is null
      and counterpart_snapshot is null
      and proposed_at is null
      and proposed_by_user_id is null
    )
  );

alter table txn_reversals
  drop constraint if exists txn_reversals_source_txn_fk,
  drop constraint if exists txn_reversals_matched_txn_fk;

alter table txn_reversals
  add constraint txn_reversals_source_txn_fk
    foreign key (company_id, project_id, source_txn_public_id)
    references txns(company_id, project_id, public_id)
    deferrable initially deferred,
  add constraint txn_reversals_matched_txn_fk
    foreign key (company_id, project_id, matched_reversal_txn_public_id)
    references txns(company_id, project_id, public_id)
    deferrable initially deferred;

create or replace function validate_txn_reversal_pair()
returns trigger
language plpgsql
as $$
declare
  source_row txns%rowtype;
  counterpart_row txns%rowtype;
  expected_project_company_id text;
begin
  select *
  into source_row
  from txns
  where company_id = new.company_id
    and project_id = new.project_id
    and public_id = new.source_txn_public_id;

  if not found then
    raise exception using
      errcode = '23503',
      constraint = 'txn_reversals_source_txn_fk',
      message = 'Reversal source transaction does not belong to the reversal project';
  end if;

  if not source_row.budget_impact or source_row.amount_cents <= 0 then
    raise exception using
      errcode = '23514',
      constraint = 'txn_reversals_source_semantics_check',
      message = 'Reversal source must be a positive budget-impact transaction';
  end if;

  if new.expected_project_id is not null then
    select company_id
    into expected_project_company_id
    from projects
    where id = new.expected_project_id;

    if expected_project_company_id is distinct from new.company_id
      or new.expected_project_id = new.project_id
    then
      raise exception using
        errcode = '23514',
        constraint = 'txn_reversals_expected_project_check',
        message = 'Expected reversal project must be a different project in the same company';
    end if;
  end if;

  if new.matched_reversal_txn_public_id is not null then
    select *
    into counterpart_row
    from txns
    where company_id = new.company_id
      and project_id = new.project_id
      and public_id = new.matched_reversal_txn_public_id;

    if not found then
      raise exception using
        errcode = '23503',
        constraint = 'txn_reversals_matched_txn_fk',
        message = 'Reversal counterpart does not belong to the reversal project';
    end if;

    if not counterpart_row.budget_impact
      or counterpart_row.amount_cents >= 0
      or abs(counterpart_row.amount_cents) <> source_row.amount_cents
    then
      raise exception using
        errcode = '23514',
        constraint = 'txn_reversals_counterpart_semantics_check',
        message = 'Reversal counterpart must be an equal and opposite budget-impact transaction';
    end if;

    if counterpart_row.txn_date < source_row.txn_date then
      raise exception using
        errcode = '23514',
        constraint = 'txn_reversals_date_order_check',
        message = 'Reversal counterpart cannot occur before its source transaction';
    end if;

    if new.match_method in ('auto_clear', 'auto_default')
      and counterpart_row.txn_date > source_row.txn_date + interval '62 days'
    then
      raise exception using
        errcode = '23514',
        constraint = 'txn_reversals_auto_match_window_check',
        message = 'Automatic reversal matches must occur within 62 days of the source transaction';
    end if;
  end if;

  if exists (
    select 1
    from txn_reversals as other
    where other.project_id = new.project_id
      and other.id <> new.id
      and (
        other.matched_reversal_txn_public_id = new.source_txn_public_id
        or (
          new.matched_reversal_txn_public_id is not null
          and other.source_txn_public_id = new.matched_reversal_txn_public_id
        )
      )
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'txn_reversals_unique_participant_check',
      message = 'A transaction cannot participate in more than one reversal pair';
  end if;

  return new;
end
$$;

drop trigger if exists trg_validate_txn_reversal_pair on txn_reversals;
create constraint trigger trg_validate_txn_reversal_pair
after insert or update on txn_reversals
deferrable initially deferred
for each row execute function validate_txn_reversal_pair();

create or replace function protect_reversal_linked_txn_identity()
returns trigger
language plpgsql
as $$
begin
  if (
    old.company_id is distinct from new.company_id
    or old.project_id is distinct from new.project_id
    or old.txn_date is distinct from new.txn_date
    or old.item is distinct from new.item
    or old.description is distinct from new.description
    or old.amount_cents is distinct from new.amount_cents
    or old.external_id is distinct from new.external_id
    or old.txn_type is distinct from new.txn_type
    or old.budget_impact is distinct from new.budget_impact
    or old.import_source_type is distinct from new.import_source_type
    or old.import_source_meta is distinct from new.import_source_meta
  ) and exists (
    select 1
    from txn_reversals as reversal
    where reversal.project_id = old.project_id
      and (
        reversal.source_txn_public_id = old.public_id
        or reversal.matched_reversal_txn_public_id = old.public_id
      )
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'txns_reversal_identity_immutable_check',
      message = 'Reversal-linked transaction identity cannot be changed until the reversal workflow is resolved';
  end if;

  return new;
end
$$;

drop trigger if exists trg_protect_reversal_linked_txn_identity on txns;
create trigger trg_protect_reversal_linked_txn_identity
before update on txns
for each row execute function protect_reversal_linked_txn_identity();

create index if not exists idx_txns_reversal_candidates
  on txns(project_id, amount_cents, txn_date)
  where budget_impact = true and locked_at is null;

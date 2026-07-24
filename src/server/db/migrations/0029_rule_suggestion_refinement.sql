alter table rule_suggestion_signals
  drop constraint if exists rule_suggestion_signals_suggestion_type_check,
  drop constraint if exists uq_rule_suggestion_signals_txn_type;

alter table rule_suggestion_signals
  add column if not exists source_rule_id text null
    references company_default_mapping_rules(id) on delete cascade,
  add constraint rule_suggestion_signals_suggestion_type_check
    check (suggestion_type in ('create_rule', 'update_rule')),
  add constraint ck_rule_suggestion_signals_source_rule
    check (
      (suggestion_type = 'create_rule' and source_rule_id is null)
      or
      (suggestion_type = 'update_rule' and source_rule_id is not null)
    ),
  add constraint uq_rule_suggestion_signals_txn
    unique (txn_public_id);

drop index if exists idx_rule_suggestion_signals_company_lookup;

create index idx_rule_suggestion_signals_company_lookup
  on rule_suggestion_signals(
    company_id,
    suggestion_type,
    source_rule_id,
    pattern_text_normalized,
    company_default_sub_category_id
  );

alter table rule_suggestions
  drop constraint if exists rule_suggestions_suggestion_type_check,
  drop constraint if exists uq_rule_suggestions_company_key;

alter table rule_suggestions
  add column if not exists source_rule_id text null
    references company_default_mapping_rules(id) on delete cascade,
  add column if not exists pattern_basis text not null default 'item',
  add column if not exists distinct_txn_date_count integer not null default 1
    check (distinct_txn_date_count >= 0),
  add column if not exists distinct_project_count integer not null default 1
    check (distinct_project_count >= 0),
  add column if not exists confidence_score integer not null default 0
    check (confidence_score between 0 and 100),
  add column if not exists match_text_alternatives text[] not null
    default '{}'::text[],
  add column if not exists recommended_action text not null
    default 'create_rule'
    check (
      recommended_action in (
        'create_rule',
        'update_existing',
        'create_narrower'
      )
    ),
  add column if not exists accepted_action text null
    check (
      accepted_action is null
      or accepted_action in (
        'create_rule',
        'update_existing',
        'create_narrower'
      )
    ),
  add column if not exists dismissed_reason text null
    check (
      dismissed_reason is null
      or dismissed_reason in (
        'noise',
        'one_off',
        'too_broad',
        'intentional_manual',
        'other'
      )
    ),
  add column if not exists dismissed_sample_count integer null
    check (
      dismissed_sample_count is null
      or dismissed_sample_count >= 0
    ),
  add constraint rule_suggestions_suggestion_type_check
    check (suggestion_type in ('create_rule', 'update_rule')),
  add constraint rule_suggestions_pattern_basis_check
    check (pattern_basis in ('item', 'description', 'item_description')),
  add constraint ck_rule_suggestions_source_rule
    check (
      (suggestion_type = 'create_rule' and source_rule_id is null)
      or
      (suggestion_type = 'update_rule' and source_rule_id is not null)
    );

create unique index uq_rule_suggestions_create_key
  on rule_suggestions(
    company_id,
    pattern_text_normalized,
    company_default_sub_category_id
  )
  where suggestion_type = 'create_rule' and source_rule_id is null;

create unique index uq_rule_suggestions_update_key
  on rule_suggestions(
    company_id,
    source_rule_id,
    pattern_text_normalized,
    company_default_sub_category_id
  )
  where suggestion_type = 'update_rule' and source_rule_id is not null;

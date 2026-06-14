create table if not exists rule_suggestion_signals (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  txn_public_id text not null,
  suggestion_type text not null check (suggestion_type in ('create_rule')),
  pattern_basis text not null check (
    pattern_basis in ('item', 'description', 'item_description')
  ),
  pattern_text_raw text not null,
  pattern_text_normalized text not null,
  project_category_id text not null references categories(id) on delete cascade,
  project_sub_category_id text not null references sub_categories(id) on delete cascade,
  company_default_category_id text not null references company_default_categories(id) on delete cascade,
  company_default_sub_category_id text not null references company_default_sub_categories(id) on delete cascade,
  acted_by_user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_rule_suggestion_signals_txn
    foreign key (project_id, txn_public_id)
    references txns(project_id, public_id)
    on delete cascade,
  constraint uq_rule_suggestion_signals_txn_type
    unique (txn_public_id, suggestion_type)
);

create index if not exists idx_rule_suggestion_signals_company_lookup
  on rule_suggestion_signals(
    company_id,
    suggestion_type,
    pattern_text_normalized,
    company_default_sub_category_id
  );

create table if not exists rule_suggestions (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  status text not null check (status in ('open', 'accepted', 'dismissed')),
  suggestion_type text not null check (suggestion_type in ('create_rule')),
  pattern_text_normalized text not null,
  proposed_match_text text not null,
  project_category_id text not null references categories(id) on delete cascade,
  project_sub_category_id text not null references sub_categories(id) on delete cascade,
  company_default_category_id text not null references company_default_categories(id) on delete cascade,
  company_default_sub_category_id text not null references company_default_sub_categories(id) on delete cascade,
  sample_count integer not null check (sample_count >= 0),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  accepted_rule_id text null references company_default_mapping_rules(id) on delete set null,
  accepted_at timestamptz null,
  accepted_by_user_id text null references users(id) on delete set null,
  dismissed_at timestamptz null,
  dismissed_by_user_id text null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_rule_suggestions_company_key
    unique (
      company_id,
      suggestion_type,
      pattern_text_normalized,
      company_default_sub_category_id
    )
);

create index if not exists idx_rule_suggestions_company_status
  on rule_suggestions(company_id, status, updated_at desc);

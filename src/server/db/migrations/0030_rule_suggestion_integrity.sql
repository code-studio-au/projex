alter table rule_suggestion_signals
  drop constraint if exists uq_rule_suggestion_signals_txn,
  add constraint uq_rule_suggestion_signals_project_txn
    unique (project_id, txn_public_id);

-- Company suggestions are derived from company-default targets. Project
-- taxonomy IDs are evidence provenance, not stable company-level identity.
alter table rule_suggestion_signals
  drop column if exists project_category_id,
  drop column if exists project_sub_category_id;

alter table rule_suggestions
  drop column if exists project_category_id,
  drop column if exists project_sub_category_id;

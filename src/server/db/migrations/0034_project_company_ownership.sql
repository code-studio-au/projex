create unique index if not exists uq_projects_company_id_id
  on projects(company_id, id);

create unique index if not exists uq_import_batches_company_project_id
  on import_batches(company_id, project_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_projects_parent_company'
  ) then
    alter table projects
      add constraint fk_projects_parent_company
      foreign key (company_id, parent_project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_budget_lines_project_company'
  ) then
    alter table budget_lines
      add constraint fk_budget_lines_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_categories_project_company'
  ) then
    alter table categories
      add constraint fk_categories_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_sub_categories_project_company'
  ) then
    alter table sub_categories
      add constraint fk_sub_categories_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_import_batches_project_company'
  ) then
    alter table import_batches
      add constraint fk_import_batches_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_import_candidates_project_company'
  ) then
    alter table import_candidates
      add constraint fk_import_candidates_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_import_candidates_batch_scope'
  ) then
    alter table import_candidates
      add constraint fk_import_candidates_batch_scope
      foreign key (company_id, project_id, batch_id)
      references import_batches(company_id, project_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_import_rules_project_company'
  ) then
    alter table import_rules
      add constraint fk_import_rules_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_project_auto_coding_rules_project_company'
  ) then
    alter table project_auto_coding_rules
      add constraint fk_project_auto_coding_rules_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_rule_suggestion_signals_project_company'
  ) then
    alter table rule_suggestion_signals
      add constraint fk_rule_suggestion_signals_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txn_comments_project_company'
  ) then
    alter table txn_comments
      add constraint fk_txn_comments_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txn_reversal_rejections_project_company'
  ) then
    alter table txn_reversal_match_rejections
      add constraint fk_txn_reversal_rejections_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txn_reversals_project_company'
  ) then
    alter table txn_reversals
      add constraint fk_txn_reversals_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txn_reversals_expected_project_company'
  ) then
    alter table txn_reversals
      add constraint fk_txn_reversals_expected_project_company
      foreign key (company_id, expected_project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txns_project_company'
  ) then
    alter table txns
      add constraint fk_txns_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txns_transfer_project_company'
  ) then
    alter table txns
      add constraint fk_txns_transfer_project_company
      foreign key (company_id, transfer_project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txn_unlock_requests_project_company'
  ) then
    alter table txn_unlock_requests
      add constraint fk_txn_unlock_requests_project_company
      foreign key (company_id, project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txn_links_source_project_company'
  ) then
    alter table txn_links
      add constraint fk_txn_links_source_project_company
      foreign key (company_id, source_project_id)
      references projects(company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txn_links_target_project_company'
  ) then
    alter table txn_links
      add constraint fk_txn_links_target_project_company
      foreign key (company_id, target_project_id)
      references projects(company_id, id);
  end if;
end
$$;

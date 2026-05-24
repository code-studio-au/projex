alter table budget_lines
  validate constraint fk_budget_lines_project_category;

alter table budget_lines
  validate constraint fk_budget_lines_project_sub_category;

alter table txns
  validate constraint fk_txns_project_category;

alter table txns
  validate constraint fk_txns_project_sub_category;

alter table txns
  validate constraint fk_txns_company_default_mapping_rule;

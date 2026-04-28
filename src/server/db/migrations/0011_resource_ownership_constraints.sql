create unique index if not exists uq_categories_project_id
  on categories(project_id, id);

create unique index if not exists uq_sub_categories_project_id
  on sub_categories(project_id, id);

create unique index if not exists uq_company_default_mapping_rules_company_id
  on company_default_mapping_rules(company_id, id);

alter table budget_lines
  add constraint fk_budget_lines_project_category
  foreign key (project_id, category_id)
  references categories(project_id, id)
  not valid;

alter table budget_lines
  add constraint fk_budget_lines_project_sub_category
  foreign key (project_id, sub_category_id)
  references sub_categories(project_id, id)
  not valid;

alter table txns
  add constraint fk_txns_project_category
  foreign key (project_id, category_id)
  references categories(project_id, id)
  not valid;

alter table txns
  add constraint fk_txns_project_sub_category
  foreign key (project_id, sub_category_id)
  references sub_categories(project_id, id)
  not valid;

alter table txns
  add constraint fk_txns_company_default_mapping_rule
  foreign key (company_id, company_default_mapping_rule_id)
  references company_default_mapping_rules(company_id, id)
  not valid;

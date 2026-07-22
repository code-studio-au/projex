-- Keep the legacy category columns rollback-compatible while making the
-- subcategory relationship authoritative and impossible to drift.
update company_default_mapping_rules as rule
set company_default_category_id = sub.company_default_category_id,
    updated_at = now()
from company_default_sub_categories as sub
where sub.company_id = rule.company_id
  and sub.id = rule.company_default_sub_category_id
  and rule.company_default_category_id <> sub.company_default_category_id;

update project_auto_coding_rules as rule
set category_id = sub.category_id,
    updated_at = now()
from sub_categories as sub
where sub.project_id = rule.project_id
  and sub.id = rule.sub_category_id
  and rule.category_id <> sub.category_id;

create unique index if not exists uq_company_default_sub_categories_rule_target
  on company_default_sub_categories(company_id, id, company_default_category_id);

create unique index if not exists uq_project_sub_categories_rule_target
  on sub_categories(project_id, id, category_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_company_default_mapping_rule_subcategory_target'
  ) then
    alter table company_default_mapping_rules
      add constraint fk_company_default_mapping_rule_subcategory_target
      foreign key (
        company_id,
        company_default_sub_category_id,
        company_default_category_id
      )
      references company_default_sub_categories (
        company_id,
        id,
        company_default_category_id
      )
      on update cascade
      on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_project_auto_coding_rule_subcategory_target'
  ) then
    alter table project_auto_coding_rules
      add constraint fk_project_auto_coding_rule_subcategory_target
      foreign key (project_id, sub_category_id, category_id)
      references sub_categories (project_id, id, category_id)
      on update cascade
      on delete cascade;
  end if;
end
$$;

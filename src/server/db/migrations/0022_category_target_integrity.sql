-- Derived suggestion rows are safe to discard if old data crossed tenant or
-- project boundaries. Core financial rows already have project-scoped FKs.
delete from rule_suggestion_signals as signal
using sub_categories as sub
where sub.id = signal.project_sub_category_id
  and sub.project_id <> signal.project_id;

delete from rule_suggestion_signals as signal
using company_default_sub_categories as sub
where sub.id = signal.company_default_sub_category_id
  and sub.company_id <> signal.company_id;

delete from rule_suggestions as suggestion
using company_default_sub_categories as sub
where sub.id = suggestion.company_default_sub_category_id
  and sub.company_id <> suggestion.company_id;

-- The subcategory owns category identity. Repair every redundant category
-- column before enforcing that invariant relationally.
update txns as txn
set category_id = sub.category_id,
    updated_at = now()
from sub_categories as sub
where sub.project_id = txn.project_id
  and sub.id = txn.sub_category_id
  and txn.category_id is distinct from sub.category_id;

update budget_lines as budget
set category_id = sub.category_id,
    updated_at = now()
from sub_categories as sub
where sub.project_id = budget.project_id
  and sub.id = budget.sub_category_id
  and budget.category_id is distinct from sub.category_id;

update rule_suggestion_signals as signal
set project_category_id = sub.category_id,
    updated_at = now()
from sub_categories as sub
where sub.project_id = signal.project_id
  and sub.id = signal.project_sub_category_id
  and signal.project_category_id <> sub.category_id;

update rule_suggestion_signals as signal
set company_default_category_id = sub.company_default_category_id,
    updated_at = now()
from company_default_sub_categories as sub
where sub.company_id = signal.company_id
  and sub.id = signal.company_default_sub_category_id
  and signal.company_default_category_id <> sub.company_default_category_id;

update rule_suggestions as suggestion
set project_category_id = sub.category_id,
    updated_at = now()
from sub_categories as sub
where sub.id = suggestion.project_sub_category_id
  and suggestion.project_category_id <> sub.category_id;

update rule_suggestions as suggestion
set company_default_category_id = sub.company_default_category_id,
    updated_at = now()
from company_default_sub_categories as sub
where sub.company_id = suggestion.company_id
  and sub.id = suggestion.company_default_sub_category_id
  and suggestion.company_default_category_id <> sub.company_default_category_id;

create unique index if not exists uq_project_sub_categories_category_target
  on sub_categories(id, category_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'txns_subcategory_requires_category_check'
  ) then
    alter table txns
      add constraint txns_subcategory_requires_category_check
      check (sub_category_id is null or category_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'budget_lines_subcategory_requires_category_check'
  ) then
    alter table budget_lines
      add constraint budget_lines_subcategory_requires_category_check
      check (sub_category_id is null or category_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_txns_subcategory_category_target'
  ) then
    alter table txns
      add constraint fk_txns_subcategory_category_target
      foreign key (project_id, sub_category_id, category_id)
      references sub_categories(project_id, id, category_id)
      on update cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_budget_lines_subcategory_category_target'
  ) then
    alter table budget_lines
      add constraint fk_budget_lines_subcategory_category_target
      foreign key (project_id, sub_category_id, category_id)
      references sub_categories(project_id, id, category_id)
      on update cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_rule_suggestion_signals_project_target'
  ) then
    alter table rule_suggestion_signals
      add constraint fk_rule_suggestion_signals_project_target
      foreign key (
        project_id,
        project_sub_category_id,
        project_category_id
      )
      references sub_categories(project_id, id, category_id)
      on update cascade
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_rule_suggestion_signals_company_target'
  ) then
    alter table rule_suggestion_signals
      add constraint fk_rule_suggestion_signals_company_target
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

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_rule_suggestions_project_target'
  ) then
    alter table rule_suggestions
      add constraint fk_rule_suggestions_project_target
      foreign key (project_sub_category_id, project_category_id)
      references sub_categories(id, category_id)
      on update cascade
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_rule_suggestions_company_target'
  ) then
    alter table rule_suggestions
      add constraint fk_rule_suggestions_company_target
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

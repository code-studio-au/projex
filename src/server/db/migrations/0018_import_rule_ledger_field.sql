alter table import_rules
  drop constraint if exists import_rules_field_check;

alter table import_rules
  add constraint import_rules_field_check
  check (field in ('ledger', 'source', 'journalId', 'journalLineDescription', 'ccAndDescription', 'vendorName', 'poId', 'referenceNum', 'anyText'));

insert into import_rules (
  id,
  company_id,
  name,
  action,
  field,
  operator,
  value,
  sort_order,
  enabled,
  created_at,
  updated_at
)
select
  'impr_exclude_non_actual_' || md5(companies.id),
  companies.id,
  'Exclude non-actual ledger/footer rows',
  'exclude',
  'ledger',
  'regex',
  '^(?!\s*actuals?\s*$).*$',
  5,
  true,
  now(),
  now()
from companies
where not exists (
  select 1
  from import_rules
  where import_rules.company_id = companies.id
    and import_rules.name = 'Exclude non-actual ledger/footer rows'
);

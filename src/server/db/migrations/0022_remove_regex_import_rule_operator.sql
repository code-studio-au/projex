alter table import_rules
  drop constraint if exists import_rules_operator_check;

update import_rules
set operator = 'contains_any',
    value = '4041,4141,salaries trf',
    updated_at = now()
where operator = 'regex'
  and field = 'ccAndDescription'
  and value = '^(4041|4141)\b|salaries trf';

update import_rules
set operator = 'contains_any',
    value = 'sal,salary,salaries,payroll,wage,wages,suspense,trf',
    updated_at = now()
where operator = 'regex'
  and field = 'journalLineDescription'
  and value = '\b(sal|salary|salaries|payroll|wages?|suspense|trf)\b';

update import_rules
set operator = 'starts_with_any',
    value = '4103,4104,4420,4421,4422',
    updated_at = now()
where operator = 'regex'
  and field = 'ccAndDescription'
  and value = '^(4103|4104|4420|4421|4422)\b';

delete from import_rules
where operator = 'regex'
  and field = 'ledger'
  and value = '^(?!\s*actuals?\s*$).*$';

update import_rules
set operator = 'contains',
    enabled = false,
    name = concat(name, ' (disabled: replace removed regex rule)'),
    updated_at = now()
where operator = 'regex';

alter table import_rules
  add constraint import_rules_operator_check
  check (
    operator in (
      'equals',
      'equals_any',
      'contains',
      'contains_any',
      'starts_with',
      'starts_with_any',
      'ends_with',
      'ends_with_any'
    )
  );

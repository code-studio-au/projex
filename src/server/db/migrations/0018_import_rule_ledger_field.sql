alter table import_rules
  drop constraint if exists import_rules_field_check;

alter table import_rules
  add constraint import_rules_field_check
  check (field in ('ledger', 'source', 'journalId', 'journalLineDescription', 'ccAndDescription', 'vendorName', 'poId', 'referenceNum', 'anyText'));

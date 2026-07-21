create index if not exists idx_txns_project_date_id
  on txns(project_id, txn_date desc, id desc);

create extension if not exists pg_trgm;

alter table txns
  add column if not exists search_text text not null default '';

create or replace function refresh_txn_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text := lower(
    coalesce(new.item, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(new.external_id, '') || ' ' ||
    replace(coalesce(new.import_source_type, ''), '_', ' ') || ' ' ||
    coalesce(new.import_source_meta::text, '')
  );
  return new;
end
$$;

drop trigger if exists trg_refresh_txn_search_text on txns;

create trigger trg_refresh_txn_search_text
before insert or update of
  item,
  description,
  external_id,
  import_source_type,
  import_source_meta
on txns
for each row
execute function refresh_txn_search_text();

create index if not exists idx_txns_search_text_trgm
  on txns using gin (search_text gin_trgm_ops);

update txns
set search_text = lower(
  coalesce(item, '') || ' ' ||
  coalesce(description, '') || ' ' ||
  coalesce(external_id, '') || ' ' ||
  replace(coalesce(import_source_type, ''), '_', ' ') || ' ' ||
  coalesce(import_source_meta::text, '')
);

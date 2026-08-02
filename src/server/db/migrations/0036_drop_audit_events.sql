-- The current application stopped writing database audit events in this
-- release, but the immediately previous release still requires this table for
-- every protected mutation. Keep this migration name as an intentionally
-- non-destructive compatibility marker so application rollback to N-1 remains
-- safe. A later contract release may remove the legacy table only after the
-- logger-only application is no longer the rollback candidate.
do $$
begin
  null;
end
$$;

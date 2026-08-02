-- Audit telemetry now leaves the application through the structured server
-- logger. Keeping a second PostgreSQL sink creates unbounded duplicate storage
-- and inconsistent enable/disable behavior.
drop table if exists audit_events;
drop function if exists prevent_audit_event_mutation();

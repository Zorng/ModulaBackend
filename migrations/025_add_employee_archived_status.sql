-- Migration: Add ARCHIVED to employee status enum/check constraint
-- Purpose: Staff Management requires ARCHIVED staff memberships (counts toward hard limit).
-- Notes: This project uses re-playable SQL migrations (no schema_migrations table),
-- so statements must be idempotent.

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_status_check;

ALTER TABLE employees
  ADD CONSTRAINT employees_status_check
  CHECK (status IN ('ACTIVE','INVITED','DISABLED','ARCHIVED'));


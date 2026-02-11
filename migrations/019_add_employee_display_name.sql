-- Add optional display name ("username") for employees
-- Idempotent: safe to run multiple times

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);


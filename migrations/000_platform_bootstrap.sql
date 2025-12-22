-- Platform bootstrap migration
-- Purpose: Centralize shared extensions and helper functions used across modules.
-- Notes:
--  - This migration must run before others (filename sorting ensures that).

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- gin_trgm_ops (name search)

-- Shared trigger function to auto-update updated_at columns
CREATE OR REPLACE FUNCTION update_row_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


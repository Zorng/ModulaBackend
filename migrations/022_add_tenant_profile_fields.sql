-- Migration: Extend tenants with profile fields
-- Purpose: Support business profile (name/logo/contact) per modSpec/tenant_module.md
-- Notes: Migrations are replayed; keep idempotent.

-- Add tenant profile fields
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_address TEXT;

-- Ensure tenants.updated_at is maintained (reuses update_row_updated_at from earlier migrations)
DROP TRIGGER IF EXISTS trigger_tenants_updated_at ON tenants;
CREATE TRIGGER trigger_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();


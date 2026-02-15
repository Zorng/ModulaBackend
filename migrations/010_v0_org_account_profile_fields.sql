-- Phase F1 (OrgAccount Core)
-- Extend tenant/branch profiles for backend-owned context hydration.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(32),
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(32);

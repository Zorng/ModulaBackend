-- v0 restart baseline
-- Tenant memberships with explicit invitation lifecycle.

CREATE TABLE IF NOT EXISTS v0_tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role_key VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN (
    'INVITED',
    'ACTIVE',
    'REJECTED',
    'DISABLED',
    'ARCHIVED'
  )),
  invited_by_membership_id UUID REFERENCES v0_tenant_memberships(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_v0_tenant_memberships_account_status
  ON v0_tenant_memberships(account_id, status);

CREATE INDEX IF NOT EXISTS idx_v0_tenant_memberships_tenant_status
  ON v0_tenant_memberships(tenant_id, status);

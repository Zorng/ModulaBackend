-- Phase F3 (Entitlement Foundation)
-- Minimal subscription state + branch entitlement enforcement model.

CREATE TABLE IF NOT EXISTS v0_tenant_subscription_states (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  state VARCHAR(20) NOT NULL CHECK (state IN ('ACTIVE', 'PAST_DUE', 'FROZEN')),
  grace_until TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS v0_branch_entitlements (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  entitlement_key VARCHAR(100) NOT NULL,
  enforcement VARCHAR(30) NOT NULL CHECK (enforcement IN ('ENABLED', 'READ_ONLY', 'DISABLED_VISIBLE')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, branch_id, entitlement_key)
);

CREATE INDEX IF NOT EXISTS idx_v0_branch_entitlements_branch
  ON v0_branch_entitlements(tenant_id, branch_id);

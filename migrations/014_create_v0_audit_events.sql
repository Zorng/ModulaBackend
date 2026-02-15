-- Phase F5 (Audit Logging Core)
-- Immutable platform audit events for tenant/branch state-changing actions.

CREATE TABLE IF NOT EXISTS v0_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  actor_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  action_key VARCHAR(120) NOT NULL,
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('SUCCESS', 'REJECTED', 'FAILED')),
  reason_code VARCHAR(120) NULL,
  entity_type VARCHAR(80) NULL,
  entity_id VARCHAR(120) NULL,
  dedupe_key VARCHAR(180) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_audit_events_tenant_dedupe
  ON v0_audit_events(tenant_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_v0_audit_events_tenant_created
  ON v0_audit_events(tenant_id, created_at DESC);

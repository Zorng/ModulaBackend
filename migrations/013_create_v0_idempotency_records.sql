-- Phase F4 (Idempotency Gate)
-- Shared dedupe gate for critical write operations.

CREATE TABLE IF NOT EXISTS v0_idempotency_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_fingerprint TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE CASCADE,
  action_key VARCHAR(120) NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED')),
  response_status INTEGER NULL,
  response_body JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope_fingerprint, action_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_v0_idempotency_scope_action
  ON v0_idempotency_records(tenant_id, branch_id, action_key, created_at DESC);

-- Phase O3 (Atomic Command Contract)
-- Transactional outbox for v0 command events.

CREATE TABLE IF NOT EXISTS v0_command_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  action_key VARCHAR(120) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('ACCOUNT', 'SYSTEM')),
  actor_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(120) NOT NULL,
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('SUCCESS', 'REJECTED', 'FAILED')),
  reason_code VARCHAR(120) NULL,
  dedupe_key VARCHAR(180) NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_command_outbox_tenant_dedupe
  ON v0_command_outbox(tenant_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_v0_command_outbox_unpublished
  ON v0_command_outbox(created_at ASC)
  WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_v0_command_outbox_tenant_created
  ON v0_command_outbox(tenant_id, created_at DESC);

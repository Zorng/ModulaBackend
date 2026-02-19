-- Offline-first OF2: canonical sync change feed
-- Stores ordered, tenant/branch-scoped read-model deltas for cursor-based pull sync.

CREATE TABLE IF NOT EXISTS v0_sync_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence BIGSERIAL NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module_key VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id TEXT NOT NULL,
  operation VARCHAR(16) NOT NULL
    CHECK (operation IN ('UPSERT', 'TOMBSTONE')),
  revision TEXT NOT NULL,
  data JSONB NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_outbox_id UUID NULL REFERENCES v0_command_outbox(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sequence),
  CHECK (char_length(trim(revision)) > 0),
  CHECK (char_length(trim(entity_id)) > 0),
  CHECK (
    (operation = 'UPSERT' AND data IS NOT NULL) OR
    (operation = 'TOMBSTONE' AND data IS NULL)
  )
);

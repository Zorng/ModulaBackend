-- Offline-first OF2: client sync checkpoints
-- Tracks last acknowledged sequence per account/device/context/module-scope hash.

CREATE TABLE IF NOT EXISTS v0_sync_client_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device_id VARCHAR(128) NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module_scope_hash CHAR(64) NOT NULL,
  last_sequence BIGINT NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, device_id, tenant_id, branch_id, module_scope_hash),
  CHECK (char_length(trim(device_id)) > 0),
  CHECK (char_length(module_scope_hash) = 64)
);

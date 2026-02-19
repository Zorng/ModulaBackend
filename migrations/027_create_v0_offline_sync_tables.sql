-- Offline sync replay persistence baseline.
-- Stores replay batches and per-operation deterministic outcomes.

CREATE TABLE IF NOT EXISTS v0_offline_sync_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  submitted_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  halt_on_failure BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'FAILED')),
  operation_count INTEGER NOT NULL DEFAULT 0 CHECK (operation_count >= 0),
  applied_count INTEGER NOT NULL DEFAULT 0 CHECK (applied_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  stopped_at INTEGER NULL CHECK (stopped_at >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_offline_sync_batches_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_offline_sync_batches_tenant_branch_created
  ON v0_offline_sync_batches(tenant_id, branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS v0_offline_sync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES v0_offline_sync_batches(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  client_op_id UUID NOT NULL,
  operation_index INTEGER NOT NULL CHECK (operation_index >= 0),
  operation_type VARCHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('IN_PROGRESS', 'APPLIED', 'DUPLICATE', 'FAILED')),
  failure_code VARCHAR(96) NULL,
  failure_message TEXT NULL,
  result_ref_id TEXT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_id, client_op_id),
  UNIQUE (batch_id, operation_index),
  CONSTRAINT fk_v0_offline_sync_operations_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CHECK (
    (status = 'FAILED' AND failure_code IS NOT NULL) OR
    (status IN ('IN_PROGRESS', 'APPLIED', 'DUPLICATE') AND failure_code IS NULL)
  ),
  CHECK (char_length(payload_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_v0_offline_sync_operations_batch_index
  ON v0_offline_sync_operations(batch_id, operation_index);

CREATE INDEX IF NOT EXISTS idx_v0_offline_sync_operations_identity
  ON v0_offline_sync_operations(tenant_id, branch_id, client_op_id);

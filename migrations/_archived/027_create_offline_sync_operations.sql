-- Migration: Offline sync operations log
-- Purpose: Server-side idempotency + result store for queued offline operations (ModSpec offlineSync v1.1)
-- Replay-safe: Uses IF NOT EXISTS + conditional constraints/indexes.

CREATE TABLE IF NOT EXISTS offline_sync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

  -- Client-generated idempotency key (globally unique per device; enforced per-tenant on backend)
  client_op_id UUID NOT NULL,

  -- Operation kind (e.g. SALE_FINALIZED, CASH_SESSION_OPENED)
  type TEXT NOT NULL,

  -- Processing state on backend
  status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',

  -- Raw client payload + backend result/error for deterministic retries
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_code VARCHAR(50),
  error_message TEXT,

  -- Client-provided timestamp for audit/diagnostics only (not authoritative for integrity ordering)
  occurred_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Status constraint (conditional)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offline_sync_operations_status_check'
  ) THEN
    ALTER TABLE offline_sync_operations
      ADD CONSTRAINT offline_sync_operations_status_check
      CHECK (status IN ('PROCESSING', 'APPLIED', 'FAILED'));
  END IF;
END
$$;

-- Idempotency (exactly-once) per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_sync_ops_tenant_client_op_id
  ON offline_sync_operations(tenant_id, client_op_id);

-- Query helpers
CREATE INDEX IF NOT EXISTS idx_offline_sync_ops_tenant_created_at
  ON offline_sync_operations(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offline_sync_ops_tenant_branch_created_at
  ON offline_sync_operations(tenant_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offline_sync_ops_tenant_status_created_at
  ON offline_sync_operations(tenant_id, status, created_at DESC);


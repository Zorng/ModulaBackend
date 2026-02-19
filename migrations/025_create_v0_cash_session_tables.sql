-- Cash Session rollout (Phase 2: data model baseline)
-- Canonical source-of-truth tables for session lifecycle, movement ledger, and close snapshot.

CREATE TABLE IF NOT EXISTS v0_cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  opened_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED', 'FORCE_CLOSED')),
  opening_float_usd NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (opening_float_usd >= 0),
  opening_float_khr NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (opening_float_khr >= 0),
  opening_note TEXT NULL,
  closed_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NULL,
  close_reason VARCHAR(20) NULL
    CHECK (close_reason IN ('NORMAL_CLOSE', 'FORCE_CLOSE')),
  close_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_cash_sessions_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CHECK (
    (status = 'OPEN' AND closed_at IS NULL AND closed_by_account_id IS NULL AND close_reason IS NULL) OR
    (status = 'CLOSED' AND closed_at IS NOT NULL AND closed_by_account_id IS NOT NULL AND close_reason = 'NORMAL_CLOSE') OR
    (status = 'FORCE_CLOSED' AND closed_at IS NOT NULL AND closed_by_account_id IS NOT NULL AND close_reason = 'FORCE_CLOSE')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_cash_sessions_one_open_per_branch
  ON v0_cash_sessions(tenant_id, branch_id)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_v0_cash_sessions_tenant_branch_opened
  ON v0_cash_sessions(tenant_id, branch_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_cash_sessions_tenant_status_opened
  ON v0_cash_sessions(tenant_id, status, opened_at DESC);

CREATE TABLE IF NOT EXISTS v0_cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  cash_session_id UUID NOT NULL,
  movement_type VARCHAR(24) NOT NULL
    CHECK (movement_type IN ('SALE_IN', 'REFUND_CASH', 'MANUAL_IN', 'MANUAL_OUT', 'ADJUSTMENT')),
  amount_usd_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_khr_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason TEXT NULL,
  source_ref_type VARCHAR(20) NOT NULL
    CHECK (source_ref_type IN ('SALE', 'MANUAL', 'SYSTEM')),
  source_ref_id TEXT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  recorded_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_cash_movements_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_cash_movements_session
    FOREIGN KEY (tenant_id, cash_session_id)
    REFERENCES v0_cash_sessions(tenant_id, id)
    ON DELETE CASCADE,
  CHECK (amount_usd_delta <> 0 OR amount_khr_delta <> 0),
  CHECK (
    (movement_type = 'SALE_IN' AND amount_usd_delta >= 0 AND amount_khr_delta >= 0) OR
    (movement_type = 'MANUAL_IN' AND amount_usd_delta >= 0 AND amount_khr_delta >= 0) OR
    (movement_type = 'REFUND_CASH' AND amount_usd_delta <= 0 AND amount_khr_delta <= 0) OR
    (movement_type = 'MANUAL_OUT' AND amount_usd_delta <= 0 AND amount_khr_delta <= 0) OR
    (movement_type = 'ADJUSTMENT')
  ),
  CHECK (
    (source_ref_type = 'SALE' AND source_ref_id IS NOT NULL AND movement_type IN ('SALE_IN', 'REFUND_CASH')) OR
    (source_ref_type = 'MANUAL' AND source_ref_id IS NULL AND movement_type IN ('MANUAL_IN', 'MANUAL_OUT', 'ADJUSTMENT')) OR
    (source_ref_type = 'SYSTEM' AND source_ref_id IS NOT NULL)
  ),
  UNIQUE (tenant_id, branch_id, cash_session_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_cash_movements_sale_anchor
  ON v0_cash_movements(tenant_id, branch_id, source_ref_id, movement_type)
  WHERE source_ref_type = 'SALE'
    AND source_ref_id IS NOT NULL
    AND movement_type IN ('SALE_IN', 'REFUND_CASH');

CREATE INDEX IF NOT EXISTS idx_v0_cash_movements_session_occurred
  ON v0_cash_movements(tenant_id, cash_session_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_cash_movements_branch_type_occurred
  ON v0_cash_movements(tenant_id, branch_id, movement_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS v0_cash_reconciliation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  cash_session_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('CLOSED', 'FORCE_CLOSED')),
  opening_float_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  opening_float_khr NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_sales_non_cash_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sales_non_cash_khr NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_sales_khqr_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sales_khqr_khr NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_sale_in_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sale_in_khr NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_refund_out_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_refund_out_khr NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_manual_in_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_manual_in_khr NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_manual_out_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_manual_out_khr NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_adjustment_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_adjustment_khr NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_cash_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_cash_khr NUMERIC(14,2) NOT NULL DEFAULT 0,
  counted_cash_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  counted_cash_khr NUMERIC(14,2) NOT NULL DEFAULT 0,
  variance_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  variance_khr NUMERIC(14,2) NOT NULL DEFAULT 0,
  close_reason VARCHAR(20) NOT NULL
    CHECK (close_reason IN ('NORMAL_CLOSE', 'FORCE_CLOSE')),
  closed_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  closed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, cash_session_id),
  CONSTRAINT fk_v0_cash_snapshots_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_cash_snapshots_session
    FOREIGN KEY (tenant_id, cash_session_id)
    REFERENCES v0_cash_sessions(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_cash_snapshots_branch_closed
  ON v0_cash_reconciliation_snapshots(tenant_id, branch_id, closed_at DESC);

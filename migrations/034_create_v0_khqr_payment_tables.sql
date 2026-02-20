-- KHQR payment foundation rollout (K2: data model baseline)
-- Canonical tables for KHQR payment attempts and verification evidence.

CREATE TABLE IF NOT EXISTS v0_khqr_payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  md5 VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'WAITING_FOR_PAYMENT'
    CHECK (status IN ('WAITING_FOR_PAYMENT', 'PAID_CONFIRMED', 'EXPIRED', 'SUPERSEDED', 'PENDING_CONFIRMATION')),
  expected_amount NUMERIC(14,2) NOT NULL CHECK (expected_amount > 0),
  expected_currency VARCHAR(3) NOT NULL CHECK (expected_currency IN ('USD', 'KHR')),
  expected_to_account_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  paid_confirmed_at TIMESTAMPTZ NULL,
  superseded_by_attempt_id UUID NULL REFERENCES v0_khqr_payment_attempts(id) ON DELETE SET NULL,
  last_verification_status VARCHAR(16) NULL
    CHECK (last_verification_status IN ('CONFIRMED', 'UNPAID', 'MISMATCH', 'EXPIRED', 'NOT_FOUND')),
  last_verification_reason_code VARCHAR(64) NULL,
  last_verification_at TIMESTAMPTZ NULL,
  provider_reference TEXT NULL,
  provider_confirmed_amount NUMERIC(14,2) NULL CHECK (provider_confirmed_amount IS NULL OR provider_confirmed_amount > 0),
  provider_confirmed_currency VARCHAR(3) NULL CHECK (provider_confirmed_currency IS NULL OR provider_confirmed_currency IN ('USD', 'KHR')),
  provider_confirmed_to_account_id TEXT NULL,
  provider_confirmed_at TIMESTAMPTZ NULL,
  created_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_khqr_attempt_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CHECK (
    (status = 'PAID_CONFIRMED' AND paid_confirmed_at IS NOT NULL) OR
    (status <> 'PAID_CONFIRMED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_khqr_attempts_branch_md5
  ON v0_khqr_payment_attempts(tenant_id, branch_id, md5);

CREATE INDEX IF NOT EXISTS idx_v0_khqr_attempts_branch_sale_created
  ON v0_khqr_payment_attempts(tenant_id, branch_id, sale_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_khqr_attempts_branch_status_updated
  ON v0_khqr_payment_attempts(tenant_id, branch_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_khqr_attempts_branch_verification
  ON v0_khqr_payment_attempts(tenant_id, branch_id, last_verification_status, last_verification_at DESC);

CREATE TABLE IF NOT EXISTS v0_khqr_payment_confirmation_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  attempt_id UUID NOT NULL,
  provider VARCHAR(24) NOT NULL CHECK (provider IN ('BAKONG', 'STUB')),
  verification_status VARCHAR(16) NOT NULL
    CHECK (verification_status IN ('CONFIRMED', 'UNPAID', 'MISMATCH', 'EXPIRED', 'NOT_FOUND')),
  reason_code VARCHAR(64) NULL,
  proof_payload JSONB NULL,
  provider_event_id TEXT NULL,
  provider_tx_hash TEXT NULL,
  provider_confirmed_amount NUMERIC(14,2) NULL CHECK (provider_confirmed_amount IS NULL OR provider_confirmed_amount > 0),
  provider_confirmed_currency VARCHAR(3) NULL CHECK (provider_confirmed_currency IS NULL OR provider_confirmed_currency IN ('USD', 'KHR')),
  provider_confirmed_to_account_id TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_khqr_evidence_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_khqr_evidence_attempt
    FOREIGN KEY (tenant_id, attempt_id)
    REFERENCES v0_khqr_payment_attempts(tenant_id, id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_khqr_evidence_provider_event
  ON v0_khqr_payment_confirmation_evidences(tenant_id, branch_id, provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_v0_khqr_evidence_attempt_occurred
  ON v0_khqr_payment_confirmation_evidences(tenant_id, attempt_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_khqr_evidence_branch_status_occurred
  ON v0_khqr_payment_confirmation_evidences(tenant_id, branch_id, verification_status, occurred_at DESC);

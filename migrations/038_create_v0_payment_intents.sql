-- Sale checkout remodel (R2): payment-intent baseline
-- Adds payment-intent aggregate and rewires KHQR attempts ownership to payment intents.

CREATE TABLE IF NOT EXISTS v0_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  sale_id UUID NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'WAITING_FOR_PAYMENT'
    CHECK (status IN ('WAITING_FOR_PAYMENT', 'PAID_CONFIRMED', 'FINALIZED', 'EXPIRED', 'CANCELLED', 'FAILED_PROOF')),
  payment_method VARCHAR(20) NOT NULL DEFAULT 'KHQR'
    CHECK (payment_method IN ('KHQR', 'CASH')),
  tender_currency VARCHAR(3) NOT NULL CHECK (tender_currency IN ('USD', 'KHR')),
  tender_amount NUMERIC(14,2) NOT NULL CHECK (tender_amount > 0),
  expected_to_account_id TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  paid_confirmed_at TIMESTAMPTZ NULL,
  finalized_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  reason_code VARCHAR(64) NULL,
  active_attempt_id UUID NULL,
  checkout_lines_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB,
  checkout_totals_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  pricing_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_payment_intents_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_payment_intents_branch_sale
  ON v0_payment_intents(tenant_id, branch_id, sale_id);

CREATE INDEX IF NOT EXISTS idx_v0_payment_intents_branch_status_updated
  ON v0_payment_intents(tenant_id, branch_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_payment_intents_branch_created
  ON v0_payment_intents(tenant_id, branch_id, created_at DESC);

ALTER TABLE v0_khqr_payment_attempts
  ADD COLUMN IF NOT EXISTS payment_intent_id UUID;

-- Backfill one payment intent per (tenant, branch, sale) from latest attempt if missing.
WITH latest_attempts AS (
  SELECT DISTINCT ON (tenant_id, branch_id, sale_id)
    id,
    tenant_id,
    branch_id,
    sale_id,
    status,
    expected_amount,
    expected_currency,
    expected_to_account_id,
    expires_at,
    paid_confirmed_at,
    last_verification_reason_code,
    created_by_account_id,
    created_at,
    updated_at
  FROM v0_khqr_payment_attempts
  ORDER BY tenant_id, branch_id, sale_id, created_at DESC, id DESC
)
INSERT INTO v0_payment_intents (
  id,
  tenant_id,
  branch_id,
  sale_id,
  status,
  payment_method,
  tender_currency,
  tender_amount,
  expected_to_account_id,
  expires_at,
  paid_confirmed_at,
  finalized_at,
  cancelled_at,
  reason_code,
  checkout_lines_snapshot,
  checkout_totals_snapshot,
  pricing_snapshot,
  metadata_snapshot,
  created_by_account_id,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  la.tenant_id,
  la.branch_id,
  la.sale_id,
  CASE
    WHEN la.status = 'PAID_CONFIRMED' THEN 'PAID_CONFIRMED'
    WHEN la.status = 'EXPIRED' THEN 'EXPIRED'
    WHEN la.status = 'PENDING_CONFIRMATION' THEN 'FAILED_PROOF'
    WHEN la.status = 'SUPERSEDED' THEN 'CANCELLED'
    ELSE 'WAITING_FOR_PAYMENT'
  END,
  'KHQR',
  la.expected_currency,
  la.expected_amount,
  la.expected_to_account_id,
  la.expires_at,
  la.paid_confirmed_at,
  CASE WHEN la.status = 'PAID_CONFIRMED' THEN la.updated_at ELSE NULL END,
  CASE WHEN la.status = 'SUPERSEDED' THEN la.updated_at ELSE NULL END,
  la.last_verification_reason_code,
  '[]'::JSONB,
  '{}'::JSONB,
  '{}'::JSONB,
  jsonb_build_object(
    'migration', '038_create_v0_payment_intents',
    'sourceAttemptId', la.id
  ),
  la.created_by_account_id,
  la.created_at,
  la.updated_at
FROM latest_attempts la
LEFT JOIN v0_payment_intents existing
  ON existing.tenant_id = la.tenant_id
 AND existing.branch_id = la.branch_id
 AND existing.sale_id = la.sale_id
WHERE existing.id IS NULL;

UPDATE v0_khqr_payment_attempts att
SET payment_intent_id = intent.id
FROM v0_payment_intents intent
WHERE att.payment_intent_id IS NULL
  AND intent.tenant_id = att.tenant_id
  AND intent.branch_id = att.branch_id
  AND intent.sale_id = att.sale_id;

UPDATE v0_payment_intents intent
SET active_attempt_id = (
  SELECT att.id
  FROM v0_khqr_payment_attempts att
  WHERE att.tenant_id = intent.tenant_id
    AND att.branch_id = intent.branch_id
    AND att.payment_intent_id = intent.id
  ORDER BY
    CASE
      WHEN att.status IN ('WAITING_FOR_PAYMENT', 'PENDING_CONFIRMATION', 'PAID_CONFIRMED') THEN 0
      ELSE 1
    END,
    att.created_at DESC,
    att.id DESC
  LIMIT 1
)
WHERE intent.active_attempt_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'v0_khqr_payment_attempts'
      AND column_name = 'payment_intent_id'
      AND is_nullable = 'YES'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM v0_khqr_payment_attempts
      WHERE payment_intent_id IS NULL
    ) THEN
      RAISE EXCEPTION 'cannot enforce payment_intent_id NOT NULL: unresolved v0_khqr_payment_attempts rows detected';
    END IF;

    ALTER TABLE v0_khqr_payment_attempts
      ALTER COLUMN payment_intent_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_v0_khqr_attempts_payment_intent
  ON v0_khqr_payment_attempts(tenant_id, payment_intent_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_v0_khqr_attempts_payment_intent'
  ) THEN
    ALTER TABLE v0_khqr_payment_attempts
      ADD CONSTRAINT fk_v0_khqr_attempts_payment_intent
      FOREIGN KEY (tenant_id, payment_intent_id)
      REFERENCES v0_payment_intents(tenant_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_v0_payment_intents_active_attempt'
  ) THEN
    ALTER TABLE v0_payment_intents
      ADD CONSTRAINT fk_v0_payment_intents_active_attempt
      FOREIGN KEY (tenant_id, active_attempt_id)
      REFERENCES v0_khqr_payment_attempts(tenant_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Sale + Order rollout follow-up:
-- Add dual-currency totals and payment/tender snapshot fields required by KB.
-- Do not mutate already-applied migration 035.

ALTER TABLE v0_sales
  ADD COLUMN IF NOT EXISTS tender_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS tender_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tender_amount >= 0),
  ADD COLUMN IF NOT EXISTS cash_received_tender_amount NUMERIC(14,2) NULL
    CHECK (cash_received_tender_amount IS NULL OR cash_received_tender_amount >= 0),
  ADD COLUMN IF NOT EXISTS cash_change_tender_amount NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (cash_change_tender_amount >= 0),
  ADD COLUMN IF NOT EXISTS subtotal_usd NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_usd >= 0),
  ADD COLUMN IF NOT EXISTS subtotal_khr NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_khr >= 0),
  ADD COLUMN IF NOT EXISTS discount_usd NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_usd >= 0),
  ADD COLUMN IF NOT EXISTS discount_khr NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_khr >= 0),
  ADD COLUMN IF NOT EXISTS vat_usd NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (vat_usd >= 0),
  ADD COLUMN IF NOT EXISTS vat_khr NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (vat_khr >= 0),
  ADD COLUMN IF NOT EXISTS grand_total_usd NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (grand_total_usd >= 0),
  ADD COLUMN IF NOT EXISTS grand_total_khr NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (grand_total_khr >= 0),
  ADD COLUMN IF NOT EXISTS sale_fx_rate_khr_per_usd NUMERIC(14,4) NOT NULL DEFAULT 4100
    CHECK (sale_fx_rate_khr_per_usd > 0),
  ADD COLUMN IF NOT EXISTS sale_khr_rounding_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sale_khr_rounding_mode VARCHAR(16) NOT NULL DEFAULT 'NEAREST',
  ADD COLUMN IF NOT EXISTS sale_khr_rounding_granularity INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS khqr_to_account_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS khqr_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS khqr_confirmed_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_v0_sales_tender_currency'
  ) THEN
    ALTER TABLE v0_sales
      ADD CONSTRAINT ck_v0_sales_tender_currency
      CHECK (tender_currency IN ('USD', 'KHR'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_v0_sales_rounding_mode'
  ) THEN
    ALTER TABLE v0_sales
      ADD CONSTRAINT ck_v0_sales_rounding_mode
      CHECK (sale_khr_rounding_mode IN ('NEAREST', 'UP', 'DOWN'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_v0_sales_rounding_granularity'
  ) THEN
    ALTER TABLE v0_sales
      ADD CONSTRAINT ck_v0_sales_rounding_granularity
      CHECK (sale_khr_rounding_granularity IN (100, 1000));
  END IF;
END $$;

-- Backfill from legacy single-amount fields for already-existing rows.
UPDATE v0_sales
SET
  subtotal_usd = COALESCE(subtotal_usd, subtotal_amount),
  discount_usd = COALESCE(discount_usd, discount_amount),
  vat_usd = COALESCE(vat_usd, vat_amount),
  grand_total_usd = COALESCE(grand_total_usd, total_amount),
  subtotal_khr = CASE
    WHEN subtotal_khr = 0 THEN ROUND(subtotal_amount * sale_fx_rate_khr_per_usd, 2)
    ELSE subtotal_khr
  END,
  discount_khr = CASE
    WHEN discount_khr = 0 THEN ROUND(discount_amount * sale_fx_rate_khr_per_usd, 2)
    ELSE discount_khr
  END,
  vat_khr = CASE
    WHEN vat_khr = 0 THEN ROUND(vat_amount * sale_fx_rate_khr_per_usd, 2)
    ELSE vat_khr
  END,
  grand_total_khr = CASE
    WHEN grand_total_khr = 0 THEN ROUND(total_amount * sale_fx_rate_khr_per_usd, 2)
    ELSE grand_total_khr
  END,
  tender_amount = CASE
    WHEN tender_amount = 0 THEN COALESCE(NULLIF(paid_amount, 0), total_amount)
    ELSE tender_amount
  END,
  cash_received_tender_amount = CASE
    WHEN payment_method = 'CASH' AND cash_received_tender_amount IS NULL
      THEN COALESCE(NULLIF(paid_amount, 0), total_amount)
    ELSE cash_received_tender_amount
  END,
  cash_change_tender_amount = CASE
    WHEN payment_method = 'CASH' AND cash_change_tender_amount = 0
      THEN GREATEST(COALESCE(paid_amount, 0) - total_amount, 0)
    ELSE cash_change_tender_amount
  END;

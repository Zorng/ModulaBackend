-- Sale + Order integrity hardening:
-- enforce state-transition invariants at DB level for order tickets and sales.

-- ----------------------------
-- Backfill / normalize tickets
-- ----------------------------
UPDATE v0_order_tickets
SET
  checked_out_at = CASE
    WHEN status = 'CHECKED_OUT' THEN COALESCE(checked_out_at, updated_at, created_at)
    ELSE NULL
  END,
  checked_out_by_account_id = CASE
    WHEN status = 'CHECKED_OUT' THEN checked_out_by_account_id
    ELSE NULL
  END,
  cancelled_at = CASE
    WHEN status = 'CANCELLED' THEN COALESCE(cancelled_at, updated_at, created_at)
    ELSE NULL
  END,
  cancelled_by_account_id = CASE
    WHEN status = 'CANCELLED' THEN cancelled_by_account_id
    ELSE NULL
  END,
  cancel_reason = CASE
    WHEN status = 'CANCELLED' THEN cancel_reason
    ELSE NULL
  END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_v0_order_tickets_status_lifecycle'
  ) THEN
    ALTER TABLE v0_order_tickets
      DROP CONSTRAINT ck_v0_order_tickets_status_lifecycle;
  END IF;
END $$;

ALTER TABLE v0_order_tickets
  ADD CONSTRAINT ck_v0_order_tickets_status_lifecycle
  CHECK (
    (status = 'OPEN'
      AND checked_out_at IS NULL
      AND checked_out_by_account_id IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by_account_id IS NULL
      AND cancel_reason IS NULL
    )
    OR
    (status = 'CHECKED_OUT'
      AND checked_out_at IS NOT NULL
      AND checked_out_by_account_id IS NOT NULL
      AND cancelled_at IS NULL
      AND cancelled_by_account_id IS NULL
    )
    OR
    (status = 'CANCELLED'
      AND checked_out_at IS NULL
      AND checked_out_by_account_id IS NULL
      AND cancelled_at IS NOT NULL
      AND cancelled_by_account_id IS NOT NULL
    )
  );

-- -------------------------
-- Backfill / normalize sales
-- -------------------------
UPDATE v0_sales
SET
  finalized_at = CASE
    WHEN status IN ('FINALIZED', 'VOID_PENDING', 'VOIDED')
      THEN COALESCE(finalized_at, updated_at, created_at)
    ELSE NULL
  END,
  voided_at = CASE
    WHEN status = 'VOIDED'
      THEN COALESCE(voided_at, updated_at, created_at)
    ELSE NULL
  END,
  voided_by_account_id = CASE
    WHEN status = 'VOIDED' THEN voided_by_account_id
    ELSE NULL
  END,
  void_reason = CASE
    WHEN status = 'VOIDED' THEN void_reason
    ELSE NULL
  END,
  khqr_confirmed_at = CASE
    WHEN payment_method = 'KHQR'
      AND status IN ('FINALIZED', 'VOID_PENDING', 'VOIDED')
      THEN COALESCE(khqr_confirmed_at, finalized_at, updated_at, created_at)
    ELSE khqr_confirmed_at
  END,
  cash_received_tender_amount = CASE
    WHEN payment_method = 'CASH'
      AND status IN ('FINALIZED', 'VOID_PENDING', 'VOIDED')
      THEN GREATEST(COALESCE(cash_received_tender_amount, tender_amount), tender_amount)
    ELSE cash_received_tender_amount
  END,
  cash_change_tender_amount = CASE
    WHEN payment_method = 'CASH'
      AND status IN ('FINALIZED', 'VOID_PENDING', 'VOIDED')
      THEN GREATEST(
        GREATEST(COALESCE(cash_received_tender_amount, tender_amount), tender_amount) - tender_amount,
        0
      )
    ELSE cash_change_tender_amount
  END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_v0_sales_status_lifecycle'
  ) THEN
    ALTER TABLE v0_sales
      DROP CONSTRAINT ck_v0_sales_status_lifecycle;
  END IF;
END $$;

ALTER TABLE v0_sales
  ADD CONSTRAINT ck_v0_sales_status_lifecycle
  CHECK (
    (status = 'PENDING'
      AND finalized_at IS NULL
      AND voided_at IS NULL
      AND voided_by_account_id IS NULL
    )
    OR
    (status = 'FINALIZED'
      AND finalized_at IS NOT NULL
      AND voided_at IS NULL
      AND voided_by_account_id IS NULL
    )
    OR
    (status = 'VOID_PENDING'
      AND finalized_at IS NOT NULL
      AND voided_at IS NULL
      AND voided_by_account_id IS NULL
    )
    OR
    (status = 'VOIDED'
      AND finalized_at IS NOT NULL
      AND voided_at IS NOT NULL
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_v0_sales_finalized_khqr_proof'
  ) THEN
    ALTER TABLE v0_sales
      DROP CONSTRAINT ck_v0_sales_finalized_khqr_proof;
  END IF;
END $$;

ALTER TABLE v0_sales
  ADD CONSTRAINT ck_v0_sales_finalized_khqr_proof
  CHECK (
    payment_method <> 'KHQR'
    OR status NOT IN ('FINALIZED', 'VOID_PENDING', 'VOIDED')
    OR khqr_confirmed_at IS NOT NULL
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_v0_sales_finalized_cash_received'
  ) THEN
    ALTER TABLE v0_sales
      DROP CONSTRAINT ck_v0_sales_finalized_cash_received;
  END IF;
END $$;

ALTER TABLE v0_sales
  ADD CONSTRAINT ck_v0_sales_finalized_cash_received
  CHECK (
    payment_method <> 'CASH'
    OR status NOT IN ('FINALIZED', 'VOID_PENDING', 'VOIDED')
    OR (
      cash_received_tender_amount IS NOT NULL
      AND cash_received_tender_amount >= tender_amount
    )
  );

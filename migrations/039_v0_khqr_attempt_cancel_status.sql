-- Allow explicit cancellation status for KHQR attempts.
-- R3 checkout remodel: unpaid attempts can be cancelled without overloading SUPERSEDED semantics.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'v0_khqr_payment_attempts_status_check'
  ) THEN
    ALTER TABLE v0_khqr_payment_attempts
      DROP CONSTRAINT v0_khqr_payment_attempts_status_check;
  END IF;
END $$;

ALTER TABLE v0_khqr_payment_attempts
  ADD CONSTRAINT v0_khqr_payment_attempts_status_check
  CHECK (
    status IN (
      'WAITING_FOR_PAYMENT',
      'PAID_CONFIRMED',
      'EXPIRED',
      'SUPERSEDED',
      'CANCELLED',
      'PENDING_CONFIRMATION'
    )
  );

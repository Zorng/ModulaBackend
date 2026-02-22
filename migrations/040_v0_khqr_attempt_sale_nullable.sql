-- Checkout remodel bridge:
-- allow KHQR attempts to exist before sale creation.
-- sale can be linked later at finalize time via payment intent settlement.

ALTER TABLE v0_khqr_payment_attempts
  ALTER COLUMN sale_id DROP NOT NULL;

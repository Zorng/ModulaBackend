-- KHQR production-readiness (P0.1)
-- Branch-owned KHQR receiver account source of truth.

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS khqr_receiver_account_id TEXT,
  ADD COLUMN IF NOT EXISTS khqr_receiver_name TEXT;


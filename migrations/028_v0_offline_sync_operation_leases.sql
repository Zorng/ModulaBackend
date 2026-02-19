-- Add operation lease window for stale IN_PROGRESS recovery.
-- Enables safe reclaim of crashed/abandoned offline replay operations.

ALTER TABLE v0_offline_sync_operations
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NULL;

UPDATE v0_offline_sync_operations
SET lease_expires_at = COALESCE(processed_at, NOW()) + INTERVAL '2 minutes'
WHERE status = 'IN_PROGRESS'
  AND lease_expires_at IS NULL;

ALTER TABLE v0_offline_sync_operations
  DROP CONSTRAINT IF EXISTS v0_offline_sync_operations_lease_state_check;

ALTER TABLE v0_offline_sync_operations
  ADD CONSTRAINT v0_offline_sync_operations_lease_state_check
  CHECK (
    (status = 'IN_PROGRESS' AND lease_expires_at IS NOT NULL)
    OR
    (status IN ('APPLIED', 'DUPLICATE', 'FAILED'))
  );

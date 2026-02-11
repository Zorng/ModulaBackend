-- Migration: Extend activity_log for Audit module
-- Purpose: Make audit logs queryable by outcome/reason and support offline idempotency.
-- Replay-safe: Uses IF NOT EXISTS + conditional constraints/indexes.

-- Columns
ALTER TABLE IF EXISTS activity_log
  ADD COLUMN IF NOT EXISTS outcome VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN IF NOT EXISTS denial_reason VARCHAR(50),
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(20),
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_event_id TEXT;

-- Backfill occurred_at for existing rows
UPDATE activity_log
SET occurred_at = created_at
WHERE occurred_at IS NULL;

-- Ensure occurred_at is always present going forward
ALTER TABLE activity_log
  ALTER COLUMN occurred_at SET DEFAULT NOW();

ALTER TABLE activity_log
  ALTER COLUMN occurred_at SET NOT NULL;

-- Constraints (conditional)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activity_log_outcome_check'
  ) THEN
    ALTER TABLE activity_log
      ADD CONSTRAINT activity_log_outcome_check
      CHECK (outcome IN ('SUCCESS', 'REJECTED', 'FAILED'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activity_log_denial_reason_check'
  ) THEN
    ALTER TABLE activity_log
      ADD CONSTRAINT activity_log_denial_reason_check
      CHECK (
        denial_reason IS NULL OR denial_reason IN (
          'PERMISSION_DENIED',
          'POLICY_BLOCKED',
          'VALIDATION_FAILED',
          'BRANCH_FROZEN',
          'TENANT_FROZEN',
          'DEPENDENCY_MISSING'
        )
      );
  END IF;
END
$$;

-- Backfill standardized rejection fields for known denial events
UPDATE activity_log
SET outcome = 'REJECTED',
    denial_reason = COALESCE(denial_reason, 'BRANCH_FROZEN')
WHERE action_type = 'ACTION_REJECTED_BRANCH_FROZEN'
  AND outcome = 'SUCCESS';

-- Indexes for common filters
CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_occurred_at
  ON activity_log(tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_branch_occurred_at
  ON activity_log(tenant_id, branch_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_employee_occurred_at
  ON activity_log(tenant_id, employee_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_action_occurred_at
  ON activity_log(tenant_id, action_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_outcome_occurred_at
  ON activity_log(tenant_id, outcome, occurred_at DESC);

-- Offline idempotency: prevent duplicates per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_log_tenant_client_event_id
  ON activity_log(tenant_id, client_event_id)
  WHERE client_event_id IS NOT NULL;


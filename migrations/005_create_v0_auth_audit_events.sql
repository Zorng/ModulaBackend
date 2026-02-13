-- v0 restart baseline
-- Lightweight auth audit trail for Phase 1 security visibility.

CREATE TABLE IF NOT EXISTS v0_auth_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  phone VARCHAR(20),
  event_key VARCHAR(100) NOT NULL,
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILED')),
  reason_code VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v0_auth_audit_events_account_occurred
  ON v0_auth_audit_events(account_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_auth_audit_events_phone_occurred
  ON v0_auth_audit_events(phone, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_auth_audit_events_event_key
  ON v0_auth_audit_events(event_key);

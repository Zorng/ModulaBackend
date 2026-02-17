-- Phase O2 (Fair-Use Limit Extension)
-- Tracks write-attempt frequency for abuse protection.

CREATE TABLE IF NOT EXISTS v0_fair_use_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  action_key VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v0_fair_use_events_account_action_created
  ON v0_fair_use_events(account_id, action_key, created_at DESC);

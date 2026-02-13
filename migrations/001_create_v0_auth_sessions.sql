-- Phase 1 (/v0 auth): account-level session table for self-registered users.
-- This is separate from legacy `sessions` (employee-bound).

CREATE TABLE IF NOT EXISTS v0_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  context_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  context_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_v0_auth_sessions_account_id
  ON v0_auth_sessions(account_id);

CREATE INDEX IF NOT EXISTS idx_v0_auth_sessions_expires_at
  ON v0_auth_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_v0_auth_sessions_context
  ON v0_auth_sessions(context_tenant_id, context_branch_id);

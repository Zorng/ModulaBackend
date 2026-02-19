-- Operational notification baseline storage (in-app only)
-- Best-effort signal persistence with idempotent emission and per-recipient read state.

CREATE TABLE IF NOT EXISTS v0_operational_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  type VARCHAR(64) NOT NULL,
  subject_type VARCHAR(64) NOT NULL,
  subject_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB NULL,
  dedupe_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, dedupe_key),
  CONSTRAINT fk_v0_operational_notifications_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_operational_notifications_tenant_branch_created
  ON v0_operational_notifications(tenant_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_operational_notifications_tenant_type_created
  ON v0_operational_notifications(tenant_id, type, created_at DESC);

CREATE TABLE IF NOT EXISTS v0_operational_notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES v0_operational_notifications(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  recipient_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (notification_id, recipient_account_id),
  CONSTRAINT fk_v0_operational_notification_recipients_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_operational_notification_recipients_inbox
  ON v0_operational_notification_recipients(tenant_id, branch_id, recipient_account_id, read_at, created_at DESC);


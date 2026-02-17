-- First branch activation scaffold (activation draft + invoice state)

CREATE TABLE IF NOT EXISTS v0_subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_type VARCHAR(50) NOT NULL CHECK (invoice_type IN ('FIRST_BRANCH_ACTIVATION')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('ISSUED', 'PAID', 'VOID', 'FAILED')),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  total_amount_usd NUMERIC(12,2) NOT NULL CHECK (total_amount_usd >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v0_subscription_invoices_tenant_status
  ON v0_subscription_invoices(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS v0_branch_activation_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  branch_display_name VARCHAR(160) NOT NULL,
  status VARCHAR(30) NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'ACTIVATED', 'CANCELLED')),
  invoice_id UUID NOT NULL UNIQUE REFERENCES v0_subscription_invoices(id) ON DELETE CASCADE,
  payment_confirmation_ref TEXT,
  activated_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_branch_activation_pending_per_tenant
  ON v0_branch_activation_drafts(tenant_id)
  WHERE status = 'PENDING_PAYMENT';

CREATE INDEX IF NOT EXISTS idx_v0_branch_activation_drafts_tenant_status
  ON v0_branch_activation_drafts(tenant_id, status, created_at DESC);

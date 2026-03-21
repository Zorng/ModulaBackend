ALTER TABLE v0_order_tickets
ADD COLUMN IF NOT EXISTS source_mode VARCHAR(40) NOT NULL DEFAULT 'STANDARD'
  CHECK (source_mode IN ('STANDARD', 'MANUAL_EXTERNAL_PAYMENT_CLAIM'));

CREATE TABLE IF NOT EXISTS v0_order_manual_payment_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  order_ticket_id UUID NOT NULL,
  sale_id UUID NULL,
  requested_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  reviewed_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  claimed_payment_method VARCHAR(20) NOT NULL
    CHECK (claimed_payment_method IN ('KHQR')),
  sale_type VARCHAR(20) NOT NULL
    CHECK (sale_type IN ('DINE_IN', 'TAKEAWAY', 'DELIVERY')),
  tender_currency VARCHAR(3) NOT NULL
    CHECK (tender_currency IN ('USD', 'KHR')),
  claimed_tender_amount NUMERIC(14,2) NOT NULL
    CHECK (claimed_tender_amount > 0),
  proof_image_url TEXT NOT NULL,
  customer_reference TEXT NULL,
  note TEXT NULL,
  review_note TEXT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_order_manual_payment_claims_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_order_manual_payment_claims_order
    FOREIGN KEY (tenant_id, order_ticket_id)
    REFERENCES v0_order_tickets(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_order_manual_payment_claims_sale
    FOREIGN KEY (tenant_id, sale_id)
    REFERENCES v0_sales(tenant_id, id)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_order_manual_payment_claims_one_pending_per_order
  ON v0_order_manual_payment_claims(tenant_id, order_ticket_id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_v0_order_manual_payment_claims_order_requested
  ON v0_order_manual_payment_claims(tenant_id, order_ticket_id, requested_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_v0_order_manual_payment_claims_branch_status_requested
  ON v0_order_manual_payment_claims(tenant_id, branch_id, status, requested_at DESC, id DESC);

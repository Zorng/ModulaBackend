-- Sale + Order rollout (Phase 2: data model baseline)
-- Canonical source-of-truth tables for order lifecycle, sale lifecycle, void workflow, and fulfillment batches.

CREATE TABLE IF NOT EXISTS v0_order_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  opened_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CHECKED_OUT', 'CANCELLED')),
  checked_out_at TIMESTAMPTZ NULL,
  checked_out_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ NULL,
  cancelled_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  cancel_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_order_tickets_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_order_tickets_branch_status_updated
  ON v0_order_tickets(tenant_id, branch_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_order_tickets_branch_created
  ON v0_order_tickets(tenant_id, branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS v0_order_ticket_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  order_ticket_id UUID NOT NULL,
  menu_item_id UUID NOT NULL,
  menu_item_name_snapshot VARCHAR(255) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  line_subtotal NUMERIC(14,2) NOT NULL CHECK (line_subtotal >= 0),
  modifier_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_order_ticket_lines_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_order_ticket_lines_order
    FOREIGN KEY (tenant_id, order_ticket_id)
    REFERENCES v0_order_tickets(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_order_ticket_lines_order_created
  ON v0_order_ticket_lines(tenant_id, order_ticket_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_v0_order_ticket_lines_menu_item
  ON v0_order_ticket_lines(tenant_id, menu_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS v0_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  order_ticket_id UUID NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'FINALIZED', 'VOID_PENDING', 'VOIDED')),
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH', 'KHQR')),
  khqr_md5 VARCHAR(64) NULL,
  subtotal_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  finalized_at TIMESTAMPTZ NULL,
  finalized_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  void_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_sales_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_sales_order_ticket
    FOREIGN KEY (tenant_id, order_ticket_id)
    REFERENCES v0_order_tickets(tenant_id, id)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_sales_order_ticket_once
  ON v0_sales(tenant_id, order_ticket_id)
  WHERE order_ticket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_v0_sales_branch_status_updated
  ON v0_sales(tenant_id, branch_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_sales_branch_created
  ON v0_sales(tenant_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_sales_khqr_md5
  ON v0_sales(tenant_id, branch_id, khqr_md5)
  WHERE khqr_md5 IS NOT NULL;

CREATE TABLE IF NOT EXISTS v0_sale_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  order_ticket_line_id UUID NULL,
  menu_item_id UUID NOT NULL,
  menu_item_name_snapshot VARCHAR(255) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  line_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_discount_amount >= 0),
  line_total_amount NUMERIC(14,2) NOT NULL CHECK (line_total_amount >= 0),
  modifier_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_sale_lines_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_sale_lines_sale
    FOREIGN KEY (tenant_id, sale_id)
    REFERENCES v0_sales(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_sale_lines_order_line
    FOREIGN KEY (tenant_id, order_ticket_line_id)
    REFERENCES v0_order_ticket_lines(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_v0_sale_lines_sale_created
  ON v0_sale_lines(tenant_id, sale_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_v0_sale_lines_menu_item
  ON v0_sale_lines(tenant_id, menu_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS v0_void_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  requested_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  reviewed_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reason TEXT NOT NULL,
  review_note TEXT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_void_requests_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_void_requests_sale
    FOREIGN KEY (tenant_id, sale_id)
    REFERENCES v0_sales(tenant_id, id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_void_requests_one_pending_per_sale
  ON v0_void_requests(tenant_id, sale_id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_v0_void_requests_sale_requested
  ON v0_void_requests(tenant_id, sale_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_void_requests_branch_status_requested
  ON v0_void_requests(tenant_id, branch_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS v0_order_fulfillment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  order_ticket_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED')),
  note TEXT NULL,
  created_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_fulfillment_batches_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_fulfillment_batches_order
    FOREIGN KEY (tenant_id, order_ticket_id)
    REFERENCES v0_order_tickets(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_fulfillment_batches_order_status_updated
  ON v0_order_fulfillment_batches(tenant_id, order_ticket_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_fulfillment_batches_branch_status_updated
  ON v0_order_fulfillment_batches(tenant_id, branch_id, status, updated_at DESC);

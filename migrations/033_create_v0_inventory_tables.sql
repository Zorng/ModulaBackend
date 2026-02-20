-- Inventory rollout (Phase 2: data model baseline)
-- Canonical source-of-truth tables for stock catalog, ledger movements, and branch stock projection.

CREATE TABLE IF NOT EXISTS v0_inventory_stock_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_inventory_categories_tenant_name_active
  ON v0_inventory_stock_categories(tenant_id, LOWER(name))
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_v0_inventory_categories_tenant_status
  ON v0_inventory_stock_categories(tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS v0_inventory_stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID NULL,
  name VARCHAR(255) NOT NULL,
  base_unit VARCHAR(32) NOT NULL,
  image_url TEXT NULL,
  low_stock_threshold NUMERIC(14,4) NULL CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_inventory_items_category
    FOREIGN KEY (tenant_id, category_id)
    REFERENCES v0_inventory_stock_categories(tenant_id, id)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_inventory_items_tenant_name_active
  ON v0_inventory_stock_items(tenant_id, LOWER(name))
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_v0_inventory_items_tenant_status
  ON v0_inventory_stock_items(tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_inventory_items_tenant_category
  ON v0_inventory_stock_items(tenant_id, category_id, status);

CREATE TABLE IF NOT EXISTS v0_inventory_restock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  stock_item_id UUID NOT NULL,
  quantity_in_base_unit NUMERIC(16,4) NOT NULL CHECK (quantity_in_base_unit > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_date DATE NULL,
  supplier_name VARCHAR(255) NULL,
  purchase_cost_usd NUMERIC(14,2) NULL CHECK (purchase_cost_usd IS NULL OR purchase_cost_usd >= 0),
  note TEXT NULL,
  created_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_inventory_restock_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_inventory_restock_item
    FOREIGN KEY (tenant_id, stock_item_id)
    REFERENCES v0_inventory_stock_items(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_inventory_restock_branch_item_received
  ON v0_inventory_restock_batches(tenant_id, branch_id, stock_item_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_inventory_restock_status
  ON v0_inventory_restock_batches(tenant_id, status, received_at DESC);

CREATE TABLE IF NOT EXISTS v0_inventory_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  stock_item_id UUID NOT NULL,
  direction VARCHAR(8) NOT NULL CHECK (direction IN ('IN', 'OUT')),
  quantity_in_base_unit NUMERIC(16,4) NOT NULL CHECK (quantity_in_base_unit > 0),
  reason_code VARCHAR(32) NOT NULL
    CHECK (reason_code IN ('RESTOCK', 'SALE_DEDUCTION', 'VOID_REVERSAL', 'ADJUSTMENT', 'OTHER')),
  source_type VARCHAR(24) NOT NULL
    CHECK (source_type IN ('RESTOCK_BATCH', 'SALE_ORDER', 'ADJUSTMENT', 'SYSTEM')),
  source_id TEXT NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  CONSTRAINT fk_v0_inventory_journal_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_inventory_journal_item
    FOREIGN KEY (tenant_id, stock_item_id)
    REFERENCES v0_inventory_stock_items(tenant_id, id)
    ON DELETE CASCADE,
  UNIQUE (tenant_id, branch_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_inventory_external_source_anchor
  ON v0_inventory_journal_entries(
    tenant_id,
    branch_id,
    source_type,
    source_id,
    stock_item_id,
    reason_code
  )
  WHERE source_type = 'SALE_ORDER'
    AND reason_code IN ('SALE_DEDUCTION', 'VOID_REVERSAL');

CREATE INDEX IF NOT EXISTS idx_v0_inventory_journal_branch_occurred
  ON v0_inventory_journal_entries(tenant_id, branch_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_v0_inventory_journal_item_occurred
  ON v0_inventory_journal_entries(tenant_id, stock_item_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_v0_inventory_journal_reason_occurred
  ON v0_inventory_journal_entries(tenant_id, reason_code, occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS v0_inventory_branch_stock (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  stock_item_id UUID NOT NULL,
  on_hand_in_base_unit NUMERIC(16,4) NOT NULL DEFAULT 0,
  last_movement_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, branch_id, stock_item_id),
  CONSTRAINT fk_v0_inventory_branch_stock_branch
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_v0_inventory_branch_stock_item
    FOREIGN KEY (tenant_id, stock_item_id)
    REFERENCES v0_inventory_stock_items(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_v0_inventory_branch_stock_branch
  ON v0_inventory_branch_stock(tenant_id, branch_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_inventory_branch_stock_item
  ON v0_inventory_branch_stock(tenant_id, stock_item_id, updated_at DESC);

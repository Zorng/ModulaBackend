-- Migration: Create branch-specific menu item overrides
-- Purpose: Store per-branch availability, custom pricing, and display order
-- Dependencies: 0002_create_menu_items.sql, requires branches table

-- Branch menu items (overrides)
CREATE TABLE IF NOT EXISTS menu_branch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  is_available BOOLEAN NOT NULL DEFAULT true,
  custom_price_usd NUMERIC(10, 2) CHECK (custom_price_usd IS NULL OR custom_price_usd >= 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_branch_items_tenant ON menu_branch_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branch_items_branch ON menu_branch_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_items_item ON menu_branch_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_branch_items_available ON menu_branch_items(branch_id, is_available);

-- Unique constraint: one override record per branch per item per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_items_unique 
  ON menu_branch_items(tenant_id, branch_id, menu_item_id);

-- Trigger

DROP TRIGGER IF EXISTS trigger_branch_items_updated_at ON menu_branch_items;
CREATE TRIGGER trigger_branch_items_updated_at
  BEFORE UPDATE ON menu_branch_items
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();

-- Comments
COMMENT ON TABLE menu_branch_items IS 'Per-branch overrides for menu item availability and pricing';
COMMENT ON COLUMN menu_branch_items.is_available IS 'If false, item is hidden from POS for this branch';
COMMENT ON COLUMN menu_branch_items.custom_price_usd IS 'Overrides menu_items.price_usd if set (requires policy flag)';
COMMENT ON COLUMN menu_branch_items.display_order IS 'Branch-specific ordering within category';

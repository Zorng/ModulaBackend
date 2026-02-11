-- Migration: Create menu-to-inventory mapping table
-- Purpose: Link menu items to stock items for automatic deduction on sale
-- Dependencies: 0002_create_menu_items.sql, requires inventory.stock_items table

DROP TABLE IF EXISTS menu_stock_map CASCADE;

-- Menu to stock item mapping (supports multiple stock items per menu item)
CREATE TABLE menu_stock_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  qty_per_sale NUMERIC(10, 3) NOT NULL CHECK (qty_per_sale > 0),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(menu_item_id, stock_item_id) -- One menu item can have multiple stock items, but each stock item only once
);

-- Index for common query patterns
CREATE INDEX idx_menu_stock_map_menu_item ON menu_stock_map(menu_item_id);
CREATE INDEX idx_menu_stock_map_tenant_stock ON menu_stock_map(tenant_id, stock_item_id);
CREATE INDEX idx_menu_stock_map_stock_item ON menu_stock_map(stock_item_id);

-- Trigger
DROP TRIGGER IF EXISTS trigger_menu_stock_map_updated_at ON menu_stock_map;
CREATE TRIGGER trigger_menu_stock_map_updated_at
  BEFORE UPDATE ON menu_stock_map
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();

-- Comments
COMMENT ON TABLE menu_stock_map IS 'Links menu items to inventory stock items for automatic deduction (supports multiple stock items per menu item)';
COMMENT ON COLUMN menu_stock_map.qty_per_sale IS 'Quantity (in base UOM) deducted per item sold (supports decimals)';
COMMENT ON COLUMN menu_stock_map.menu_item_id IS 'Each menu item can map to multiple stock items (recipe/ingredients)';

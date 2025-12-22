-- Migration: Create menu items table
-- Purpose: Store individual menu items (Iced Latte, Orange Juice, etc.)
-- Dependencies: 0001_create_categories.sql

-- Menu items table
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  price_usd NUMERIC(10, 2) NOT NULL CHECK (price_usd >= 0),
  image_url TEXT, -- URL to uploaded image (≤300KB, JPEG/WEBP)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant ON menu_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items(tenant_id, is_active);

-- Unique constraint: item name must be unique within category per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_unique_name 
  ON menu_items(tenant_id, category_id, LOWER(name));

-- Trigger for updated_at

DROP TRIGGER IF EXISTS trigger_menu_items_updated_at ON menu_items;
CREATE TRIGGER trigger_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at(); -- Reuse the same function

-- Comments
COMMENT ON TABLE menu_items IS 'Individual menu items that can be sold';
COMMENT ON COLUMN menu_items.price_usd IS 'Base price in USD before modifiers and discounts';
COMMENT ON COLUMN menu_items.image_url IS 'Reference to image storage (validate ≤300KB client-side)';

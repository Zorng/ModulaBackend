-- Migration: Create menu categories table
-- Purpose: Store menu categories (Coffee, Tea, Juice, etc.) with display ordering
-- Dependencies: Requires tenants table to exist

-- Categories table
CREATE TABLE IF NOT EXISTS menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL, -- user who created this category
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_menu_categories_tenant ON menu_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_active ON menu_categories(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_menu_categories_display_order ON menu_categories(tenant_id, display_order);

-- Unique constraint: category name must be unique per tenant (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_categories_unique_name 
  ON menu_categories(tenant_id, LOWER(name));

-- Trigger to update updated_at timestamp
-- Note: shared trigger function is defined in `migrations/000_platform_bootstrap.sql`

DROP TRIGGER IF EXISTS trigger_menu_categories_updated_at ON menu_categories;
CREATE TRIGGER trigger_menu_categories_updated_at
  BEFORE UPDATE ON menu_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();

-- Comments for documentation
COMMENT ON TABLE menu_categories IS 'Menu categories for organizing menu items (e.g., Coffee, Tea, Desserts)';
COMMENT ON COLUMN menu_categories.display_order IS 'Lower numbers appear first in POS interface';

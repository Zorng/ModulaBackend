-- Migration: Create modifier groups and options tables
-- Purpose: Store reusable modifiers (Sugar Level, Ice Level, Toppings, etc.)
-- Dependencies: None (standalone)

-- Modifier groups (e.g., "Sugar Level", "Toppings")
CREATE TABLE IF NOT EXISTS menu_modifier_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  selection_type VARCHAR(20) NOT NULL CHECK (selection_type IN ('SINGLE', 'MULTI')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_modifier_groups_tenant ON menu_modifier_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_modifier_groups_active ON menu_modifier_groups(tenant_id, is_active);

-- Unique constraint: group name per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_modifier_groups_unique_name 
  ON menu_modifier_groups(tenant_id, LOWER(name));

-- Modifier options within a group (e.g., "No Sugar", "Less Sugar", "Normal", "Extra")
CREATE TABLE IF NOT EXISTS menu_modifier_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_group_id UUID NOT NULL REFERENCES menu_modifier_groups(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,
  price_adjustment_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON menu_modifier_options(modifier_group_id);
CREATE INDEX IF NOT EXISTS idx_modifier_options_active ON menu_modifier_options(modifier_group_id, is_active);

-- Unique constraint: option label within a group
CREATE UNIQUE INDEX IF NOT EXISTS idx_modifier_options_unique_label 
  ON menu_modifier_options(modifier_group_id, LOWER(label));

-- Triggers

DROP TRIGGER IF EXISTS trigger_modifier_groups_updated_at ON menu_modifier_groups;
CREATE TRIGGER trigger_modifier_groups_updated_at
  BEFORE UPDATE ON menu_modifier_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();


DROP TRIGGER IF EXISTS trigger_modifier_options_updated_at ON menu_modifier_options;
CREATE TRIGGER trigger_modifier_options_updated_at
  BEFORE UPDATE ON menu_modifier_options
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();

-- Comments
COMMENT ON TABLE menu_modifier_groups IS 'Reusable modifier groups that can be attached to multiple menu items';
COMMENT ON COLUMN menu_modifier_groups.selection_type IS 'SINGLE=radio buttons, MULTI=checkboxes';
COMMENT ON COLUMN menu_modifier_groups.is_active IS 'Soft delete flag - false means group is deleted but preserved for data integrity';
COMMENT ON TABLE menu_modifier_options IS 'Individual options within a modifier group';
COMMENT ON COLUMN menu_modifier_options.price_adjustment_usd IS 'Added to item price if selected (can be negative)';

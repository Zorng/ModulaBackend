-- Migration: Create junction table linking menu items to modifier groups
-- Purpose: Allow menu items to have multiple modifier groups attached
-- Dependencies: 0002_create_menu_items.sql, 0003_create_modifiers.sql

-- Junction table: which modifier groups are attached to which menu items
CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  modifier_group_id UUID NOT NULL REFERENCES menu_modifier_groups(id) ON DELETE CASCADE,
  is_required BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0, -- Order modifiers appear in POS
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_item_modifiers_tenant ON menu_item_modifier_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_item_modifiers_item ON menu_item_modifier_groups(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_item_modifiers_group ON menu_item_modifier_groups(modifier_group_id);

-- Unique constraint: can't attach same modifier group twice to same item (per tenant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_modifiers_unique 
  ON menu_item_modifier_groups(tenant_id, menu_item_id, modifier_group_id);

-- Check constraint: enforce max 5 modifier groups per item (enforced in app too)
-- Note: This is a database-level safeguard; primary enforcement is in application logic
CREATE OR REPLACE FUNCTION check_modifier_group_limit()
RETURNS TRIGGER AS $$
DECLARE
  group_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO group_count
  FROM menu_item_modifier_groups
  WHERE menu_item_id = NEW.menu_item_id
    AND tenant_id = NEW.tenant_id;
  
  IF group_count >= 5 THEN
    RAISE EXCEPTION 'Menu item cannot have more than 5 modifier groups';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_modifier_group_limit ON menu_item_modifier_groups;
CREATE TRIGGER trigger_check_modifier_group_limit
  BEFORE INSERT ON menu_item_modifier_groups
  FOR EACH ROW
  EXECUTE FUNCTION check_modifier_group_limit();

-- Comments
COMMENT ON TABLE menu_item_modifier_groups IS 'Links menu items to their available modifier groups (multi-tenant)';
COMMENT ON COLUMN menu_item_modifier_groups.tenant_id IS 'Tenant that owns this menu item-modifier relationship';
COMMENT ON COLUMN menu_item_modifier_groups.is_required IS 'Whether this modifier group must be selected when ordering the item';
COMMENT ON COLUMN menu_item_modifier_groups.display_order IS 'Order in which modifier groups appear in POS UI';

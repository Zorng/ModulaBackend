-- Store Policy Inventory
-- Controls automatic inventory deduction behavior per tenant
DROP TABLE IF EXISTS store_policy_inventory CASCADE;

CREATE TABLE store_policy_inventory (
  tenant_id UUID PRIMARY KEY,
  
  -- Default policy: whether to subtract inventory on sale finalization
  inventory_subtract_on_finalize BOOLEAN NOT NULL DEFAULT true,
  
  -- Branch-level overrides (JSONB array)
  -- Format: [{"branchId": "...", "inventorySubtractOnFinalize": true/false}]
  branch_overrides JSONB DEFAULT '[]'::jsonb,
  
  -- Menu items to exclude from automatic deduction (JSONB array of menu item IDs)
  -- Format: ["menu_item_id_1", "menu_item_id_2"]
  exclude_menu_item_ids JSONB DEFAULT '[]'::jsonb,
  
  created_by VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by VARCHAR(50),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_store_policy_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES tenants(id)
    ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX idx_store_policy_tenant ON store_policy_inventory(tenant_id);

COMMENT ON TABLE store_policy_inventory IS 'Controls automatic inventory deduction on sale finalization per tenant';
COMMENT ON COLUMN store_policy_inventory.inventory_subtract_on_finalize IS 'Default policy: true = auto-deduct inventory on sale finalize';
COMMENT ON COLUMN store_policy_inventory.branch_overrides IS 'Branch-specific overrides for inventory deduction policy';
COMMENT ON COLUMN store_policy_inventory.exclude_menu_item_ids IS 'Menu items that should never trigger automatic inventory deduction';

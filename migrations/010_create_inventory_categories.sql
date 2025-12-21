-- Create inventory_categories table
DROP TABLE IF EXISTS inventory_categories CASCADE;

CREATE TABLE inventory_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    name            TEXT NOT NULL,
    display_order   INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_inventory_categories_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Indexes for performance
CREATE INDEX idx_inventory_categories_tenant ON inventory_categories(tenant_id);
CREATE INDEX idx_inventory_categories_active ON inventory_categories(tenant_id, is_active);
CREATE INDEX idx_inventory_categories_display_order ON inventory_categories(tenant_id, display_order);

-- Unique constraint: category name must be unique per tenant (case-insensitive)
CREATE UNIQUE INDEX idx_inventory_categories_unique_name 
  ON inventory_categories(tenant_id, LOWER(name));

-- Trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS trigger_inventory_categories_updated_at ON inventory_categories;
CREATE TRIGGER trigger_inventory_categories_updated_at
  BEFORE UPDATE ON inventory_categories
  FOR EACH ROW
  EXECUTE PROCEDURE update_row_updated_at();

-- Comment on table
COMMENT ON TABLE inventory_categories IS 'Categories for organizing inventory stock items';

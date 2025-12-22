DROP TABLE IF EXISTS stock_items CASCADE;

CREATE TABLE stock_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    name            TEXT NOT NULL,
    unit_text       TEXT NOT NULL,
    barcode         TEXT,
    piece_size      NUMERIC(12,4),
    is_ingredient   BOOLEAN NOT NULL DEFAULT TRUE,
    is_sellable     BOOLEAN NOT NULL DEFAULT FALSE,
    category_id     UUID,
    image_url       TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_stock_items_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_items_category
        FOREIGN KEY (category_id) REFERENCES inventory_categories(id)
        ON DELETE SET NULL
);
-- Note: pg_trgm extension is enabled in `migrations/000_platform_bootstrap.sql`

CREATE INDEX idx_stock_items_tenant ON stock_items(tenant_id);
CREATE INDEX idx_stock_items_category ON stock_items(category_id);
CREATE INDEX idx_stock_items_name_trgm ON stock_items USING gin (name gin_trgm_ops);

COMMENT ON COLUMN stock_items.piece_size IS 'Size per piece/unit (e.g., weight, volume)';
COMMENT ON COLUMN stock_items.is_ingredient IS 'Can be used as ingredient in recipes';
COMMENT ON COLUMN stock_items.is_sellable IS 'Can be sold directly to customers';
COMMENT ON COLUMN stock_items.category_id IS 'Optional category for organizing stock items';

-- Trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS trigger_stock_items_updated_at ON stock_items;
CREATE TRIGGER trigger_stock_items_updated_at
  BEFORE UPDATE ON stock_items
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();

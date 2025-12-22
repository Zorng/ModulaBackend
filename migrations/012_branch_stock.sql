DROP TABLE IF EXISTS branch_stock;

CREATE TABLE branch_stock (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    branch_id       UUID NOT NULL,
    stock_item_id   UUID NOT NULL,
    min_threshold   NUMERIC(12,4) NOT NULL DEFAULT 0,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_branch_stock_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,

    CONSTRAINT fk_branch_stock_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,

    CONSTRAINT fk_branch_stock_item
        FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE,

    -- Each item can be linked only once per branch
    CONSTRAINT uq_branch_stock UNIQUE (tenant_id, branch_id, stock_item_id)
);

CREATE INDEX idx_branch_stock_branch ON branch_stock(branch_id);
CREATE INDEX idx_branch_stock_item ON branch_stock(stock_item_id);
CREATE INDEX idx_branch_stock_threshold ON branch_stock(min_threshold);

-- Trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS trigger_branch_stock_updated_at ON branch_stock;
CREATE TRIGGER trigger_branch_stock_updated_at
  BEFORE UPDATE ON branch_stock
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();

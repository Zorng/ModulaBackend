DROP TABLE IF EXISTS inventory_journal CASCADE;
DROP TYPE IF EXISTS inventory_reason CASCADE;

CREATE TYPE inventory_reason AS ENUM (
    'receive',
    'sale',
    'waste',
    'correction',
    'void',
    'reopen'
);

CREATE TABLE inventory_journal (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    branch_id       UUID NOT NULL,
    stock_item_id   UUID NOT NULL,

    delta           NUMERIC(12,4) NOT NULL,   -- + or -
    reason          inventory_reason NOT NULL,

    ref_sale_id     UUID,                      -- Used for sale/void/reopen linking
    note            TEXT,
    actor_id        UUID,                      -- employee who performs action

    -- Future-proof hooks:
    batch_id        UUID,
    unit_cost_usd   NUMERIC(12,4),

    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(), -- When the transaction actually happened (supports backdating)
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_journal_tenant    FOREIGN KEY (tenant_id)    REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_journal_branch    FOREIGN KEY (branch_id)    REFERENCES branches(id) ON DELETE CASCADE,
    CONSTRAINT fk_journal_stock     FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE
);

-- Common filters
CREATE INDEX idx_inv_journal_branch ON inventory_journal(branch_id);
CREATE INDEX idx_inv_journal_item ON inventory_journal(stock_item_id);
CREATE INDEX idx_inv_journal_reason ON inventory_journal(reason);

-- Range / summary by when transaction occurred
CREATE INDEX idx_inv_journal_occurred_at ON inventory_journal(occurred_at);
CREATE INDEX idx_inv_journal_created_at ON inventory_journal(created_at);

-- For sale/void relations
CREATE INDEX idx_inv_journal_ref_sale ON inventory_journal(ref_sale_id);

-- Trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS trigger_inventory_journal_updated_at ON inventory_journal;
CREATE TRIGGER trigger_inventory_journal_updated_at
  BEFORE UPDATE ON inventory_journal
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();

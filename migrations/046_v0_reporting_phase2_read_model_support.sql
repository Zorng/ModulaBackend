-- Reporting rollout (Phase 2: data model + query-performance support)
-- Adds reporting-friendly snapshot fields and read indexes.

ALTER TABLE v0_sales
  ADD COLUMN IF NOT EXISTS sale_type VARCHAR(20) NOT NULL DEFAULT 'DINE_IN';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_v0_sales_sale_type'
  ) THEN
    ALTER TABLE v0_sales
      ADD CONSTRAINT ck_v0_sales_sale_type
      CHECK (sale_type IN ('DINE_IN', 'TAKEAWAY', 'DELIVERY'));
  END IF;
END $$;

ALTER TABLE v0_sale_lines
  ADD COLUMN IF NOT EXISTS menu_category_id_snapshot UUID NULL,
  ADD COLUMN IF NOT EXISTS menu_category_name_snapshot VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS idx_v0_sales_tenant_status_finalized_at
  ON v0_sales(tenant_id, status, finalized_at DESC)
  WHERE finalized_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_v0_sales_tenant_branch_status_finalized_at
  ON v0_sales(tenant_id, branch_id, status, finalized_at DESC)
  WHERE finalized_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_v0_sale_lines_tenant_sale_menu_item
  ON v0_sale_lines(tenant_id, sale_id, menu_item_id);

CREATE INDEX IF NOT EXISTS idx_v0_sale_lines_tenant_category_snapshot
  ON v0_sale_lines(tenant_id, menu_category_name_snapshot);

CREATE INDEX IF NOT EXISTS idx_v0_inventory_restock_tenant_received_at
  ON v0_inventory_restock_batches(tenant_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_inventory_restock_tenant_branch_received_at
  ON v0_inventory_restock_batches(tenant_id, branch_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_attendance_records_tenant_occurred
  ON v0_attendance_records(tenant_id, occurred_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_attendance_records_tenant_branch_occurred
  ON v0_attendance_records(tenant_id, branch_id, occurred_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_audit_events_tenant_action_created
  ON v0_audit_events(tenant_id, action_key, created_at DESC);

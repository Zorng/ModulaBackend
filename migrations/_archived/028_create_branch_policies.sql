-- Migration: Create branch_policies projection table
-- Purpose: Provide branch-scoped, pre-resolved policy reads for hot paths (e.g., sales gating)
-- Notes:
-- - Source-of-truth remains tenant-level policy tables (+ inventory branch_overrides JSON).
-- - This table is a projection maintained by lightweight triggers for deterministic reads.

CREATE TABLE IF NOT EXISTS branch_policies (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

    -- Cash Session
    cash_require_session_for_sales BOOLEAN NOT NULL DEFAULT FALSE,

    -- Inventory (branch override resolved)
    inventory_auto_subtract_on_sale BOOLEAN NOT NULL DEFAULT TRUE,
    inventory_expiry_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (tenant_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_policies_tenant_id ON branch_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branch_policies_branch_id ON branch_policies(branch_id);

COMMENT ON TABLE branch_policies IS 'Branch-scoped policy projection derived from tenant policy tables';
COMMENT ON COLUMN branch_policies.cash_require_session_for_sales IS 'Resolved cash session gating policy for this branch';
COMMENT ON COLUMN branch_policies.inventory_auto_subtract_on_sale IS 'Resolved inventory auto-subtract policy for this branch';
COMMENT ON COLUMN branch_policies.inventory_expiry_tracking_enabled IS 'Resolved inventory expiry tracking policy (tenant-level)';

-- ==================== Projection refresh helpers ====================

CREATE OR REPLACE FUNCTION refresh_branch_policies_for_tenant(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO branch_policies (
    tenant_id,
    branch_id,
    cash_require_session_for_sales,
    inventory_auto_subtract_on_sale,
    inventory_expiry_tracking_enabled
  )
  SELECT
    b.tenant_id,
    b.id AS branch_id,
    COALESCE(csp.require_session_for_sales, FALSE) AS cash_require_session_for_sales,
    COALESCE(
      NULLIF((ip.branch_overrides -> b.id::text ->> 'inventorySubtractOnFinalize'), '')::BOOLEAN,
      ip.auto_subtract_on_sale,
      TRUE
    ) AS inventory_auto_subtract_on_sale,
    COALESCE(ip.expiry_tracking_enabled, FALSE) AS inventory_expiry_tracking_enabled
  FROM branches b
  LEFT JOIN cash_session_policies csp ON csp.tenant_id = b.tenant_id
  LEFT JOIN inventory_policies ip ON ip.tenant_id = b.tenant_id
  WHERE b.tenant_id = p_tenant_id
  ON CONFLICT (tenant_id, branch_id) DO UPDATE SET
    cash_require_session_for_sales = EXCLUDED.cash_require_session_for_sales,
    inventory_auto_subtract_on_sale = EXCLUDED.inventory_auto_subtract_on_sale,
    inventory_expiry_tracking_enabled = EXCLUDED.inventory_expiry_tracking_enabled,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Insert/refresh a single branch row (used by branch insert trigger)
CREATE OR REPLACE FUNCTION refresh_branch_policies_for_branch(p_tenant_id UUID, p_branch_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO branch_policies (
    tenant_id,
    branch_id,
    cash_require_session_for_sales,
    inventory_auto_subtract_on_sale,
    inventory_expiry_tracking_enabled
  )
  SELECT
    p_tenant_id,
    p_branch_id,
    COALESCE(csp.require_session_for_sales, FALSE) AS cash_require_session_for_sales,
    COALESCE(
      NULLIF((ip.branch_overrides -> p_branch_id::text ->> 'inventorySubtractOnFinalize'), '')::BOOLEAN,
      ip.auto_subtract_on_sale,
      TRUE
    ) AS inventory_auto_subtract_on_sale,
    COALESCE(ip.expiry_tracking_enabled, FALSE) AS inventory_expiry_tracking_enabled
  FROM (SELECT 1) AS _dummy
  LEFT JOIN cash_session_policies csp ON csp.tenant_id = p_tenant_id
  LEFT JOIN inventory_policies ip ON ip.tenant_id = p_tenant_id
  ON CONFLICT (tenant_id, branch_id) DO UPDATE SET
    cash_require_session_for_sales = EXCLUDED.cash_require_session_for_sales,
    inventory_auto_subtract_on_sale = EXCLUDED.inventory_auto_subtract_on_sale,
    inventory_expiry_tracking_enabled = EXCLUDED.inventory_expiry_tracking_enabled,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ==================== Triggers ====================

-- Keep projection in sync when a branch is created
CREATE OR REPLACE FUNCTION trigger_refresh_branch_policies_on_branch_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_branch_policies_for_branch(NEW.tenant_id, NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_branch_policies_on_branch_insert ON branches;
CREATE TRIGGER trigger_branch_policies_on_branch_insert
AFTER INSERT ON branches
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_branch_policies_on_branch_insert();

-- Refresh projection when relevant tenant policy rows change
CREATE OR REPLACE FUNCTION trigger_refresh_branch_policies_on_policy_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_branch_policies_for_tenant(NEW.tenant_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_branch_policies_on_cash_session_policies_change ON cash_session_policies;
CREATE TRIGGER trigger_branch_policies_on_cash_session_policies_change
AFTER INSERT OR UPDATE ON cash_session_policies
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_branch_policies_on_policy_change();

DROP TRIGGER IF EXISTS trigger_branch_policies_on_inventory_policies_change ON inventory_policies;
CREATE TRIGGER trigger_branch_policies_on_inventory_policies_change
AFTER INSERT OR UPDATE ON inventory_policies
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_branch_policies_on_policy_change();

-- ==================== Backfill ====================

-- Populate projection rows for existing branches (idempotent)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT tenant_id FROM branches LOOP
    PERFORM refresh_branch_policies_for_tenant(r.tenant_id);
  END LOOP;
END $$;


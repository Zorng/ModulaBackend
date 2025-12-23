-- Migration: Create branch-scoped policy tables (source of truth)
-- Purpose: Align policy storage with branch-scoped ModSpec requirements

-- ==================== SALES POLICIES (Branch) ====================
CREATE TABLE IF NOT EXISTS branch_sales_policies (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

    vat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    vat_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    fx_rate_khr_per_usd NUMERIC(10,2) NOT NULL DEFAULT 4100.00,
    khr_rounding_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    khr_rounding_mode VARCHAR(20) NOT NULL DEFAULT 'NEAREST' CHECK (khr_rounding_mode IN ('NEAREST', 'UP', 'DOWN')),
    khr_rounding_granularity VARCHAR(10) NOT NULL DEFAULT '100' CHECK (khr_rounding_granularity IN ('100', '1000')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (tenant_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_sales_policies_tenant_id ON branch_sales_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branch_sales_policies_branch_id ON branch_sales_policies(branch_id);

-- ==================== INVENTORY POLICIES (Branch) ====================
CREATE TABLE IF NOT EXISTS branch_inventory_policies (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

    auto_subtract_on_sale BOOLEAN NOT NULL DEFAULT TRUE,
    expiry_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    exclude_menu_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (tenant_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_policies_tenant_id ON branch_inventory_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_policies_branch_id ON branch_inventory_policies(branch_id);

-- ==================== CASH SESSION POLICIES (Branch) ====================
CREATE TABLE IF NOT EXISTS branch_cash_session_policies (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

    require_session_for_sales BOOLEAN NOT NULL DEFAULT FALSE,
    allow_paid_out BOOLEAN NOT NULL DEFAULT FALSE,
    require_refund_approval BOOLEAN NOT NULL DEFAULT FALSE,
    allow_manual_adjustment BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (tenant_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_cash_session_policies_tenant_id ON branch_cash_session_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branch_cash_session_policies_branch_id ON branch_cash_session_policies(branch_id);

-- ==================== ATTENDANCE POLICIES (Branch) ====================
CREATE TABLE IF NOT EXISTS branch_attendance_policies (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

    auto_from_cash_session BOOLEAN NOT NULL DEFAULT FALSE,
    require_out_of_shift_approval BOOLEAN NOT NULL DEFAULT FALSE,
    early_checkin_buffer_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    checkin_buffer_minutes INTEGER NOT NULL DEFAULT 15,
    allow_manager_edits BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (tenant_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_attendance_policies_tenant_id ON branch_attendance_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branch_attendance_policies_branch_id ON branch_attendance_policies(branch_id);

-- ==================== UPDATE TRIGGERS ====================
DROP TRIGGER IF EXISTS trigger_branch_sales_policies_updated_at ON branch_sales_policies;
CREATE TRIGGER trigger_branch_sales_policies_updated_at
    BEFORE UPDATE ON branch_sales_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_policy_updated_at();

DROP TRIGGER IF EXISTS trigger_branch_inventory_policies_updated_at ON branch_inventory_policies;
CREATE TRIGGER trigger_branch_inventory_policies_updated_at
    BEFORE UPDATE ON branch_inventory_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_policy_updated_at();

DROP TRIGGER IF EXISTS trigger_branch_cash_session_policies_updated_at ON branch_cash_session_policies;
CREATE TRIGGER trigger_branch_cash_session_policies_updated_at
    BEFORE UPDATE ON branch_cash_session_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_policy_updated_at();

DROP TRIGGER IF EXISTS trigger_branch_attendance_policies_updated_at ON branch_attendance_policies;
CREATE TRIGGER trigger_branch_attendance_policies_updated_at
    BEFORE UPDATE ON branch_attendance_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_policy_updated_at();

-- ==================== BACKFILL FROM TENANT-LEVEL TABLES ====================
INSERT INTO branch_sales_policies (
    tenant_id,
    branch_id,
    vat_enabled,
    vat_rate_percent,
    fx_rate_khr_per_usd,
    khr_rounding_enabled,
    khr_rounding_mode,
    khr_rounding_granularity
)
SELECT
    b.tenant_id,
    b.id,
    COALESCE(sp.vat_enabled, FALSE),
    COALESCE(sp.vat_rate_percent, 10.00),
    COALESCE(sp.fx_rate_khr_per_usd, 4100.00),
    COALESCE(sp.khr_rounding_enabled, TRUE),
    COALESCE(sp.khr_rounding_mode, 'NEAREST'),
    COALESCE(sp.khr_rounding_granularity, '100')
FROM branches b
LEFT JOIN sales_policies sp ON sp.tenant_id = b.tenant_id
ON CONFLICT (tenant_id, branch_id) DO NOTHING;

INSERT INTO branch_inventory_policies (
    tenant_id,
    branch_id,
    auto_subtract_on_sale,
    expiry_tracking_enabled,
    exclude_menu_item_ids
)
SELECT
    b.tenant_id,
    b.id,
    COALESCE(ip.auto_subtract_on_sale, TRUE),
    COALESCE(ip.expiry_tracking_enabled, FALSE),
    COALESCE(ip.exclude_menu_item_ids, '[]'::jsonb)
FROM branches b
LEFT JOIN inventory_policies ip ON ip.tenant_id = b.tenant_id
ON CONFLICT (tenant_id, branch_id) DO NOTHING;

INSERT INTO branch_cash_session_policies (
    tenant_id,
    branch_id,
    require_session_for_sales,
    allow_paid_out,
    require_refund_approval,
    allow_manual_adjustment
)
SELECT
    b.tenant_id,
    b.id,
    COALESCE(cp.require_session_for_sales, FALSE),
    COALESCE(cp.allow_paid_out, FALSE),
    COALESCE(cp.require_refund_approval, FALSE),
    COALESCE(cp.allow_manual_adjustment, FALSE)
FROM branches b
LEFT JOIN cash_session_policies cp ON cp.tenant_id = b.tenant_id
ON CONFLICT (tenant_id, branch_id) DO NOTHING;

INSERT INTO branch_attendance_policies (
    tenant_id,
    branch_id,
    auto_from_cash_session,
    require_out_of_shift_approval,
    early_checkin_buffer_enabled,
    checkin_buffer_minutes,
    allow_manager_edits
)
SELECT
    b.tenant_id,
    b.id,
    COALESCE(ap.auto_from_cash_session, FALSE),
    COALESCE(ap.require_out_of_shift_approval, FALSE),
    COALESCE(ap.early_checkin_buffer_enabled, FALSE),
    COALESCE(ap.checkin_buffer_minutes, 15),
    COALESCE(ap.allow_manager_edits, FALSE)
FROM branches b
LEFT JOIN attendance_policies ap ON ap.tenant_id = b.tenant_id
ON CONFLICT (tenant_id, branch_id) DO NOTHING;

-- ==================== DEFAULTS FOR NEW BRANCHES ====================
CREATE OR REPLACE FUNCTION ensure_branch_policy_defaults()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO branch_sales_policies (tenant_id, branch_id)
  VALUES (NEW.tenant_id, NEW.id)
  ON CONFLICT (tenant_id, branch_id) DO NOTHING;

  INSERT INTO branch_inventory_policies (tenant_id, branch_id)
  VALUES (NEW.tenant_id, NEW.id)
  ON CONFLICT (tenant_id, branch_id) DO NOTHING;

  INSERT INTO branch_cash_session_policies (tenant_id, branch_id)
  VALUES (NEW.tenant_id, NEW.id)
  ON CONFLICT (tenant_id, branch_id) DO NOTHING;

  INSERT INTO branch_attendance_policies (tenant_id, branch_id)
  VALUES (NEW.tenant_id, NEW.id)
  ON CONFLICT (tenant_id, branch_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_branch_policy_defaults ON branches;
CREATE TRIGGER trigger_branch_policy_defaults
AFTER INSERT ON branches
FOR EACH ROW
EXECUTE FUNCTION ensure_branch_policy_defaults();

-- ==================== BRANCH POLICIES PROJECTION ====================
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
    COALESCE(ip.auto_subtract_on_sale, TRUE) AS inventory_auto_subtract_on_sale,
    COALESCE(ip.expiry_tracking_enabled, FALSE) AS inventory_expiry_tracking_enabled
  FROM branches b
  LEFT JOIN branch_cash_session_policies csp
    ON csp.tenant_id = b.tenant_id AND csp.branch_id = b.id
  LEFT JOIN branch_inventory_policies ip
    ON ip.tenant_id = b.tenant_id AND ip.branch_id = b.id
  WHERE b.tenant_id = p_tenant_id
  ON CONFLICT (tenant_id, branch_id) DO UPDATE SET
    cash_require_session_for_sales = EXCLUDED.cash_require_session_for_sales,
    inventory_auto_subtract_on_sale = EXCLUDED.inventory_auto_subtract_on_sale,
    inventory_expiry_tracking_enabled = EXCLUDED.inventory_expiry_tracking_enabled,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

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
    COALESCE(ip.auto_subtract_on_sale, TRUE) AS inventory_auto_subtract_on_sale,
    COALESCE(ip.expiry_tracking_enabled, FALSE) AS inventory_expiry_tracking_enabled
  FROM (SELECT 1) AS _dummy
  LEFT JOIN branch_cash_session_policies csp
    ON csp.tenant_id = p_tenant_id AND csp.branch_id = p_branch_id
  LEFT JOIN branch_inventory_policies ip
    ON ip.tenant_id = p_tenant_id AND ip.branch_id = p_branch_id
  ON CONFLICT (tenant_id, branch_id) DO UPDATE SET
    cash_require_session_for_sales = EXCLUDED.cash_require_session_for_sales,
    inventory_auto_subtract_on_sale = EXCLUDED.inventory_auto_subtract_on_sale,
    inventory_expiry_tracking_enabled = EXCLUDED.inventory_expiry_tracking_enabled,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_refresh_branch_policies_on_policy_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_branch_policies_for_tenant(NEW.tenant_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_branch_policies_on_cash_session_policies_change ON cash_session_policies;
DROP TRIGGER IF EXISTS trigger_branch_policies_on_inventory_policies_change ON inventory_policies;

DROP TRIGGER IF EXISTS trigger_branch_policies_on_branch_cash_session_change ON branch_cash_session_policies;
CREATE TRIGGER trigger_branch_policies_on_branch_cash_session_change
AFTER INSERT OR UPDATE ON branch_cash_session_policies
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_branch_policies_on_policy_change();

DROP TRIGGER IF EXISTS trigger_branch_policies_on_branch_inventory_change ON branch_inventory_policies;
CREATE TRIGGER trigger_branch_policies_on_branch_inventory_change
AFTER INSERT OR UPDATE ON branch_inventory_policies
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_branch_policies_on_policy_change();

-- Backfill projection rows
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT tenant_id FROM branches LOOP
    PERFORM refresh_branch_policies_for_tenant(r.tenant_id);
  END LOOP;
END $$;


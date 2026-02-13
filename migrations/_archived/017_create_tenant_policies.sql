-- Migration: Create tenant policies tables
-- Purpose: Store tenant-level configuration matching frontend UI
-- Only includes policies displayed in the settings screen
-- Note: shared extensions are created in `migrations/000_platform_bootstrap.sql`

-- ==================== SALES POLICIES (Tax & Currency) ====================
CREATE TABLE IF NOT EXISTS sales_policies (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Apply VAT (On/Off with rate)
    vat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    vat_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    
    -- KHR per USD exchange rate
    fx_rate_khr_per_usd NUMERIC(10,2) NOT NULL DEFAULT 4100.00,
    
    -- Rounding settings
    khr_rounding_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    khr_rounding_mode VARCHAR(20) NOT NULL DEFAULT 'NEAREST' CHECK (khr_rounding_mode IN ('NEAREST', 'UP', 'DOWN')),
    khr_rounding_granularity VARCHAR(10) NOT NULL DEFAULT '100' CHECK (khr_rounding_granularity IN ('100', '1000')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_policies_tenant_id ON sales_policies(tenant_id);

COMMENT ON TABLE sales_policies IS 'Tax & currency policy settings';
COMMENT ON COLUMN sales_policies.vat_enabled IS 'Apply VAT at checkout';
COMMENT ON COLUMN sales_policies.vat_rate_percent IS 'VAT rate (e.g., 10 for 10%)';
COMMENT ON COLUMN sales_policies.fx_rate_khr_per_usd IS 'Exchange rate: KHR per 1 USD';
COMMENT ON COLUMN sales_policies.khr_rounding_enabled IS 'Enable/disable KHR rounding';
COMMENT ON COLUMN sales_policies.khr_rounding_mode IS 'How to round KHR totals (NEAREST, UP, DOWN)';
COMMENT ON COLUMN sales_policies.khr_rounding_granularity IS 'Round to nearest 100 or 1000 KHR';

-- ==================== INVENTORY POLICIES ====================
CREATE TABLE IF NOT EXISTS inventory_policies (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Subtract stock on sale (On/Off)
    auto_subtract_on_sale BOOLEAN NOT NULL DEFAULT TRUE,

    -- Branch-level overrides (JSONB object keyed by branchId)
    -- Shape: { "<branchId>": { "inventorySubtractOnFinalize": true/false } }
    branch_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Menu items to exclude from automatic deduction (JSONB array of menu item IDs)
    exclude_menu_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Expiry tracking (On/Off)
    expiry_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill when replaying migrations on an existing DB (CREATE TABLE IF NOT EXISTS won't add columns).
ALTER TABLE inventory_policies
    ADD COLUMN IF NOT EXISTS branch_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE inventory_policies
    ADD COLUMN IF NOT EXISTS exclude_menu_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_inventory_policies_tenant_id ON inventory_policies(tenant_id);

COMMENT ON TABLE inventory_policies IS 'Inventory behavior settings';
COMMENT ON COLUMN inventory_policies.auto_subtract_on_sale IS 'Automatically subtract stock when sale is finalized';
COMMENT ON COLUMN inventory_policies.branch_overrides IS 'Branch-specific overrides for inventory deduction policy';
COMMENT ON COLUMN inventory_policies.exclude_menu_item_ids IS 'Menu items that should never trigger automatic inventory deduction';
COMMENT ON COLUMN inventory_policies.expiry_tracking_enabled IS 'Track product expiry dates';

-- Migrate legacy inventory policy table (if present) into the canonical `inventory_policies` row.
DO $$
BEGIN
    IF to_regclass('public.store_policy_inventory') IS NOT NULL THEN
        INSERT INTO inventory_policies (
            tenant_id,
            auto_subtract_on_sale,
            branch_overrides,
            exclude_menu_item_ids
        )
        SELECT
            tenant_id,
            inventory_subtract_on_finalize,
            COALESCE(branch_overrides, '{}'::jsonb),
            COALESCE(exclude_menu_item_ids, '[]'::jsonb)
        FROM store_policy_inventory
        ON CONFLICT (tenant_id) DO UPDATE SET
            branch_overrides = EXCLUDED.branch_overrides,
            exclude_menu_item_ids = EXCLUDED.exclude_menu_item_ids;
    END IF;
END $$;

-- Legacy table is superseded by `inventory_policies`.
DROP TABLE IF EXISTS store_policy_inventory CASCADE;

-- ==================== CASH SESSION POLICIES ====================
-- TODO: These are inactive by default until cash session module is implemented
CREATE TABLE IF NOT EXISTS cash_session_policies (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Require cash session to sell (On/Off)
    require_session_for_sales BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Allow paid-out (On/Off)
    allow_paid_out BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Cash refund approval (On/Off)
    require_refund_approval BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Manual cash adjustment (On/Off)
    allow_manual_adjustment BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_session_policies_tenant_id ON cash_session_policies(tenant_id);

COMMENT ON TABLE cash_session_policies IS 'Cash session control settings';
COMMENT ON COLUMN cash_session_policies.require_session_for_sales IS 'Require active cash session to make sales';
COMMENT ON COLUMN cash_session_policies.allow_paid_out IS 'Allow paid-out transactions during shift';
COMMENT ON COLUMN cash_session_policies.require_refund_approval IS 'Require manager approval for cash refunds';
COMMENT ON COLUMN cash_session_policies.allow_manual_adjustment IS 'Allow manual cash adjustments';

-- ==================== ATTENDANCE POLICIES ====================
CREATE TABLE IF NOT EXISTS attendance_policies (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Cash Session Attendance (On/Off)
    auto_from_cash_session BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Out of shift approval (On/Off)
    require_out_of_shift_approval BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Early check-in buffer (On/Off with minutes)
    early_checkin_buffer_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    checkin_buffer_minutes INTEGER NOT NULL DEFAULT 15,
    
    -- Manager edit permission (On/Off)
    allow_manager_edits BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_policies_tenant_id ON attendance_policies(tenant_id);

COMMENT ON TABLE attendance_policies IS 'Attendance & shift management settings';
COMMENT ON COLUMN attendance_policies.auto_from_cash_session IS 'Auto-mark attendance from cash session';
COMMENT ON COLUMN attendance_policies.require_out_of_shift_approval IS 'Require approval for out-of-shift actions';
COMMENT ON COLUMN attendance_policies.early_checkin_buffer_enabled IS 'Allow early check-in within buffer period';
COMMENT ON COLUMN attendance_policies.checkin_buffer_minutes IS 'Minutes before shift start for early check-in';
COMMENT ON COLUMN attendance_policies.allow_manager_edits IS 'Allow managers to edit attendance records';

-- ==================== UPDATE TRIGGERS ====================
-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_policy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sales policies trigger
DROP TRIGGER IF EXISTS trigger_sales_policies_updated_at ON sales_policies;
CREATE TRIGGER trigger_sales_policies_updated_at
    BEFORE UPDATE ON sales_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_policy_updated_at();

-- Inventory policies trigger
DROP TRIGGER IF EXISTS trigger_inventory_policies_updated_at ON inventory_policies;
CREATE TRIGGER trigger_inventory_policies_updated_at
    BEFORE UPDATE ON inventory_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_policy_updated_at();

-- Cash session policies trigger
DROP TRIGGER IF EXISTS trigger_cash_session_policies_updated_at ON cash_session_policies;
CREATE TRIGGER trigger_cash_session_policies_updated_at
    BEFORE UPDATE ON cash_session_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_policy_updated_at();

-- Attendance policies trigger
DROP TRIGGER IF EXISTS trigger_attendance_policies_updated_at ON attendance_policies;
CREATE TRIGGER trigger_attendance_policies_updated_at
    BEFORE UPDATE ON attendance_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_policy_updated_at();

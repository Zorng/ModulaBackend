-- Migration: Create unified tenant limits table
-- Purpose: Centralize resource limits per tenant across modules (menu, inventory, staff).
-- Notes:
--  - Replaces legacy `menu_tenant_limits` (menu-only).
--  - Uses DB defaults for provisioning-time inserts.

CREATE TABLE IF NOT EXISTS tenant_limits (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  -- Menu limits (legacy fields)
  max_categories_soft INTEGER NOT NULL DEFAULT 8,
  max_categories_hard INTEGER NOT NULL DEFAULT 12,
  max_items_soft INTEGER NOT NULL DEFAULT 75,
  max_items_hard INTEGER NOT NULL DEFAULT 120,
  max_modifier_groups_per_item INTEGER NOT NULL DEFAULT 5,
  max_modifier_options_per_group INTEGER NOT NULL DEFAULT 12,
  max_total_modifier_options_per_item INTEGER NOT NULL DEFAULT 30,
  max_media_quota_mb INTEGER NOT NULL DEFAULT 10,

  -- Inventory limits
  max_stock_items_soft INTEGER NOT NULL DEFAULT 50,
  max_stock_items_hard INTEGER NOT NULL DEFAULT 75,

  -- Staff seat limits
  max_staff_seats_soft INTEGER NOT NULL DEFAULT 5,
  max_staff_seats_hard INTEGER NOT NULL DEFAULT 10,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trigger_tenant_limits_updated_at ON tenant_limits;
CREATE TRIGGER trigger_tenant_limits_updated_at
  BEFORE UPDATE ON tenant_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();

-- Migrate legacy menu-only limits into the unified table, keeping menu values and applying defaults
-- for inventory + staff limits.
DO $$
BEGIN
  IF to_regclass('public.menu_tenant_limits') IS NOT NULL THEN
    INSERT INTO tenant_limits (
      tenant_id,
      max_categories_soft,
      max_categories_hard,
      max_items_soft,
      max_items_hard,
      max_modifier_groups_per_item,
      max_modifier_options_per_group,
      max_total_modifier_options_per_item,
      max_media_quota_mb
    )
    SELECT
      tenant_id,
      max_categories_soft,
      max_categories_hard,
      max_items_soft,
      max_items_hard,
      max_modifier_groups_per_item,
      max_modifier_options_per_group,
      max_total_modifier_options_per_item,
      max_media_quota_mb
    FROM menu_tenant_limits
    ON CONFLICT (tenant_id) DO NOTHING;
  END IF;
END $$;

-- Backfill defaults for all existing tenants (including dev/test tenants seeded elsewhere).
INSERT INTO tenant_limits (tenant_id)
SELECT id
FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- Legacy table is superseded by `tenant_limits`.
DROP TABLE IF EXISTS menu_tenant_limits CASCADE;
DROP FUNCTION IF EXISTS menu_get_tenant_usage(UUID);

COMMENT ON TABLE tenant_limits IS 'Resource quotas and limits per tenant (menu + inventory + staff)';

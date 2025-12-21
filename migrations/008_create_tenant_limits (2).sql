-- Migration: Create tenant quota/limits configuration table
-- Purpose: Store and enforce resource limits per tenant (prevent abuse)
-- Dependencies: None

-- Tenant limits (quota configuration)
CREATE TABLE IF NOT EXISTS menu_tenant_limits (
  tenant_id UUID PRIMARY KEY, -- REFERENCES tenants(id)
  max_categories_soft INTEGER NOT NULL DEFAULT 8,
  max_categories_hard INTEGER NOT NULL DEFAULT 12,
  max_items_soft INTEGER NOT NULL DEFAULT 75,
  max_items_hard INTEGER NOT NULL DEFAULT 120,
  max_modifier_groups_per_item INTEGER NOT NULL DEFAULT 5,
  max_modifier_options_per_group INTEGER NOT NULL DEFAULT 12,
  max_total_modifier_options_per_item INTEGER NOT NULL DEFAULT 30,
  max_media_quota_mb INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger

DROP TRIGGER IF EXISTS trigger_tenant_limits_updated_at ON menu_tenant_limits;
CREATE TRIGGER trigger_tenant_limits_updated_at
  BEFORE UPDATE ON menu_tenant_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_row_updated_at();

-- Helper function to get current usage counts
CREATE OR REPLACE FUNCTION menu_get_tenant_usage(p_tenant_id UUID)
RETURNS TABLE(
  category_count INTEGER,
  item_count INTEGER,
  media_usage_mb NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM menu_categories WHERE tenant_id = p_tenant_id AND is_active = true),
    (SELECT COUNT(*)::INTEGER FROM menu_items WHERE tenant_id = p_tenant_id AND is_active = true),
    0::NUMERIC; -- TODO: Calculate actual media usage from image storage
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE menu_tenant_limits IS 'Resource quotas and limits per tenant (Phase 1 defaults)';
COMMENT ON COLUMN menu_tenant_limits.max_categories_soft IS 'Warn when tenant approaches this limit';
COMMENT ON COLUMN menu_tenant_limits.max_categories_hard IS 'Block creation when this limit is reached';
COMMENT ON FUNCTION menu_get_tenant_usage IS 'Returns current resource usage for quota checking';

-- Insert default limits for existing test tenants
INSERT INTO menu_tenant_limits (tenant_id) VALUES 
('550e8400-e29b-41d4-a716-446655440000'),  -- Test Restaurant
('550e8400-e29b-41d4-a716-446655440100')   -- Coffee Shop Co
ON CONFLICT (tenant_id) DO NOTHING;
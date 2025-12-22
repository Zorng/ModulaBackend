-- Deprecated migration (kept for ordering stability)
--
-- This file originally created the legacy `menu_tenant_limits` table.
-- Limits are now centralized in `tenant_limits` via:
--   migrations/024_create_unified_tenant_limits.sql
--
-- Intentionally a no-op so fresh replays don't create legacy tables.
SELECT 1;

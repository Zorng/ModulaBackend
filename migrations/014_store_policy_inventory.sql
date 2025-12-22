-- Deprecated migration (kept for ordering stability)
--
-- This file originally created the legacy `store_policy_inventory` table.
-- Inventory policy storage is now centralized in `inventory_policies` and the
-- legacy table is migrated/dropped by:
--   migrations/017_create_tenant_policies.sql
SELECT 1;

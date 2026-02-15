-- Phase F3 follow-up
-- Backfill branch entitlement catalog keys for existing branches.

-- Migrate legacy attendance entitlement key to canonical workforce module key.
INSERT INTO v0_branch_entitlements (tenant_id, branch_id, entitlement_key, enforcement)
SELECT
  tenant_id,
  branch_id,
  'module.workforce',
  enforcement
FROM v0_branch_entitlements
WHERE entitlement_key = 'attendance'
ON CONFLICT (tenant_id, branch_id, entitlement_key)
DO UPDATE SET
  enforcement = EXCLUDED.enforcement,
  updated_at = NOW();

DELETE FROM v0_branch_entitlements
WHERE entitlement_key = 'attendance';

-- Ensure baseline entitlement keys exist for all branches.
INSERT INTO v0_branch_entitlements (tenant_id, branch_id, entitlement_key, enforcement)
SELECT
  b.tenant_id,
  b.id,
  seed.entitlement_key,
  seed.enforcement
FROM branches b
CROSS JOIN (
  VALUES
    ('core.pos', 'ENABLED'),
    ('module.workforce', 'ENABLED'),
    ('module.inventory', 'ENABLED'),
    ('addon.workforce.gps_verification', 'DISABLED_VISIBLE')
) AS seed(entitlement_key, enforcement)
ON CONFLICT (tenant_id, branch_id, entitlement_key) DO NOTHING;

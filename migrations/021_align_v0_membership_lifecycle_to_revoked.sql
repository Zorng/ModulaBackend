-- Align membership/staff lifecycle with KB:
-- membership statuses: INVITED | ACTIVE | REVOKED
-- staff projections keep ACTIVE | REVOKED

ALTER TABLE v0_tenant_memberships
  DROP CONSTRAINT IF EXISTS v0_tenant_memberships_status_check;

ALTER TABLE v0_staff_profiles
  DROP CONSTRAINT IF EXISTS v0_staff_profiles_status_check;

ALTER TABLE v0_branch_assignments
  DROP CONSTRAINT IF EXISTS v0_branch_assignments_status_check;

UPDATE v0_tenant_memberships
SET status = 'REVOKED',
    revoked_at = COALESCE(revoked_at, NOW()),
    updated_at = NOW()
WHERE status IN ('REJECTED', 'DISABLED', 'ARCHIVED');

UPDATE v0_staff_profiles
SET status = 'REVOKED',
    updated_at = NOW()
WHERE status IN ('DISABLED', 'ARCHIVED');

UPDATE v0_branch_assignments
SET status = 'REVOKED',
    revoked_at = COALESCE(revoked_at, NOW()),
    updated_at = NOW()
WHERE status IN ('DISABLED', 'ARCHIVED');

ALTER TABLE v0_tenant_memberships
  ADD CONSTRAINT v0_tenant_memberships_status_check
  CHECK (status IN ('INVITED', 'ACTIVE', 'REVOKED'));

ALTER TABLE v0_staff_profiles
  ADD CONSTRAINT v0_staff_profiles_status_check
  CHECK (status IN ('ACTIVE', 'REVOKED'));

ALTER TABLE v0_branch_assignments
  ADD CONSTRAINT v0_branch_assignments_status_check
  CHECK (status IN ('ACTIVE', 'REVOKED'));

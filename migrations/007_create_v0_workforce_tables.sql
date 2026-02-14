-- v0 restart baseline
-- Workforce projection for tenant memberships: staff profile + branch assignment lifecycle.

CREATE TABLE IF NOT EXISTS v0_staff_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES v0_tenant_memberships(id) ON DELETE CASCADE,
  first_name VARCHAR(120),
  last_name VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, account_id),
  UNIQUE (membership_id)
);

CREATE INDEX IF NOT EXISTS idx_v0_staff_profiles_tenant_status
  ON v0_staff_profiles(tenant_id, status);

CREATE TABLE IF NOT EXISTS v0_membership_pending_branch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_membership_id UUID NOT NULL REFERENCES v0_tenant_memberships(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_membership_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_v0_membership_pending_assignments_membership
  ON v0_membership_pending_branch_assignments(tenant_membership_id);

CREATE TABLE IF NOT EXISTS v0_branch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES v0_tenant_memberships(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'ARCHIVED')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_v0_branch_assignments_membership_status
  ON v0_branch_assignments(membership_id, status);

CREATE INDEX IF NOT EXISTS idx_v0_branch_assignments_account_status
  ON v0_branch_assignments(account_id, status);

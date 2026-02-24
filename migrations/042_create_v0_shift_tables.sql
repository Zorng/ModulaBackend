-- Shift rollout (Phase 2: data model baseline)
-- Planned-work ownership for recurring patterns and dated instances.

CREATE TABLE IF NOT EXISTS v0_shift_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES v0_tenant_memberships(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  days_of_week SMALLINT[] NOT NULL,
  planned_start_time TIME NOT NULL,
  planned_end_time TIME NOT NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  note TEXT NULL,
  created_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  updated_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  deactivated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(days_of_week) > 0),
  CHECK (days_of_week <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]),
  CHECK (planned_start_time < planned_end_time),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_shift_patterns_active_slot
  ON v0_shift_patterns (
    tenant_id,
    membership_id,
    branch_id,
    days_of_week,
    planned_start_time,
    planned_end_time,
    COALESCE(effective_from, DATE '0001-01-01'),
    COALESCE(effective_to, DATE '9999-12-31')
  )
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_v0_shift_patterns_tenant_branch_status
  ON v0_shift_patterns(tenant_id, branch_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_shift_patterns_tenant_membership_status
  ON v0_shift_patterns(tenant_id, membership_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_shift_patterns_tenant_effective_window
  ON v0_shift_patterns(tenant_id, effective_from, effective_to, status);

CREATE TABLE IF NOT EXISTS v0_shift_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES v0_tenant_memberships(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  pattern_id UUID NULL REFERENCES v0_shift_patterns(id) ON DELETE SET NULL,
  shift_date DATE NOT NULL,
  planned_start_time TIME NOT NULL,
  planned_end_time TIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED', 'UPDATED', 'CANCELLED')),
  note TEXT NULL,
  cancelled_reason TEXT NULL,
  created_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  updated_by_account_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (planned_start_time < planned_end_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_v0_shift_instances_active_slot
  ON v0_shift_instances (
    tenant_id,
    membership_id,
    branch_id,
    shift_date,
    planned_start_time,
    planned_end_time
  )
  WHERE status IN ('PLANNED', 'UPDATED');

CREATE INDEX IF NOT EXISTS idx_v0_shift_instances_tenant_branch_date
  ON v0_shift_instances(tenant_id, branch_id, shift_date, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_shift_instances_tenant_membership_date
  ON v0_shift_instances(tenant_id, membership_id, shift_date, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_v0_shift_instances_pattern
  ON v0_shift_instances(pattern_id, shift_date, status);

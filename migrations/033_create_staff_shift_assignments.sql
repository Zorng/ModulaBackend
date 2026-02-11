-- Migration: Create staff shift assignments table
-- Description: Stores weekly shift schedules per staff member and branch

CREATE TABLE IF NOT EXISTS staff_shift_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME,
    end_time TIME,
    is_off BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (employee_id, branch_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_tenant_id
  ON staff_shift_assignments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_employee_id
  ON staff_shift_assignments (employee_id);
CREATE INDEX IF NOT EXISTS idx_staff_shift_assignments_branch_id
  ON staff_shift_assignments (branch_id);

COMMENT ON TABLE staff_shift_assignments IS 'Weekly shift schedule per staff member and branch';

DROP TRIGGER IF EXISTS trigger_staff_shift_assignments_updated_at ON staff_shift_assignments;
CREATE TRIGGER trigger_staff_shift_assignments_updated_at
    BEFORE UPDATE ON staff_shift_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_row_updated_at();

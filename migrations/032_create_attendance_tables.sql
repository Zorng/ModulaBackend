-- Migration: Create attendance tables
-- Description: Adds staff attendance records and out-of-shift approval requests (staff attendance module)

-- Attendance records (immutable check-in/check-out events)
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type VARCHAR(20) CHECK (type IN ('CHECK_IN', 'CHECK_OUT')) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    location JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant_id ON attendance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_branch_id ON attendance_records(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_id ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_occurred_at ON attendance_records(occurred_at);

COMMENT ON TABLE attendance_records IS 'Immutable attendance check-in/check-out events';
COMMENT ON COLUMN attendance_records.location IS 'Optional location payload (reserved for future GPS validation)';

-- Out-of-shift check-in requests
CREATE TABLE IF NOT EXISTS attendance_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    request_type VARCHAR(20) CHECK (request_type IN ('CHECK_IN')) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')) NOT NULL DEFAULT 'PENDING',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    requested_check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES employees(id),
    attendance_record_id UUID REFERENCES attendance_records(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_requests_tenant_id ON attendance_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_requests_branch_id ON attendance_requests(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_requests_employee_id ON attendance_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_requests_status ON attendance_requests(status);
CREATE INDEX IF NOT EXISTS idx_attendance_requests_requested_at ON attendance_requests(requested_at);

COMMENT ON TABLE attendance_requests IS 'Out-of-shift attendance requests requiring approval';
COMMENT ON COLUMN attendance_requests.requested_check_in_at IS 'Intended check-in timestamp at request time';

DROP TRIGGER IF EXISTS trigger_attendance_requests_updated_at ON attendance_requests;
CREATE TRIGGER trigger_attendance_requests_updated_at
    BEFORE UPDATE ON attendance_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_row_updated_at();

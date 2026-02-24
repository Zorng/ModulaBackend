-- Attendance force-end reporting index
-- Speeds up queries by force-end actor within tenant scope.

CREATE INDEX IF NOT EXISTS idx_v0_attendance_force_ended_by_tenant_occurred
  ON v0_attendance_records(tenant_id, force_ended_by_account_id, branch_id, occurred_at DESC)
  WHERE force_ended_by_account_id IS NOT NULL;

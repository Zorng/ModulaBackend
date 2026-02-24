-- Attendance force-end metadata persistence
-- Adds optional forced checkout metadata fields to attendance records.

ALTER TABLE v0_attendance_records
  ADD COLUMN IF NOT EXISTS force_ended_by_account_id UUID,
  ADD COLUMN IF NOT EXISTS force_end_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_v0_attendance_records_force_end_reason_length'
  ) THEN
    ALTER TABLE v0_attendance_records
      ADD CONSTRAINT chk_v0_attendance_records_force_end_reason_length
      CHECK (
        force_end_reason IS NULL
        OR (char_length(force_end_reason) >= 1 AND char_length(force_end_reason) <= 500)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_v0_attendance_records_force_end_pair'
  ) THEN
    ALTER TABLE v0_attendance_records
      ADD CONSTRAINT chk_v0_attendance_records_force_end_pair
      CHECK (
        (force_ended_by_account_id IS NULL AND force_end_reason IS NULL)
        OR (force_ended_by_account_id IS NOT NULL AND force_end_reason IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_v0_attendance_records_force_end_type'
  ) THEN
    ALTER TABLE v0_attendance_records
      ADD CONSTRAINT chk_v0_attendance_records_force_end_type
      CHECK (
        force_ended_by_account_id IS NULL
        OR type = 'CHECK_OUT'
      );
  END IF;
END $$;

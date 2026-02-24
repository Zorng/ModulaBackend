-- Phase HR Attendance (location verification foundation)
-- Adds branch workplace location + attendance location evidence fields.

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS attendance_location_verification_mode VARCHAR(24) NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS workplace_latitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS workplace_longitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS workplace_radius_meters INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_branches_attendance_location_verification_mode'
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT chk_branches_attendance_location_verification_mode
      CHECK (
        attendance_location_verification_mode IN (
          'disabled',
          'checkin_only',
          'checkin_and_checkout'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_branches_workplace_latitude_range'
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT chk_branches_workplace_latitude_range
      CHECK (
        workplace_latitude IS NULL
        OR (workplace_latitude >= -90 AND workplace_latitude <= 90)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_branches_workplace_longitude_range'
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT chk_branches_workplace_longitude_range
      CHECK (
        workplace_longitude IS NULL
        OR (workplace_longitude >= -180 AND workplace_longitude <= 180)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_branches_workplace_radius_range'
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT chk_branches_workplace_radius_range
      CHECK (
        workplace_radius_meters IS NULL
        OR (workplace_radius_meters >= 5 AND workplace_radius_meters <= 5000)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_branches_workplace_location_completeness'
  ) THEN
    ALTER TABLE branches
      ADD CONSTRAINT chk_branches_workplace_location_completeness
      CHECK (
        (
          workplace_latitude IS NULL
          AND workplace_longitude IS NULL
          AND workplace_radius_meters IS NULL
        )
        OR (
          workplace_latitude IS NOT NULL
          AND workplace_longitude IS NOT NULL
          AND workplace_radius_meters IS NOT NULL
        )
      );
  END IF;
END $$;

ALTER TABLE v0_attendance_records
  ADD COLUMN IF NOT EXISTS observed_latitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS observed_longitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS observed_accuracy_meters NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS location_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_verification_status VARCHAR(16),
  ADD COLUMN IF NOT EXISTS location_verification_reason VARCHAR(64),
  ADD COLUMN IF NOT EXISTS location_distance_meters NUMERIC(10,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_v0_attendance_records_observed_latitude_range'
  ) THEN
    ALTER TABLE v0_attendance_records
      ADD CONSTRAINT chk_v0_attendance_records_observed_latitude_range
      CHECK (
        observed_latitude IS NULL
        OR (observed_latitude >= -90 AND observed_latitude <= 90)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_v0_attendance_records_observed_longitude_range'
  ) THEN
    ALTER TABLE v0_attendance_records
      ADD CONSTRAINT chk_v0_attendance_records_observed_longitude_range
      CHECK (
        observed_longitude IS NULL
        OR (observed_longitude >= -180 AND observed_longitude <= 180)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_v0_attendance_records_observed_location_pair'
  ) THEN
    ALTER TABLE v0_attendance_records
      ADD CONSTRAINT chk_v0_attendance_records_observed_location_pair
      CHECK (
        (observed_latitude IS NULL AND observed_longitude IS NULL)
        OR (observed_latitude IS NOT NULL AND observed_longitude IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_v0_attendance_records_observed_accuracy_range'
  ) THEN
    ALTER TABLE v0_attendance_records
      ADD CONSTRAINT chk_v0_attendance_records_observed_accuracy_range
      CHECK (
        observed_accuracy_meters IS NULL
        OR observed_accuracy_meters >= 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_v0_attendance_records_location_distance_range'
  ) THEN
    ALTER TABLE v0_attendance_records
      ADD CONSTRAINT chk_v0_attendance_records_location_distance_range
      CHECK (
        location_distance_meters IS NULL
        OR location_distance_meters >= 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_v0_attendance_records_location_verification_status'
  ) THEN
    ALTER TABLE v0_attendance_records
      ADD CONSTRAINT chk_v0_attendance_records_location_verification_status
      CHECK (
        location_verification_status IS NULL
        OR location_verification_status IN ('MATCH', 'MISMATCH', 'UNKNOWN')
      );
  END IF;
END $$;

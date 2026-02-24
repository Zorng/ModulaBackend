import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0AttendanceRecordRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  account_id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  occurred_at: Date;
  created_at: Date;
  observed_latitude: number | null;
  observed_longitude: number | null;
  observed_accuracy_meters: number | null;
  location_captured_at: Date | null;
  location_verification_status: "MATCH" | "MISMATCH" | "UNKNOWN" | null;
  location_verification_reason: string | null;
  location_distance_meters: number | null;
  force_ended_by_account_id: string | null;
  force_end_reason: string | null;
};

export type V0AttendanceScopedRecordRow = V0AttendanceRecordRow & {
  account_phone: string;
  account_first_name: string | null;
  account_last_name: string | null;
  branch_name: string;
};

export type V0BranchLocationVerificationSettingsRow = {
  attendance_location_verification_mode:
    | "disabled"
    | "checkin_only"
    | "checkin_and_checkout";
  workplace_latitude: number | null;
  workplace_longitude: number | null;
  workplace_radius_meters: number | null;
};

export class V0AttendanceRepository {
  constructor(private readonly db: Queryable) {}

  async findLatestRecord(input: {
    tenantId: string;
    branchId: string;
    accountId: string;
  }): Promise<V0AttendanceRecordRow | null> {
    const result = await this.db.query<V0AttendanceRecordRow>(
      `SELECT
         id,
         tenant_id,
         branch_id,
         account_id,
         type,
         occurred_at,
         created_at,
         observed_latitude::FLOAT8 AS observed_latitude,
         observed_longitude::FLOAT8 AS observed_longitude,
         observed_accuracy_meters::FLOAT8 AS observed_accuracy_meters,
         location_captured_at,
         location_verification_status,
         location_verification_reason,
         location_distance_meters::FLOAT8 AS location_distance_meters,
         force_ended_by_account_id,
         force_end_reason
       FROM v0_attendance_records
       WHERE tenant_id = $1
         AND branch_id = $2
         AND account_id = $3
       ORDER BY occurred_at DESC, created_at DESC
       LIMIT 1`,
      [input.tenantId, input.branchId, input.accountId]
    );
    return result.rows[0] ?? null;
  }

  async createRecord(input: {
    tenantId: string;
    branchId: string;
    accountId: string;
    type: "CHECK_IN" | "CHECK_OUT";
    occurredAt: Date;
    observedLatitude: number | null;
    observedLongitude: number | null;
    observedAccuracyMeters: number | null;
    locationCapturedAt: Date | null;
    locationVerificationStatus: "MATCH" | "MISMATCH" | "UNKNOWN" | null;
    locationVerificationReason: string | null;
    locationDistanceMeters: number | null;
    forceEndedByAccountId: string | null;
    forceEndReason: string | null;
  }): Promise<V0AttendanceRecordRow> {
    const result = await this.db.query<V0AttendanceRecordRow>(
      `INSERT INTO v0_attendance_records (
         tenant_id,
         branch_id,
         account_id,
         type,
         occurred_at,
         observed_latitude,
         observed_longitude,
         observed_accuracy_meters,
         location_captured_at,
         location_verification_status,
         location_verification_reason,
         location_distance_meters,
         force_ended_by_account_id,
         force_end_reason
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6::NUMERIC, $7::NUMERIC, $8::NUMERIC, $9, $10, $11, $12::NUMERIC, $13::UUID, $14
       )
       RETURNING
         id,
         tenant_id,
         branch_id,
         account_id,
         type,
         occurred_at,
         created_at,
         observed_latitude::FLOAT8 AS observed_latitude,
         observed_longitude::FLOAT8 AS observed_longitude,
         observed_accuracy_meters::FLOAT8 AS observed_accuracy_meters,
         location_captured_at,
         location_verification_status,
         location_verification_reason,
         location_distance_meters::FLOAT8 AS location_distance_meters,
         force_ended_by_account_id,
         force_end_reason`,
      [
        input.tenantId,
        input.branchId,
        input.accountId,
        input.type,
        input.occurredAt,
        input.observedLatitude,
        input.observedLongitude,
        input.observedAccuracyMeters,
        input.locationCapturedAt,
        input.locationVerificationStatus,
        input.locationVerificationReason,
        input.locationDistanceMeters,
        input.forceEndedByAccountId,
        input.forceEndReason,
      ]
    );
    return result.rows[0];
  }

  async listRecordsForActor(input: {
    tenantId: string;
    branchId: string;
    accountId: string;
    limit: number;
  }): Promise<V0AttendanceRecordRow[]> {
    const result = await this.db.query<V0AttendanceRecordRow>(
      `SELECT
         id,
         tenant_id,
         branch_id,
         account_id,
         type,
         occurred_at,
         created_at,
         observed_latitude::FLOAT8 AS observed_latitude,
         observed_longitude::FLOAT8 AS observed_longitude,
         observed_accuracy_meters::FLOAT8 AS observed_accuracy_meters,
         location_captured_at,
         location_verification_status,
         location_verification_reason,
         location_distance_meters::FLOAT8 AS location_distance_meters,
         force_ended_by_account_id,
         force_end_reason
       FROM v0_attendance_records
       WHERE tenant_id = $1
         AND branch_id = $2
         AND account_id = $3
       ORDER BY occurred_at DESC, created_at DESC
       LIMIT $4`,
      [input.tenantId, input.branchId, input.accountId, input.limit]
    );
    return result.rows;
  }

  async listRecordsForBranch(input: {
    tenantId: string;
    branchId: string;
    accountId: string | null;
    occurredFrom: Date | null;
    occurredTo: Date | null;
    limit: number;
    offset: number;
  }): Promise<V0AttendanceScopedRecordRow[]> {
    const result = await this.db.query<V0AttendanceScopedRecordRow>(
      `SELECT
         r.id,
         r.tenant_id,
         r.branch_id,
         r.account_id,
         r.type,
         r.occurred_at,
         r.created_at,
         r.observed_latitude::FLOAT8 AS observed_latitude,
         r.observed_longitude::FLOAT8 AS observed_longitude,
         r.observed_accuracy_meters::FLOAT8 AS observed_accuracy_meters,
         r.location_captured_at,
         r.location_verification_status,
         r.location_verification_reason,
         r.location_distance_meters::FLOAT8 AS location_distance_meters,
         r.force_ended_by_account_id,
         r.force_end_reason,
         a.phone AS account_phone,
         a.first_name AS account_first_name,
         a.last_name AS account_last_name,
         b.name AS branch_name
       FROM v0_attendance_records r
       JOIN accounts a ON a.id = r.account_id
       JOIN branches b ON b.id = r.branch_id
       WHERE r.tenant_id = $1
         AND r.branch_id = $2
         AND ($3::uuid IS NULL OR r.account_id = $3::uuid)
         AND ($4::timestamptz IS NULL OR r.occurred_at >= $4::timestamptz)
         AND ($5::timestamptz IS NULL OR r.occurred_at <= $5::timestamptz)
       ORDER BY r.occurred_at DESC, r.created_at DESC
       LIMIT $6
       OFFSET $7`,
      [
        input.tenantId,
        input.branchId,
        input.accountId,
        input.occurredFrom,
        input.occurredTo,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async listRecordsForTenant(input: {
    tenantId: string;
    branchId: string | null;
    accountId: string | null;
    occurredFrom: Date | null;
    occurredTo: Date | null;
    limit: number;
    offset: number;
  }): Promise<V0AttendanceScopedRecordRow[]> {
    const result = await this.db.query<V0AttendanceScopedRecordRow>(
      `SELECT
         r.id,
         r.tenant_id,
         r.branch_id,
         r.account_id,
         r.type,
         r.occurred_at,
         r.created_at,
         r.observed_latitude::FLOAT8 AS observed_latitude,
         r.observed_longitude::FLOAT8 AS observed_longitude,
         r.observed_accuracy_meters::FLOAT8 AS observed_accuracy_meters,
         r.location_captured_at,
         r.location_verification_status,
         r.location_verification_reason,
         r.location_distance_meters::FLOAT8 AS location_distance_meters,
         r.force_ended_by_account_id,
         r.force_end_reason,
         a.phone AS account_phone,
         a.first_name AS account_first_name,
         a.last_name AS account_last_name,
         b.name AS branch_name
       FROM v0_attendance_records r
       JOIN accounts a ON a.id = r.account_id
       JOIN branches b ON b.id = r.branch_id
       WHERE r.tenant_id = $1
         AND ($2::uuid IS NULL OR r.branch_id = $2::uuid)
         AND ($3::uuid IS NULL OR r.account_id = $3::uuid)
         AND ($4::timestamptz IS NULL OR r.occurred_at >= $4::timestamptz)
         AND ($5::timestamptz IS NULL OR r.occurred_at <= $5::timestamptz)
       ORDER BY r.occurred_at DESC, r.created_at DESC
       LIMIT $6
       OFFSET $7`,
      [
        input.tenantId,
        input.branchId,
        input.accountId,
        input.occurredFrom,
        input.occurredTo,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async getBranchLocationVerificationSettings(input: {
    tenantId: string;
    branchId: string;
  }): Promise<V0BranchLocationVerificationSettingsRow | null> {
    const result = await this.db.query<V0BranchLocationVerificationSettingsRow>(
      `SELECT
         attendance_location_verification_mode,
         workplace_latitude::FLOAT8 AS workplace_latitude,
         workplace_longitude::FLOAT8 AS workplace_longitude,
         workplace_radius_meters
       FROM branches
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [input.tenantId, input.branchId]
    );
    return result.rows[0] ?? null;
  }
}

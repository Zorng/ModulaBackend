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
         created_at
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
  }): Promise<V0AttendanceRecordRow> {
    const result = await this.db.query<V0AttendanceRecordRow>(
      `INSERT INTO v0_attendance_records (
         tenant_id,
         branch_id,
         account_id,
         type,
         occurred_at
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id,
         tenant_id,
         branch_id,
         account_id,
         type,
         occurred_at,
         created_at`,
      [
        input.tenantId,
        input.branchId,
        input.accountId,
        input.type,
        input.occurredAt,
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
         created_at
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
}

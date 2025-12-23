import type { Pool } from "pg";
import type {
  AttendanceRecord,
  AttendanceRecordType,
  AttendanceRequest,
  AttendanceRequestStatus,
  AttendanceRequestType,
  AttendanceLocation,
} from "../domain/entities.js";

export interface AttendanceRepository {
  createRecord(params: {
    tenantId: string;
    branchId: string;
    employeeId: string;
    type: AttendanceRecordType;
    occurredAt?: Date;
    location?: AttendanceLocation | null;
  }): Promise<AttendanceRecord>;
  findLatestRecord(params: {
    tenantId: string;
    branchId: string;
    employeeId: string;
  }): Promise<AttendanceRecord | null>;
  listRecords(params: {
    tenantId: string;
    branchId?: string;
    employeeId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AttendanceRecord[]>;
  createRequest(params: {
    tenantId: string;
    branchId: string;
    employeeId: string;
    requestType?: AttendanceRequestType;
    requestedCheckInAt?: Date;
    note?: string | null;
  }): Promise<AttendanceRequest>;
  getRequestById(params: {
    tenantId: string;
    requestId: string;
  }): Promise<AttendanceRequest | null>;
  listRequests(params: {
    tenantId: string;
    branchId?: string;
    employeeId?: string;
    status?: AttendanceRequestStatus;
    limit?: number;
    offset?: number;
  }): Promise<AttendanceRequest[]>;
  resolveRequest(params: {
    tenantId: string;
    requestId: string;
    status: Exclude<AttendanceRequestStatus, "PENDING">;
    resolvedBy: string;
    attendanceRecordId?: string | null;
  }): Promise<AttendanceRequest | null>;
}

export class PgAttendanceRepository implements AttendanceRepository {
  constructor(private pool: Pool) {}

  async createRecord(params: {
    tenantId: string;
    branchId: string;
    employeeId: string;
    type: AttendanceRecordType;
    occurredAt?: Date;
    location?: AttendanceLocation | null;
  }): Promise<AttendanceRecord> {
    const result = await this.pool.query(
      `INSERT INTO attendance_records (
        tenant_id,
        branch_id,
        employee_id,
        type,
        occurred_at,
        location
      ) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *`,
      [
        params.tenantId,
        params.branchId,
        params.employeeId,
        params.type,
        params.occurredAt ?? new Date(),
        params.location ?? null,
      ]
    );

    return this.mapRecord(result.rows[0]);
  }

  async findLatestRecord(params: {
    tenantId: string;
    branchId: string;
    employeeId: string;
  }): Promise<AttendanceRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM attendance_records
       WHERE tenant_id = $1 AND branch_id = $2 AND employee_id = $3
       ORDER BY occurred_at DESC, created_at DESC
       LIMIT 1`,
      [params.tenantId, params.branchId, params.employeeId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRecord(result.rows[0]);
  }

  async listRecords(params: {
    tenantId: string;
    branchId?: string;
    employeeId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AttendanceRecord[]> {
    const whereClauses = ["tenant_id = $1"];
    const values: Array<string | Date | number> = [params.tenantId];
    let paramIndex = 2;

    if (params.branchId) {
      whereClauses.push(`branch_id = $${paramIndex}`);
      values.push(params.branchId);
      paramIndex += 1;
    }

    if (params.employeeId) {
      whereClauses.push(`employee_id = $${paramIndex}`);
      values.push(params.employeeId);
      paramIndex += 1;
    }

    if (params.from) {
      whereClauses.push(`occurred_at >= $${paramIndex}`);
      values.push(params.from);
      paramIndex += 1;
    }

    if (params.to) {
      whereClauses.push(`occurred_at <= $${paramIndex}`);
      values.push(params.to);
      paramIndex += 1;
    }

    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    values.push(limit, offset);

    const query = `
      SELECT * FROM attendance_records
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await this.pool.query(query, values);
    return result.rows.map((row) => this.mapRecord(row));
  }

  async createRequest(params: {
    tenantId: string;
    branchId: string;
    employeeId: string;
    requestType?: AttendanceRequestType;
    requestedCheckInAt?: Date;
    note?: string | null;
  }): Promise<AttendanceRequest> {
    const result = await this.pool.query(
      `INSERT INTO attendance_requests (
        tenant_id,
        branch_id,
        employee_id,
        request_type,
        requested_check_in_at,
        note
      ) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *`,
      [
        params.tenantId,
        params.branchId,
        params.employeeId,
        params.requestType ?? "CHECK_IN",
        params.requestedCheckInAt ?? new Date(),
        params.note ?? null,
      ]
    );

    return this.mapRequest(result.rows[0]);
  }

  async getRequestById(params: {
    tenantId: string;
    requestId: string;
  }): Promise<AttendanceRequest | null> {
    const result = await this.pool.query(
      `SELECT * FROM attendance_requests
       WHERE tenant_id = $1 AND id = $2`,
      [params.tenantId, params.requestId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRequest(result.rows[0]);
  }

  async listRequests(params: {
    tenantId: string;
    branchId?: string;
    employeeId?: string;
    status?: AttendanceRequestStatus;
    limit?: number;
    offset?: number;
  }): Promise<AttendanceRequest[]> {
    const whereClauses = ["tenant_id = $1"];
    const values: Array<string | number> = [params.tenantId];
    let paramIndex = 2;

    if (params.branchId) {
      whereClauses.push(`branch_id = $${paramIndex}`);
      values.push(params.branchId);
      paramIndex += 1;
    }

    if (params.employeeId) {
      whereClauses.push(`employee_id = $${paramIndex}`);
      values.push(params.employeeId);
      paramIndex += 1;
    }

    if (params.status) {
      whereClauses.push(`status = $${paramIndex}`);
      values.push(params.status);
      paramIndex += 1;
    }

    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    values.push(limit, offset);

    const query = `
      SELECT * FROM attendance_requests
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY requested_at DESC, created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await this.pool.query(query, values);
    return result.rows.map((row) => this.mapRequest(row));
  }

  async resolveRequest(params: {
    tenantId: string;
    requestId: string;
    status: Exclude<AttendanceRequestStatus, "PENDING">;
    resolvedBy: string;
    attendanceRecordId?: string | null;
  }): Promise<AttendanceRequest | null> {
    const result = await this.pool.query(
      `UPDATE attendance_requests
       SET status = $3,
           resolved_at = NOW(),
           resolved_by = $4,
           attendance_record_id = $5
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        params.tenantId,
        params.requestId,
        params.status,
        params.resolvedBy,
        params.attendanceRecordId ?? null,
      ]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRequest(result.rows[0]);
  }

  private mapRecord(row: any): AttendanceRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      employeeId: row.employee_id,
      type: row.type,
      occurredAt: new Date(row.occurred_at),
      location: row.location ?? undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private mapRequest(row: any): AttendanceRequest {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      employeeId: row.employee_id,
      requestType: row.request_type,
      status: row.status,
      requestedAt: new Date(row.requested_at),
      requestedCheckInAt: new Date(row.requested_check_in_at),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
      resolvedBy: row.resolved_by ?? null,
      attendanceRecordId: row.attendance_record_id ?? null,
      note: row.note ?? null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

import type { Pool, PoolClient } from "pg";
import type {
  AuditDenialReason,
  AuditLogEntry,
  AuditOutcome,
} from "../domain/entities.js";

type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export class AuditRepository {
  constructor(private pool: Pool) {}

  async write(
    entry: {
      tenantId: string;
      branchId?: string;
      employeeId?: string;
      actorRole?: string | null;
      actionType: string;
      resourceType?: string;
      resourceId?: string;
      outcome?: AuditOutcome;
      denialReason?: AuditDenialReason;
      occurredAt?: Date;
      clientEventId?: string;
      details?: Record<string, any>;
      ipAddress?: string;
      userAgent?: string;
    },
    client?: PoolClient
  ): Promise<void> {
    const db: Queryable = client ?? this.pool;

    await db.query(
      `INSERT INTO activity_log
        (
          tenant_id,
          branch_id,
          employee_id,
          actor_role,
          action_type,
          resource_type,
          resource_id,
          outcome,
          denial_reason,
          occurred_at,
          client_event_id,
          details,
          ip_address,
          user_agent
        )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        entry.tenantId,
        entry.branchId ?? null,
        entry.employeeId ?? null,
        entry.actorRole ?? null,
        entry.actionType,
        entry.resourceType ?? null,
        entry.resourceId ?? null,
        entry.outcome ?? "SUCCESS",
        entry.denialReason ?? null,
        entry.occurredAt ?? new Date(),
        entry.clientEventId ?? null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
      ]
    );
  }

  async list(params: {
    tenantId: string;
    from?: Date;
    to?: Date;
    branchId?: string;
    employeeId?: string;
    actionType?: string;
    outcome?: AuditOutcome;
    denialReason?: AuditDenialReason;
    page: number;
    limit: number;
  }): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const where: string[] = ["tenant_id = $1"];
    const values: any[] = [params.tenantId];

    const push = (sql: string, value: any) => {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    };

    if (params.from) {
      push("occurred_at >= ?", params.from);
    }
    if (params.to) {
      push("occurred_at <= ?", params.to);
    }
    if (params.branchId) {
      push("branch_id = ?", params.branchId);
    }
    if (params.employeeId) {
      push("employee_id = ?", params.employeeId);
    }
    if (params.actionType) {
      push("action_type = ?", params.actionType);
    }
    if (params.outcome) {
      push("outcome = ?", params.outcome);
    }
    if (params.denialReason) {
      push("denial_reason = ?", params.denialReason);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const countRes = await this.pool.query(
      `SELECT COUNT(*)::INT AS count
       FROM activity_log
       ${whereSql}`,
      values
    );
    const total = Number(countRes.rows?.[0]?.count ?? 0);

    const offset = (params.page - 1) * params.limit;
    const listValues = [...values, params.limit, offset];
    const limitParam = `$${listValues.length - 1}`;
    const offsetParam = `$${listValues.length}`;

    const res = await this.pool.query(
      `SELECT *
       FROM activity_log
       ${whereSql}
       ORDER BY occurred_at DESC, id DESC
       LIMIT ${limitParam}
       OFFSET ${offsetParam}`,
      listValues
    );

    return {
      logs: res.rows.map((row: any) => this.mapAuditLog(row)),
      total,
    };
  }

  async getById(params: {
    tenantId: string;
    id: string;
  }): Promise<AuditLogEntry | null> {
    const res = await this.pool.query(
      `SELECT *
       FROM activity_log
       WHERE id = $1 AND tenant_id = $2`,
      [params.id, params.tenantId]
    );
    if (res.rows.length === 0) {
      return null;
    }
    return this.mapAuditLog(res.rows[0]);
  }

  private mapAuditLog(row: any): AuditLogEntry {
    const details =
      row.details == null
        ? null
        : typeof row.details === "string"
          ? JSON.parse(row.details)
          : row.details;

    return {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id ?? null,
      employee_id: row.employee_id ?? null,
      actor_role: row.actor_role ?? null,
      actor_type: row.employee_id ? "EMPLOYEE" : "SYSTEM",
      action_type: row.action_type,
      resource_type: row.resource_type ?? null,
      resource_id: row.resource_id ?? null,
      details,
      ip_address: row.ip_address ?? null,
      user_agent: row.user_agent ?? null,
      outcome: row.outcome ?? "SUCCESS",
      denial_reason: row.denial_reason ?? null,
      occurred_at: row.occurred_at,
      created_at: row.created_at,
      client_event_id: row.client_event_id ?? null,
    };
  }
}


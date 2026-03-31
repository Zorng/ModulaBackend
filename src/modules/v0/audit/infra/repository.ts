import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0AuditEventRow = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  actor_account_id: string | null;
  action_key: string;
  outcome: "SUCCESS" | "REJECTED" | "FAILED";
  reason_code: string | null;
  entity_type: string | null;
  entity_id: string | null;
  dedupe_key: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type V0AuditEventListRow = V0AuditEventRow & {
  actor_first_name: string | null;
  actor_last_name: string | null;
};

export class V0AuditRepository {
  constructor(private readonly db: Queryable) {}

  async insertEvent(input: {
    tenantId: string;
    branchId: string | null;
    actorAccountId: string | null;
    actionKey: string;
    outcome: "SUCCESS" | "REJECTED" | "FAILED";
    reasonCode?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    dedupeKey?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ inserted: boolean; row: V0AuditEventRow | null }> {
    const result = await this.db.query<V0AuditEventRow>(
      `INSERT INTO v0_audit_events (
         tenant_id,
         branch_id,
         actor_account_id,
         action_key,
         outcome,
         reason_code,
         entity_type,
         entity_id,
         dedupe_key,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::jsonb, '{}'::jsonb))
       ON CONFLICT (tenant_id, dedupe_key)
       WHERE dedupe_key IS NOT NULL
       DO NOTHING
       RETURNING *`,
      [
        input.tenantId,
        input.branchId,
        input.actorAccountId,
        input.actionKey,
        input.outcome,
        input.reasonCode ?? null,
        input.entityType ?? null,
        input.entityId ?? null,
        input.dedupeKey ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    if (result.rows[0]) {
      return { inserted: true, row: result.rows[0] };
    }
    return { inserted: false, row: null };
  }

  async listTenantEvents(input: {
    tenantId: string;
    branchId?: string | null;
    actionKey?: string | null;
    outcome?: "SUCCESS" | "REJECTED" | "FAILED" | null;
    limit: number;
    offset: number;
  }): Promise<V0AuditEventListRow[]> {
    const result = await this.db.query<V0AuditEventListRow>(
      `SELECT
         e.id,
         e.tenant_id,
         e.branch_id,
         e.actor_account_id,
         e.action_key,
         e.outcome,
         e.reason_code,
         e.entity_type,
         e.entity_id,
         e.dedupe_key,
         e.metadata,
         e.created_at,
         a.first_name AS actor_first_name,
         a.last_name AS actor_last_name
       FROM v0_audit_events e
       LEFT JOIN accounts a
         ON a.id = e.actor_account_id
       WHERE tenant_id = $1
         AND ($2::uuid IS NULL OR e.branch_id = $2)
         AND ($3::text IS NULL OR e.action_key = $3)
         AND ($4::text IS NULL OR e.outcome = $4)
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT $5 OFFSET $6`,
      [
        input.tenantId,
        input.branchId ?? null,
        input.actionKey ?? null,
        input.outcome ?? null,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async countTenantEvents(input: {
    tenantId: string;
    branchId?: string | null;
    actionKey?: string | null;
    outcome?: "SUCCESS" | "REJECTED" | "FAILED" | null;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND ($2::uuid IS NULL OR branch_id = $2)
         AND ($3::text IS NULL OR action_key = $3)
         AND ($4::text IS NULL OR outcome = $4)`,
      [
        input.tenantId,
        input.branchId ?? null,
        input.actionKey ?? null,
        input.outcome ?? null,
      ]
    );
    return Number(result.rows[0]?.count ?? "0");
  }
}

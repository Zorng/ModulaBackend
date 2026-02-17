import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0CommandOutboxRow = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  action_key: string;
  event_type: string;
  actor_type: "ACCOUNT" | "SYSTEM";
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  outcome: "SUCCESS" | "REJECTED" | "FAILED";
  reason_code: string | null;
  dedupe_key: string | null;
  payload: Record<string, unknown>;
  occurred_at: Date;
  created_at: Date;
};

export class V0CommandOutboxRepository {
  constructor(private readonly db: Queryable) {}

  async insertEvent(input: {
    tenantId: string;
    branchId?: string | null;
    actionKey: string;
    eventType: string;
    actorType: "ACCOUNT" | "SYSTEM";
    actorId?: string | null;
    entityType: string;
    entityId: string;
    outcome: "SUCCESS" | "REJECTED" | "FAILED";
    reasonCode?: string | null;
    dedupeKey?: string | null;
    payload?: Record<string, unknown> | null;
    occurredAt?: Date | null;
  }): Promise<{ inserted: boolean; row: V0CommandOutboxRow | null }> {
    const forcedFailureAction = String(
      process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY ?? ""
    ).trim();
    if (forcedFailureAction && forcedFailureAction === input.actionKey) {
      throw new Error(`forced outbox failure for actionKey=${forcedFailureAction}`);
    }

    const result = await this.db.query<V0CommandOutboxRow>(
      `INSERT INTO v0_command_outbox (
         tenant_id,
         branch_id,
         action_key,
         event_type,
         actor_type,
         actor_id,
         entity_type,
         entity_id,
         outcome,
         reason_code,
         dedupe_key,
         payload,
         occurred_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::jsonb, '{}'::jsonb), COALESCE($13, NOW()))
       ON CONFLICT (tenant_id, dedupe_key)
       WHERE dedupe_key IS NOT NULL
       DO NOTHING
       RETURNING *`,
      [
        input.tenantId,
        input.branchId ?? null,
        input.actionKey,
        input.eventType,
        input.actorType,
        input.actorId ?? null,
        input.entityType,
        input.entityId,
        input.outcome,
        input.reasonCode ?? null,
        input.dedupeKey ?? null,
        input.payload ? JSON.stringify(input.payload) : null,
        input.occurredAt ?? null,
      ]
    );

    if (result.rows[0]) {
      return { inserted: true, row: result.rows[0] };
    }
    return { inserted: false, row: null };
  }
}

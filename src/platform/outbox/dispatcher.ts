import type { Pool, PoolClient } from "pg";
import { eventBus } from "../events/index.js";

type V0OutboxRow = {
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
};

type DispatcherInput = {
  db: Pool;
  pollIntervalMs?: number;
  batchSize?: number;
};

type V0CommandOutboxEvent = {
  type: string;
  outboxId: string;
  tenantId: string;
  branchId: string | null;
  actionKey: string;
  actorType: "ACCOUNT" | "SYSTEM";
  actorId: string | null;
  entityType: string;
  entityId: string;
  outcome: "SUCCESS" | "REJECTED" | "FAILED";
  reasonCode: string | null;
  dedupeKey: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
};

async function processBatch(input: { client: PoolClient; batchSize: number }): Promise<void> {
  const rows = await input.client.query<V0OutboxRow>(
    `SELECT
       id,
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
     FROM v0_command_outbox
     WHERE published_at IS NULL
     ORDER BY created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [input.batchSize]
  );

  for (const row of rows.rows) {
    try {
      const event: V0CommandOutboxEvent = {
        type: row.event_type,
        outboxId: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        actionKey: row.action_key,
        actorType: row.actor_type,
        actorId: row.actor_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        outcome: row.outcome,
        reasonCode: row.reason_code,
        dedupeKey: row.dedupe_key,
        occurredAt: row.occurred_at.toISOString(),
        payload: row.payload ?? {},
      };

      await eventBus.publish(event as never);

      await input.client.query(
        `UPDATE v0_command_outbox
         SET
           published_at = NOW(),
           retry_count = retry_count + 1
         WHERE id = $1`,
        [row.id]
      );
    } catch {
      await input.client.query(
        `UPDATE v0_command_outbox
         SET
           retry_count = retry_count + 1
         WHERE id = $1`,
        [row.id]
      );
    }
  }
}

export function startV0CommandOutboxDispatcher(input: DispatcherInput): {
  stop: () => void;
} {
  const pollIntervalMs = input.pollIntervalMs ?? 1000;
  const batchSize = input.batchSize ?? 100;

  const timer = setInterval(async () => {
    const client = await input.db.connect();
    try {
      await client.query("BEGIN");
      await processBatch({ client, batchSize });
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }, pollIntervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}

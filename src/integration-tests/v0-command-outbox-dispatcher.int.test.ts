import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { eventBus } from "../platform/events/index.js";
import { startV0CommandOutboxDispatcher } from "../platform/outbox/dispatcher.js";

describe("v0 command outbox dispatcher", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("publishes unpublished outbox rows and marks them as published", async () => {
    const tenant = await pool.query<{ id: string }>(
      `INSERT INTO tenants (name, status)
       VALUES ($1, 'ACTIVE')
       RETURNING id`,
      [`Dispatcher Tenant ${Date.now()}`]
    );
    const tenantId = tenant.rows[0].id;

    const account = await pool.query<{ id: string }>(
      `INSERT INTO accounts (
         phone,
         password_hash,
         status,
         first_name,
         last_name
       ) VALUES ($1, $2, 'ACTIVE', 'Dispatch', 'Actor')
       RETURNING id`,
      [`+1999${Date.now().toString().slice(-7)}`, "test-hash"]
    );
    const accountId = account.rows[0].id;

    const eventType = `TEST_OUTBOX_EVENT_${Date.now()}`;
    const inserted = await pool.query<{ id: string }>(
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
         payload
       )
       VALUES ($1, NULL, $2, $3, 'ACCOUNT', $4, 'test_entity', 'entity-1', 'SUCCESS', NULL, $5, $6::jsonb)
       RETURNING id`,
      [
        tenantId,
        "test.action",
        eventType,
        accountId,
        `dispatcher:${Date.now()}`,
        JSON.stringify({ source: "integration-test" }),
      ]
    );
    const outboxId = inserted.rows[0].id;

    const published = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("outbox event was not dispatched in time"));
      }, 4000);

      eventBus.subscribe(eventType, async (event: any) => {
        if (event?.outboxId === outboxId) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const dispatcher = startV0CommandOutboxDispatcher({
      db: pool,
      pollIntervalMs: 50,
      batchSize: 25,
    });

    try {
      await published;

      const row = await pool.query<{
        published_at: Date | null;
        retry_count: number;
      }>(
        `SELECT published_at, retry_count
         FROM v0_command_outbox
         WHERE id = $1`,
        [outboxId]
      );

      expect(row.rows[0]?.published_at).not.toBeNull();
      expect(Number(row.rows[0]?.retry_count ?? 0)).toBeGreaterThan(0);
    } finally {
      dispatcher.stop();
      await pool.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
      await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    }
  });
});

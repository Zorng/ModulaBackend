import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { Pool } from "pg";
import type { DomainEvent } from "../../../shared/events.js";
import { eventBus } from "../../../platform/events/index.js";
import {
  publishToOutbox,
  startOutboxDispatcher,
} from "../../../platform/events/outbox.js";

describe("Outbox Pattern Integration", () => {
  let pool: Pool;
  let dispatcher: { stop: () => void };

  beforeAll(async () => {
    pool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ||
        process.env.DATABASE_URL ||
        "postgresql://localhost:5432/modula_test",
    });

    dispatcher = startOutboxDispatcher(pool, 200);
  });

  afterAll(async () => {
    dispatcher.stop();
    await pool.end();
  });

  async function createTestTenant(): Promise<string> {
    const result = await pool.query(
      `INSERT INTO tenants (name) VALUES ('Outbox Test Tenant') RETURNING id`
    );
    return result.rows[0].id;
  }

  async function deleteTestTenant(tenantId: string): Promise<void> {
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  }

  it("should save event to outbox within transaction", async () => {
    const tenantId = await createTestTenant();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const event: DomainEvent = {
        type: "sales.draft_created",
        v: 1,
        tenantId,
        branchId: "test-branch-id",
        saleId: "test-sale-id",
        clientUuid: "test-client-uuid",
        actorId: "test-actor-id",
        timestamp: new Date().toISOString(),
      };

      await publishToOutbox(event, client);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const rows = await pool.query(
      `SELECT id, type, payload, sent_at
       FROM platform_outbox
       WHERE tenant_id = $1 AND type = $2`,
      [tenantId, "sales.draft_created"]
    );

    expect(rows.rows.length).toBeGreaterThan(0);
    const saved = rows.rows.find((e: any) => (e.payload as any).saleId === "test-sale-id");
    expect(saved).toBeDefined();
    expect(saved.type).toBe("sales.draft_created");
    expect(saved.sent_at).toBeNull();

    await deleteTestTenant(tenantId);
  });

  it("should publish events via dispatcher and mark as sent", async () => {
    const tenantId = await createTestTenant();

    const published = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Event not published within 3 seconds"));
      }, 3000);

      eventBus.subscribe("sales.sale_finalized", async (event: any) => {
        if (event.tenantId === tenantId && event.saleId === "dispatcher-test-sale-id") {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const event: DomainEvent = {
        type: "sales.sale_finalized",
        v: 1,
        tenantId,
        branchId: "test-branch-id",
        saleId: "dispatcher-test-sale-id",
        lines: [{ menuItemId: "item-1", qty: 2 }],
        totals: {
          subtotalUsd: 10,
          totalUsd: 11,
          totalKhr: 45100,
          vatAmountUsd: 1,
        },
        tenders: [{ method: "CASH", amountUsd: 15, amountKhr: 61500 }],
        finalizedAt: new Date().toISOString(),
        actorId: "test-actor-id",
      };

      await publishToOutbox(event, client);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    await published;
    await new Promise((resolve) => setTimeout(resolve, 300));

    const remaining = await pool.query(
      `SELECT COUNT(*)::INT AS count
       FROM platform_outbox
       WHERE tenant_id = $1 AND sent_at IS NULL`,
      [tenantId]
    );

    expect(Number(remaining.rows[0].count)).toBe(0);

    await deleteTestTenant(tenantId);
  });

  it("should handle transaction rollback correctly", async () => {
    const tenantId = await createTestTenant();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const event: DomainEvent = {
        type: "sales.draft_created",
        v: 1,
        tenantId,
        branchId: "test-branch-id",
        saleId: "rollback-test-sale-id",
        clientUuid: "test-client-uuid",
        actorId: "test-actor-id",
        timestamp: new Date().toISOString(),
      };

      await publishToOutbox(event, client);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const rows = await pool.query(
      `SELECT COUNT(*)::INT AS count FROM platform_outbox WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(Number(rows.rows[0].count)).toBe(0);

    await deleteTestTenant(tenantId);
  });
});

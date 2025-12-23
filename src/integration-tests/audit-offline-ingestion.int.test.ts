import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool } from "pg";
import { bootstrapAuditModule } from "../modules/audit/index.js";
import { createTestPool } from "../test-utils/db.js";
import { cleanupSeededTenant, seedTenantSingleBranch } from "../test-utils/seed.js";

describe("Audit offline ingestion (DB-backed)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("dedupes by client_event_id and preserves occurred_at", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    const auditModule = bootstrapAuditModule(pool);

    const clientEventId = "11111111-1111-1111-1111-111111111111";
    const occurredAt = new Date("2025-01-01T00:00:00.000Z");

    const first = await auditModule.service.ingestOfflineEvents({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      employeeId: seeded.employeeId,
      actorRole: seeded.user.role,
      events: [
        {
          clientEventId,
          occurredAt,
          actionType: "SYNC_OPERATION_APPLIED",
          resourceType: "SYNC",
          resourceId: seeded.branchId,
          outcome: "SUCCESS",
          details: { source: "offline_queue" },
        },
      ],
    });
    expect(first).toEqual({ ingested: 1, deduped: 0 });

    const second = await auditModule.service.ingestOfflineEvents({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      employeeId: seeded.employeeId,
      actorRole: seeded.user.role,
      events: [
        {
          clientEventId,
          occurredAt: new Date("2025-02-01T00:00:00.000Z"),
          actionType: "SYNC_OPERATION_APPLIED",
          resourceType: "SYNC",
          resourceId: seeded.branchId,
          outcome: "SUCCESS",
          details: { source: "retry" },
        },
      ],
    });
    expect(second).toEqual({ ingested: 0, deduped: 1 });

    const countRes = await pool.query(
      `SELECT COUNT(*)::INT AS count
       FROM activity_log
       WHERE tenant_id = $1
         AND client_event_id = $2`,
      [seeded.tenantId, clientEventId]
    );
    expect(countRes.rows[0].count).toBe(1);

    const rowRes = await pool.query(
      `SELECT occurred_at
       FROM activity_log
       WHERE tenant_id = $1
         AND client_event_id = $2`,
      [seeded.tenantId, clientEventId]
    );
    expect(new Date(rowRes.rows[0].occurred_at).toISOString()).toBe(
      occurredAt.toISOString()
    );

    await cleanupSeededTenant(pool, seeded);
  });

  it("dedupes duplicate client_event_id within a batch", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    const auditModule = bootstrapAuditModule(pool);

    const clientEventId = "22222222-2222-2222-2222-222222222222";
    const occurredAt = new Date("2025-03-01T00:00:00.000Z");

    const result = await auditModule.service.ingestOfflineEvents({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      employeeId: seeded.employeeId,
      actorRole: seeded.user.role,
      events: [
        {
          clientEventId,
          occurredAt,
          actionType: "SYNC_QUEUE_ENQUEUED",
          resourceType: "SYNC",
          resourceId: seeded.branchId,
        },
        {
          clientEventId,
          occurredAt: new Date("2025-04-01T00:00:00.000Z"),
          actionType: "SYNC_QUEUE_ENQUEUED",
          resourceType: "SYNC",
          resourceId: seeded.branchId,
        },
      ],
    });
    expect(result).toEqual({ ingested: 1, deduped: 1 });

    const rowRes = await pool.query(
      `SELECT occurred_at
       FROM activity_log
       WHERE tenant_id = $1
         AND client_event_id = $2`,
      [seeded.tenantId, clientEventId]
    );
    expect(new Date(rowRes.rows[0].occurred_at).toISOString()).toBe(
      occurredAt.toISOString()
    );

    await cleanupSeededTenant(pool, seeded);
  });
});


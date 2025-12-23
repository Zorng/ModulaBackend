import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool, PoolClient } from "pg";
import { bootstrapAuditModule } from "../modules/audit/index.js";
import { bootstrapBranchModule } from "../modules/branch/index.js";
import { OfflineSyncService } from "../modules/offlineSync/app/offlineSync.service.js";
import { PgOfflineSyncOperationsRepository } from "../modules/offlineSync/infra/repository.js";
import { MenuAdapter } from "../modules/sales/infra/adapters/menu.adapter.js";
import { PolicyAdapter } from "../modules/sales/infra/adapters/policy.adapter.js";
import { PgSalesRepository } from "../modules/sales/infra/repository/sales.repository.js";
import { createTestPool } from "../test-utils/db.js";
import {
  cleanupSeededTenant,
  seedTenantSingleBranch,
  setBranchStatus,
} from "../test-utils/seed.js";

function createTxManager(pool: Pool) {
  return {
    async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

async function seedCategoryAndMenuItem(pool: Pool, params: {
  tenantId: string;
  employeeId: string;
}): Promise<{ categoryId: string; menuItemId: string }> {
  const categoryRes = await pool.query(
    `INSERT INTO menu_categories (tenant_id, name, description, display_order, is_active, created_by)
     VALUES ($1,'Test Category','',0,true,$2)
     RETURNING id`,
    [params.tenantId, params.employeeId]
  );
  const categoryId = categoryRes.rows[0].id as string;

  const itemRes = await pool.query(
    `INSERT INTO menu_items (tenant_id, category_id, name, description, price_usd, image_url, is_active, created_by)
     VALUES ($1,$2,'Test Item','',1.5,NULL,true,$3)
     RETURNING id`,
    [params.tenantId, categoryId, params.employeeId]
  );
  const menuItemId = itemRes.rows[0].id as string;

  return { categoryId, menuItemId };
}

describe("Offline sync (DB-backed)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("applies SALE_FINALIZED idempotently via client_op_id", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    const { menuItemId } = await seedCategoryAndMenuItem(pool, {
      tenantId: seeded.tenantId,
      employeeId: seeded.employeeId,
    });

    const auditModule = bootstrapAuditModule(pool);
    const branchModule = bootstrapBranchModule(pool, {
      auditWriterPort: auditModule.auditWriterPort,
    });

    const service = new OfflineSyncService(
      new PgOfflineSyncOperationsRepository(pool),
      createTxManager(pool) as any,
      branchModule.branchGuardPort,
      auditModule.auditWriterPort,
      new PgSalesRepository(pool),
      new PolicyAdapter(pool),
      new MenuAdapter(pool)
    );

    const clientOpId = "11111111-1111-4111-8111-111111111111";
    const clientSaleUuid = "22222222-2222-4222-8222-222222222222";

    const op = {
      clientOpId,
      type: "SALE_FINALIZED" as const,
      occurredAt: new Date("2025-01-01T10:00:00.000Z"),
      payload: {
        client_sale_uuid: clientSaleUuid,
        sale_type: "dine_in",
        items: [{ menu_item_id: menuItemId, quantity: 1, modifiers: [] }],
        tender_currency: "USD",
        payment_method: "cash",
        cash_received: { usd: 10 },
      },
    };

    const first = await service.applyOperations({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      employeeId: seeded.employeeId,
      actorRole: seeded.user.role,
      operations: [op],
    });

    expect(first.results).toHaveLength(1);
    expect(first.results[0].status).toBe("APPLIED");
    expect(first.results[0].deduped).toBe(false);
    expect(first.results[0].result?.type).toBe("SALE_FINALIZED");
    const saleId = (first.results[0].result as any).saleId as string;
    expect(typeof saleId).toBe("string");

    const salesCount1 = await pool.query(
      `SELECT COUNT(*)::INT AS count FROM sales WHERE tenant_id = $1`,
      [seeded.tenantId]
    );
    expect(salesCount1.rows[0].count).toBe(1);

    const opRow1 = await pool.query(
      `SELECT status, result
       FROM offline_sync_operations
       WHERE tenant_id = $1 AND client_op_id = $2`,
      [seeded.tenantId, clientOpId]
    );
    expect(opRow1.rows[0]?.status).toBe("APPLIED");
    expect(opRow1.rows[0]?.result?.saleId).toBe(saleId);

    const second = await service.applyOperations({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      employeeId: seeded.employeeId,
      actorRole: seeded.user.role,
      operations: [op],
    });

    expect(second.results[0].status).toBe("APPLIED");
    expect(second.results[0].deduped).toBe(true);
    expect((second.results[0].result as any).saleId).toBe(saleId);

    const salesCount2 = await pool.query(
      `SELECT COUNT(*)::INT AS count FROM sales WHERE tenant_id = $1`,
      [seeded.tenantId]
    );
    expect(salesCount2.rows[0].count).toBe(1);

    await cleanupSeededTenant(pool, seeded);
  });

  it("rejects frozen-branch operations deterministically and persists failure", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    const auditModule = bootstrapAuditModule(pool);
    const branchModule = bootstrapBranchModule(pool, {
      auditWriterPort: auditModule.auditWriterPort,
    });

    await setBranchStatus({
      pool,
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      status: "FROZEN",
    });

    const service = new OfflineSyncService(
      new PgOfflineSyncOperationsRepository(pool),
      createTxManager(pool) as any,
      branchModule.branchGuardPort,
      auditModule.auditWriterPort,
      new PgSalesRepository(pool),
      new PolicyAdapter(pool),
      new MenuAdapter(pool)
    );

    const clientOpId = "33333333-3333-4333-8333-333333333333";
    const op = {
      clientOpId,
      type: "CASH_SESSION_OPENED" as const,
      occurredAt: new Date("2025-01-01T10:00:00.000Z"),
      payload: {
        opening_float_usd: 5,
        opening_float_khr: 0,
      },
    };

    const first = await service.applyOperations({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      employeeId: seeded.employeeId,
      actorRole: seeded.user.role,
      operations: [op],
    });

    expect(first.results[0].status).toBe("FAILED");
    expect(first.results[0].errorCode).toBe("BRANCH_FROZEN");
    expect(first.results[0].deduped).toBe(false);

    const opRow = await pool.query(
      `SELECT status, error_code
       FROM offline_sync_operations
       WHERE tenant_id = $1 AND client_op_id = $2`,
      [seeded.tenantId, clientOpId]
    );
    expect(opRow.rows[0]?.status).toBe("FAILED");
    expect(opRow.rows[0]?.error_code).toBe("BRANCH_FROZEN");

    const sessions = await pool.query(
      `SELECT COUNT(*)::INT AS count FROM cash_sessions WHERE tenant_id = $1`,
      [seeded.tenantId]
    );
    expect(sessions.rows[0].count).toBe(0);

    const second = await service.applyOperations({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      employeeId: seeded.employeeId,
      actorRole: seeded.user.role,
      operations: [op],
    });
    expect(second.results[0].status).toBe("FAILED");
    expect(second.results[0].deduped).toBe(true);
    expect(second.results[0].errorCode).toBe("BRANCH_FROZEN");

    const auditCount = await pool.query(
      `SELECT COUNT(*)::INT AS count
       FROM activity_log
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_type = 'SYNC_REJECTED_BRANCH_FROZEN'`,
      [seeded.tenantId, seeded.branchId]
    );
    expect(auditCount.rows[0].count).toBeGreaterThan(0);

    await cleanupSeededTenant(pool, seeded);
  });

  it("applies CASH_SESSION_OPENED and CASH_SESSION_CLOSED", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    const auditModule = bootstrapAuditModule(pool);
    const branchModule = bootstrapBranchModule(pool, {
      auditWriterPort: auditModule.auditWriterPort,
    });

    const service = new OfflineSyncService(
      new PgOfflineSyncOperationsRepository(pool),
      createTxManager(pool) as any,
      branchModule.branchGuardPort,
      auditModule.auditWriterPort,
      new PgSalesRepository(pool),
      new PolicyAdapter(pool),
      new MenuAdapter(pool)
    );

    const openRes = await service.applyOperations({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      employeeId: seeded.employeeId,
      actorRole: seeded.user.role,
      operations: [
        {
          clientOpId: "44444444-4444-4444-8444-444444444444",
          type: "CASH_SESSION_OPENED",
          occurredAt: new Date("2025-01-01T10:00:00.000Z"),
          payload: { opening_float_usd: 10, opening_float_khr: 0 },
        },
      ],
    });

    expect(openRes.results[0].status).toBe("APPLIED");
    const sessionId = (openRes.results[0].result as any).sessionId as string;
    expect(typeof sessionId).toBe("string");

    const closeRes = await service.applyOperations({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      employeeId: seeded.employeeId,
      actorRole: seeded.user.role,
      operations: [
        {
          clientOpId: "55555555-5555-4555-8555-555555555555",
          type: "CASH_SESSION_CLOSED",
          occurredAt: new Date("2025-01-01T11:00:00.000Z"),
          payload: { session_id: sessionId, counted_cash_usd: 10, counted_cash_khr: 0 },
        },
      ],
    });

    expect(closeRes.results[0].status).toBe("APPLIED");

    const sessionRow = await pool.query(
      `SELECT status, closed_by
       FROM cash_sessions
       WHERE tenant_id = $1 AND id = $2`,
      [seeded.tenantId, sessionId]
    );
    expect(sessionRow.rows[0]?.status).toBe("CLOSED");
    expect(sessionRow.rows[0]?.closed_by).toBe(seeded.employeeId);

    await cleanupSeededTenant(pool, seeded);
  });
});

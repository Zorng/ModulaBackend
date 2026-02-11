import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool, PoolClient } from "pg";
import { bootstrapAuditModule } from "../modules/audit/index.js";
import { OnSaleFinalizedHandler } from "../modules/cash/app/eventhandler.js";
import {
  CashMovementRepository,
  CashSessionRepository,
} from "../modules/cash/infra/repository.js";
import { MenuAdapter } from "../modules/sales/infra/adapters/menu.adapter.js";
import { PolicyAdapter } from "../modules/sales/infra/adapters/policy.adapter.js";
import { SalesService } from "../modules/sales/app/services/sales.service.js";
import { PgSalesRepository } from "../modules/sales/infra/repository/sales.repository.js";
import { createTestPool } from "../test-utils/db.js";
import { cleanupSeededTenant, seedTenantSingleBranch } from "../test-utils/seed.js";

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

describe("Sale ↔ Cash Session interaction (DB-backed)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("sale finalized event emits CASH tender and cash handler records SALE_CASH movement", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    const { menuItemId } = await seedCategoryAndMenuItem(pool, {
      tenantId: seeded.tenantId,
      employeeId: seeded.employeeId,
    });

    const auditModule = bootstrapAuditModule(pool);
    const txManager = createTxManager(pool);

    const salesService = new SalesService(
      new PgSalesRepository(pool),
      new PolicyAdapter(pool),
      new MenuAdapter(pool),
      txManager as any,
      auditModule.auditWriterPort
    );

    const sessionRepo = new CashSessionRepository(pool);
    const movementRepo = new CashMovementRepository(pool);

    const session = await sessionRepo.save({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      registerId: null as any,
      openedBy: seeded.employeeId,
      openedAt: new Date(),
      openingFloatUsd: 0,
      openingFloatKhr: 0,
      status: "OPEN",
      expectedCashUsd: 0,
      expectedCashKhr: 0,
      countedCashUsd: 0,
      countedCashKhr: 0,
      varianceUsd: 0,
      varianceKhr: 0,
      note: null as any,
    });

    const draft = await salesService.createDraftSale({
      clientUuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      employeeId: seeded.employeeId,
      actorRole: seeded.user.role,
      saleType: "dine_in",
    } as any);

    await salesService.addItemToSale({
      saleId: draft.id,
      menuItemId,
      quantity: 1,
      modifiers: [],
      actorId: seeded.employeeId,
      actorRole: seeded.user.role,
    });

    await salesService.preCheckout({
      saleId: draft.id,
      tenderCurrency: "USD",
      paymentMethod: "cash",
      cashReceived: { usd: 10 },
    });

    await salesService.finalizeSale({
      saleId: draft.id,
      actorId: seeded.employeeId,
      actorRole: seeded.user.role,
    });

    const outboxRes = await pool.query(
      `SELECT payload
       FROM platform_outbox
       WHERE tenant_id = $1 AND type = 'sales.sale_finalized'
       ORDER BY created_at DESC
       LIMIT 1`,
      [seeded.tenantId]
    );
    expect(outboxRes.rows.length).toBe(1);
    const event = outboxRes.rows[0].payload as any;

    expect(event.tenders?.[0]?.method).toBe("CASH");

    const handler = new OnSaleFinalizedHandler(
      sessionRepo,
      movementRepo,
      { publishViaOutbox: async () => {} } as any,
      txManager as any,
      auditModule.auditWriterPort
    );

    await handler.handle(event);

    const movementCount = await pool.query(
      `SELECT COUNT(*)::INT AS count
       FROM cash_movements
       WHERE tenant_id = $1 AND session_id = $2 AND type = 'SALE_CASH'`,
      [seeded.tenantId, session.id]
    );
    expect(movementCount.rows[0].count).toBe(1);

    await cleanupSeededTenant(pool, seeded);
  });

  it("attaches cash tender to the cashier's OPEN session when multiple users have sessions in the same branch", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    const { menuItemId } = await seedCategoryAndMenuItem(pool, {
      tenantId: seeded.tenantId,
      employeeId: seeded.employeeId,
    });

    const auditModule = bootstrapAuditModule(pool);
    const txManager = createTxManager(pool);

    const salesService = new SalesService(
      new PgSalesRepository(pool),
      new PolicyAdapter(pool),
      new MenuAdapter(pool),
      txManager as any,
      auditModule.auditWriterPort
    );

    const sessionRepo = new CashSessionRepository(pool);
    const movementRepo = new CashMovementRepository(pool);

    const phone2 = `+1999${Date.now().toString().slice(-9)}`;

    const account2Res = await pool.query(
      `INSERT INTO accounts (phone, password_hash, status)
       VALUES ($1, 'x', 'ACTIVE')
       RETURNING id`,
      [phone2]
    );
    const account2Id = account2Res.rows[0].id as string;

    const employee2Res = await pool.query(
      `INSERT INTO employees (
        tenant_id,
        account_id,
        phone,
        email,
        password_hash,
        first_name,
        last_name,
        display_name,
        status,
        default_branch_id,
        last_branch_id
      ) VALUES ($1,$2,$3,NULL,'x','Cashier','Two',NULL,'ACTIVE',$4,$4)
      RETURNING id`,
      [seeded.tenantId, account2Id, phone2, seeded.branchId]
    );
    const employee2Id = employee2Res.rows[0].id as string;

    await pool.query(
      `INSERT INTO employee_branch_assignments (employee_id, branch_id, role, active)
       VALUES ($1,$2,'CASHIER',true)`,
      [employee2Id, seeded.branchId]
    );

    const cashierSession = await sessionRepo.save({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      registerId: null as any,
      openedBy: seeded.employeeId,
      openedAt: new Date(),
      openingFloatUsd: 0,
      openingFloatKhr: 0,
      status: "OPEN",
      expectedCashUsd: 0,
      expectedCashKhr: 0,
      countedCashUsd: 0,
      countedCashKhr: 0,
      varianceUsd: 0,
      varianceKhr: 0,
      note: null as any,
    });

    const otherSession = await sessionRepo.save({
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      registerId: null as any,
      openedBy: employee2Id,
      openedAt: new Date(),
      openingFloatUsd: 0,
      openingFloatKhr: 0,
      status: "OPEN",
      expectedCashUsd: 0,
      expectedCashKhr: 0,
      countedCashUsd: 0,
      countedCashKhr: 0,
      varianceUsd: 0,
      varianceKhr: 0,
      note: null as any,
    });

    const draft = await salesService.createDraftSale({
      clientUuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      employeeId: seeded.employeeId,
      actorRole: seeded.user.role,
      saleType: "dine_in",
    } as any);

    await salesService.addItemToSale({
      saleId: draft.id,
      menuItemId,
      quantity: 1,
      modifiers: [],
      actorId: seeded.employeeId,
      actorRole: seeded.user.role,
    });

    await salesService.preCheckout({
      saleId: draft.id,
      tenderCurrency: "USD",
      paymentMethod: "cash",
      cashReceived: { usd: 10 },
    });

    await salesService.finalizeSale({
      saleId: draft.id,
      actorId: seeded.employeeId,
      actorRole: seeded.user.role,
    });

    const outboxRes = await pool.query(
      `SELECT payload
       FROM platform_outbox
       WHERE tenant_id = $1 AND type = 'sales.sale_finalized'
       ORDER BY created_at DESC
       LIMIT 1`,
      [seeded.tenantId]
    );
    expect(outboxRes.rows.length).toBe(1);
    const event = outboxRes.rows[0].payload as any;
    expect(event.actorId).toBe(seeded.employeeId);

    const handler = new OnSaleFinalizedHandler(
      sessionRepo,
      movementRepo,
      { publishViaOutbox: async () => {} } as any,
      txManager as any,
      auditModule.auditWriterPort
    );

    await handler.handle(event);

    const cashMovementSessionIds = await pool.query(
      `SELECT session_id
       FROM cash_movements
       WHERE tenant_id = $1 AND ref_sale_id = $2 AND type = 'SALE_CASH'`,
      [seeded.tenantId, draft.id]
    );
    expect(cashMovementSessionIds.rows).toHaveLength(1);
    expect(cashMovementSessionIds.rows[0].session_id).toBe(cashierSession.id);
    expect(cashMovementSessionIds.rows[0].session_id).not.toBe(otherSession.id);

    await pool.query(`DELETE FROM cash_sessions WHERE opened_by = $1`, [
      employee2Id,
    ]);
    await pool.query(`DELETE FROM employee_branch_assignments WHERE employee_id = $1`, [
      employee2Id,
    ]);
    await pool.query(`DELETE FROM employees WHERE id = $1`, [employee2Id]);
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [account2Id]);

    await cleanupSeededTenant(pool, seeded);
  });
});

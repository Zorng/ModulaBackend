import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool, PoolClient } from "pg";
import express from "express";
import request from "supertest";
import { bootstrapAuditModule } from "../modules/audit/index.js";
import { setupAuthModule } from "../modules/auth/index.js";
import { bootstrapBranchModule } from "../modules/branch/index.js";
import { bootstrapSalesModule } from "../modules/sales/index.js";
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

describe("Sales cart gating (cashRequireSessionForSales)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("blocks draft creation when policy requires session and none is OPEN", async () => {
    const seeded = await seedTenantSingleBranch(pool, {
      admin: { role: "CASHIER" },
    });

    const auditModule = bootstrapAuditModule(pool);
    const branchModule = bootstrapBranchModule(pool, {
      auditWriterPort: auditModule.auditWriterPort,
    });
    const authModule = setupAuthModule(pool, {
      invitationPort: {
        peekValidInvite: async () => {
          throw new Error("not implemented in this test");
        },
        acceptInvite: async () => {
          throw new Error("not implemented in this test");
        },
      } as any,
      tenantProvisioningPort: {
        provisionTenant: async () => {
          throw new Error("not implemented in this test");
        },
      } as any,
      auditWriterPort: auditModule.auditWriterPort,
    });

    const salesModule = bootstrapSalesModule(
      pool,
      createTxManager(pool) as any,
      authModule.authMiddleware,
      { auditWriterPort: auditModule.auditWriterPort }
    );

    const app = express();
    app.use(express.json());
    app.locals.branchGuardPort = branchModule.branchGuardPort;
    app.locals.auditWriterPort = auditModule.auditWriterPort;
    app.locals.auditDb = pool;
    app.use("/v1/sales", salesModule.router);

    await pool.query(
      `UPDATE branch_cash_session_policies
       SET require_session_for_sales = TRUE
       WHERE tenant_id = $1 AND branch_id = $2`,
      [seeded.tenantId, seeded.branchId]
    );

    const login = await authModule.authService.login({
      phone: seeded.admin.phone,
      password: seeded.admin.password,
    });
    expect(login.kind).toBe("single");
    const token = login.kind === "single" ? login.tokens.accessToken : "";

    const res = await request(app)
      .post("/v1/sales/drafts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientUuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        saleType: "dine_in",
      })
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("CASH_SESSION_REQUIRED");

    await cleanupSeededTenant(pool, seeded);
  });

  it("allows draft creation when policy requires session and one is OPEN", async () => {
    const seeded = await seedTenantSingleBranch(pool, {
      admin: { role: "CASHIER" },
    });

    const auditModule = bootstrapAuditModule(pool);
    const branchModule = bootstrapBranchModule(pool, {
      auditWriterPort: auditModule.auditWriterPort,
    });
    const authModule = setupAuthModule(pool, {
      invitationPort: {
        peekValidInvite: async () => {
          throw new Error("not implemented in this test");
        },
        acceptInvite: async () => {
          throw new Error("not implemented in this test");
        },
      } as any,
      tenantProvisioningPort: {
        provisionTenant: async () => {
          throw new Error("not implemented in this test");
        },
      } as any,
      auditWriterPort: auditModule.auditWriterPort,
    });

    const salesModule = bootstrapSalesModule(
      pool,
      createTxManager(pool) as any,
      authModule.authMiddleware,
      { auditWriterPort: auditModule.auditWriterPort }
    );

    const app = express();
    app.use(express.json());
    app.locals.branchGuardPort = branchModule.branchGuardPort;
    app.locals.auditWriterPort = auditModule.auditWriterPort;
    app.locals.auditDb = pool;
    app.use("/v1/sales", salesModule.router);

    await pool.query(
      `UPDATE branch_cash_session_policies
       SET require_session_for_sales = TRUE
       WHERE tenant_id = $1 AND branch_id = $2`,
      [seeded.tenantId, seeded.branchId]
    );

    await pool.query(
      `INSERT INTO cash_sessions (tenant_id, branch_id, register_id, opened_by, status)
       VALUES ($1,$2,NULL,$3,'OPEN')`,
      [seeded.tenantId, seeded.branchId, seeded.employeeId]
    );

    const login = await authModule.authService.login({
      phone: seeded.admin.phone,
      password: seeded.admin.password,
    });
    expect(login.kind).toBe("single");
    const token = login.kind === "single" ? login.tokens.accessToken : "";

    const res = await request(app)
      .post("/v1/sales/drafts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        saleType: "dine_in",
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data?.state).toBe("draft");

    await cleanupSeededTenant(pool, seeded);
  });

  it("still blocks when another user's session is OPEN (must be the cashier's session)", async () => {
    const seeded = await seedTenantSingleBranch(pool, {
      admin: { role: "CASHIER" },
    });

    const auditModule = bootstrapAuditModule(pool);
    const branchModule = bootstrapBranchModule(pool, {
      auditWriterPort: auditModule.auditWriterPort,
    });
    const authModule = setupAuthModule(pool, {
      invitationPort: {
        peekValidInvite: async () => {
          throw new Error("not implemented in this test");
        },
        acceptInvite: async () => {
          throw new Error("not implemented in this test");
        },
      } as any,
      tenantProvisioningPort: {
        provisionTenant: async () => {
          throw new Error("not implemented in this test");
        },
      } as any,
      auditWriterPort: auditModule.auditWriterPort,
    });

    const salesModule = bootstrapSalesModule(
      pool,
      createTxManager(pool) as any,
      authModule.authMiddleware,
      { auditWriterPort: auditModule.auditWriterPort }
    );

    const app = express();
    app.use(express.json());
    app.locals.branchGuardPort = branchModule.branchGuardPort;
    app.locals.auditWriterPort = auditModule.auditWriterPort;
    app.locals.auditDb = pool;
    app.use("/v1/sales", salesModule.router);

    await pool.query(
      `UPDATE branch_cash_session_policies
       SET require_session_for_sales = TRUE
       WHERE tenant_id = $1 AND branch_id = $2`,
      [seeded.tenantId, seeded.branchId]
    );

    const phone2 = `+1777${Date.now().toString().slice(-9)}`;
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

    await pool.query(
      `INSERT INTO cash_sessions (tenant_id, branch_id, register_id, opened_by, status)
       VALUES ($1,$2,NULL,$3,'OPEN')`,
      [seeded.tenantId, seeded.branchId, employee2Id]
    );

    const login = await authModule.authService.login({
      phone: seeded.admin.phone,
      password: seeded.admin.password,
    });
    expect(login.kind).toBe("single");
    const token = login.kind === "single" ? login.tokens.accessToken : "";

    const res = await request(app)
      .post("/v1/sales/drafts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientUuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        saleType: "dine_in",
      })
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("CASH_SESSION_REQUIRED");

    await pool.query(`DELETE FROM cash_sessions WHERE opened_by = $1`, [
      employee2Id,
    ]);
    await pool.query(
      `DELETE FROM employee_branch_assignments WHERE employee_id = $1`,
      [employee2Id]
    );
    await pool.query(`DELETE FROM employees WHERE id = $1`, [employee2Id]);
    await pool.query(`DELETE FROM accounts WHERE id = $1`, [account2Id]);

    await cleanupSeededTenant(pool, seeded);
  });
});

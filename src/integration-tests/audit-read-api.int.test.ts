import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool } from "pg";
import express from "express";
import request from "supertest";
import { bootstrapAuditModule } from "../modules/audit/index.js";
import { setupAuthModule } from "../modules/auth/index.js";
import { createTestPool } from "../test-utils/db.js";
import { cleanupSeededTenant, seedTenantSingleBranch } from "../test-utils/seed.js";

describe("Audit read API access control (DB-backed)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("allows ADMIN to list logs; blocks non-admin", async () => {
    const adminSeed = await seedTenantSingleBranch(pool, {
      admin: { role: "ADMIN" },
    });
    const cashierSeed = await seedTenantSingleBranch(pool, {
      admin: { role: "CASHIER" },
    });

    const auditModule = bootstrapAuditModule(pool);
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

    const app = express();
    app.use(express.json());
    app.use("/v1/audit", auditModule.createRouter(authModule.authMiddleware));

    const adminLogin = await authModule.authService.login({
      phone: adminSeed.admin.phone,
      password: adminSeed.admin.password,
    });
    expect(adminLogin.kind).toBe("single");
    const adminToken =
      adminLogin.kind === "single" ? adminLogin.tokens.accessToken : "";

    const adminRes = await request(app)
      .get("/v1/audit/logs")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(adminRes.body.logs)).toBe(true);
    expect(adminRes.body.total).toBeGreaterThan(0);

    const cashierLogin = await authModule.authService.login({
      phone: cashierSeed.admin.phone,
      password: cashierSeed.admin.password,
    });
    expect(cashierLogin.kind).toBe("single");
    const cashierToken =
      cashierLogin.kind === "single" ? cashierLogin.tokens.accessToken : "";

    const cashierRes = await request(app)
      .get("/v1/audit/logs")
      .set("Authorization", `Bearer ${cashierToken}`)
      .expect(403);
    expect(cashierRes.body).toEqual({
      error: "Insufficient permissions for this action",
    });

    await cleanupSeededTenant(pool, adminSeed);
    await cleanupSeededTenant(pool, cashierSeed);
  });
});


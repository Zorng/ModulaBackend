import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

describe("v0 tenant provisioning (phase 3 scaffold)", () => {
  let pool: Pool;
  let app: express.Express;

  beforeAll(() => {
    process.env.V0_AUTH_PROVIDER = "local";
    process.env.AUTH_FIXED_OTP = "123456";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";

    pool = createTestPool();
    app = express();
    app.use(express.json());
    const v0AuthModule = bootstrapV0AuthModule(pool);
    app.use("/v0/auth", v0AuthModule.router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("allows zero-membership account to create tenant with owner membership and first branch", async () => {
    const phone = uniquePhone();
    const tenantName = `Tenant ${Date.now()}`;
    const firstBranchName = "Main Branch";

    const registerRes = await request(app).post("/v0/auth/register").send({
      phone,
      password: "Test123!",
      firstName: "Owner",
      lastName: "Zero",
    });
    expect(registerRes.status).toBe(201);

    await request(app).post("/v0/auth/otp/send").send({ phone });
    await request(app).post("/v0/auth/otp/verify").send({
      phone,
      otp: "123456",
    });

    const loginRes = await request(app).post("/v0/auth/login").send({
      phone,
      password: "Test123!",
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.activeMembershipsCount).toBe(0);
    const accessToken = loginRes.body.data.accessToken as string;

    const createTenantRes = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        tenantName,
        firstBranchName,
      });

    expect(createTenantRes.status).toBe(201);
    expect(createTenantRes.body.success).toBe(true);
    expect(createTenantRes.body.data.tenant.name).toBe(tenantName);
    expect(createTenantRes.body.data.ownerMembership.roleKey).toBe("OWNER");
    expect(createTenantRes.body.data.ownerMembership.status).toBe("ACTIVE");
    expect(createTenantRes.body.data.branch.name).toBe(firstBranchName);

    const tenantId = createTenantRes.body.data.tenant.id as string;
    const membershipCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_tenant_memberships
       WHERE tenant_id = $1
         AND status = 'ACTIVE'
         AND role_key = 'OWNER'`,
      [tenantId]
    );
    expect(Number(membershipCount.rows[0]?.count ?? "0")).toBe(1);

    const branchCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM branches
       WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(Number(branchCount.rows[0]?.count ?? "0")).toBe(1);

    const loginAfterProvisioning = await request(app).post("/v0/auth/login").send({
      phone,
      password: "Test123!",
    });
    expect(loginAfterProvisioning.status).toBe(200);
    expect(loginAfterProvisioning.body.data.activeMembershipsCount).toBe(1);

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [phone]);
  });
});

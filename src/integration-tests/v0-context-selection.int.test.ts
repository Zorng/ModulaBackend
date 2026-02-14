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

describe("v0 context selection (phase 5 scaffold)", () => {
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

  it("resolves tenant and branch context states and re-issues context-bound tokens", async () => {
    const ownerPhone = uniquePhone();
    const zeroPhone = uniquePhone();

    await request(app).post("/v0/auth/register").send({
      phone: ownerPhone,
      password: "Test123!",
      firstName: "Owner",
      lastName: "Context",
    });
    await request(app).post("/v0/auth/otp/send").send({ phone: ownerPhone });
    await request(app).post("/v0/auth/otp/verify").send({
      phone: ownerPhone,
      otp: "123456",
    });

    const ownerLogin = await request(app).post("/v0/auth/login").send({
      phone: ownerPhone,
      password: "Test123!",
    });
    expect(ownerLogin.status).toBe(200);
    const ownerToken = ownerLogin.body.data.accessToken as string;

    const firstTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Context Tenant A ${Date.now()}`,
        firstBranchName: "A-Branch",
      });
    expect(firstTenant.status).toBe(201);
    const firstTenantId = firstTenant.body.data.tenant.id as string;
    const firstBranchId = firstTenant.body.data.branch.id as string;

    const secondTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Context Tenant B ${Date.now()}`,
        firstBranchName: "B-Branch",
      });
    expect(secondTenant.status).toBe(201);

    const ownerLoginAfterTenants = await request(app).post("/v0/auth/login").send({
      phone: ownerPhone,
      password: "Test123!",
    });
    expect(ownerLoginAfterTenants.status).toBe(200);
    expect(ownerLoginAfterTenants.body.data.activeMembershipsCount).toBe(2);
    const ownerTokenNoContext = ownerLoginAfterTenants.body.data.accessToken as string;

    const tenantContextRes = await request(app)
      .get("/v0/auth/context/tenants")
      .set("Authorization", `Bearer ${ownerTokenNoContext}`);
    expect(tenantContextRes.status).toBe(200);
    expect(tenantContextRes.body.data.state).toBe("TENANT_SELECTION_REQUIRED");
    expect(tenantContextRes.body.data.memberships).toHaveLength(2);

    const tenantSelectRes = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerTokenNoContext}`)
      .send({ tenantId: firstTenantId });
    expect(tenantSelectRes.status).toBe(200);
    expect(tenantSelectRes.body.data.context).toEqual({
      tenantId: firstTenantId,
      branchId: null,
    });
    const tenantScopedToken = tenantSelectRes.body.data.accessToken as string;

    const branchContextRes = await request(app)
      .get("/v0/auth/context/branches")
      .set("Authorization", `Bearer ${tenantScopedToken}`);
    expect(branchContextRes.status).toBe(200);
    expect(branchContextRes.body.data.state).toBe("BRANCH_AUTO_SELECTED");
    expect(branchContextRes.body.data.selectedBranchId).toBe(firstBranchId);

    const branchSelectRes = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${tenantScopedToken}`)
      .send({ branchId: firstBranchId });
    expect(branchSelectRes.status).toBe(200);
    expect(branchSelectRes.body.data.context).toEqual({
      tenantId: firstTenantId,
      branchId: firstBranchId,
    });
    const fullContextToken = branchSelectRes.body.data.accessToken as string;

    const branchContextSelectedRes = await request(app)
      .get("/v0/auth/context/branches")
      .set("Authorization", `Bearer ${fullContextToken}`);
    expect(branchContextSelectedRes.status).toBe(200);
    expect(branchContextSelectedRes.body.data.state).toBe("BRANCH_AUTO_SELECTED");
    expect(branchContextSelectedRes.body.data.selectedBranchId).toBe(firstBranchId);

    await request(app).post("/v0/auth/register").send({
      phone: zeroPhone,
      password: "Test123!",
      firstName: "Zero",
      lastName: "Membership",
    });
    await request(app).post("/v0/auth/otp/send").send({ phone: zeroPhone });
    await request(app).post("/v0/auth/otp/verify").send({
      phone: zeroPhone,
      otp: "123456",
    });
    const zeroLogin = await request(app).post("/v0/auth/login").send({
      phone: zeroPhone,
      password: "Test123!",
    });
    const zeroToken = zeroLogin.body.data.accessToken as string;

    const zeroTenantContext = await request(app)
      .get("/v0/auth/context/tenants")
      .set("Authorization", `Bearer ${zeroToken}`);
    expect(zeroTenantContext.status).toBe(200);
    expect(zeroTenantContext.body.data.state).toBe("NO_ACTIVE_MEMBERSHIPS");
    expect(zeroTenantContext.body.data.memberships).toEqual([]);

    const zeroBranchContext = await request(app)
      .get("/v0/auth/context/branches")
      .set("Authorization", `Bearer ${zeroToken}`);
    expect(zeroBranchContext.status).toBe(200);
    expect(zeroBranchContext.body.data.state).toBe("TENANT_CONTEXT_REQUIRED");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [
      ownerPhone,
      zeroPhone,
    ]);
  });
});

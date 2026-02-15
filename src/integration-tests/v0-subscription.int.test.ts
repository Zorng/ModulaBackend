import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { bootstrapV0SubscriptionModule } from "../modules/v0/subscription/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

describe("v0 subscription (phase F3 scaffold)", () => {
  let pool: Pool;
  let app: express.Express;

  async function registerAndLogin(phone: string): Promise<string> {
    await request(app).post("/v0/auth/register").send({
      phone,
      password: "Test123!",
      firstName: "Sub",
      lastName: "User",
    });
    await request(app).post("/v0/auth/otp/send").send({ phone });
    await request(app).post("/v0/auth/otp/verify").send({
      phone,
      otp: "123456",
    });
    const login = await request(app).post("/v0/auth/login").send({
      phone,
      password: "Test123!",
    });
    return login.body.data.accessToken as string;
  }

  beforeAll(() => {
    process.env.V0_AUTH_PROVIDER = "local";
    process.env.AUTH_FIXED_OTP = "123456";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";

    pool = createTestPool();
    app = express();
    app.use(express.json());
    const v0AuthModule = bootstrapV0AuthModule(pool);
    const v0SubscriptionModule = bootstrapV0SubscriptionModule(pool);
    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    app.use("/v0/auth", v0AuthModule.router);
    app.use("/v0/subscription", v0SubscriptionModule.router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns current subscription state and branch entitlements from selected context", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(ownerPhone);

    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Sub Tenant ${Date.now()}`,
        firstBranchName: "Main Branch",
      });
    expect(createdTenant.status).toBe(201);

    const tenantId = createdTenant.body.data.tenant.id as string;
    const branchId = createdTenant.body.data.branch.id as string;

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const branchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchId });
    const branchToken = branchSelected.body.data.accessToken as string;

    const stateRes = await request(app)
      .get("/v0/subscription/state/current")
      .set("Authorization", `Bearer ${branchToken}`);
    expect(stateRes.status).toBe(200);
    expect(stateRes.body.data).toMatchObject({
      tenantId,
      state: "ACTIVE",
    });

    const entitlementRes = await request(app)
      .get("/v0/subscription/entitlements/current-branch")
      .set("Authorization", `Bearer ${branchToken}`);
    expect(entitlementRes.status).toBe(200);
    expect(entitlementRes.body.data.tenantId).toBe(tenantId);
    expect(entitlementRes.body.data.branchId).toBe(branchId);
    expect(
      entitlementRes.body.data.entitlements.some(
        (item: { entitlementKey: string; enforcement: string }) =>
          item.entitlementKey === "module.workforce" &&
          item.enforcement === "ENABLED"
      )
    ).toBe(true);

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });
});

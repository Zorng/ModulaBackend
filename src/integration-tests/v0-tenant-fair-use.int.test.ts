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

async function registerAndLogin(app: express.Express, phone: string): Promise<string> {
  const registerRes = await request(app).post("/v0/auth/register").send({
    phone,
    password: "Test123!",
    firstName: "Owner",
    lastName: "Limits",
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
  return loginRes.body.data.accessToken as string;
}

describe("v0 tenant provisioning fair-use guards", () => {
  let pool: Pool;

  beforeAll(() => {
    process.env.V0_AUTH_PROVIDER = "local";
    process.env.AUTH_FIXED_OTP = "123456";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";
    pool = createTestPool();
  });

  afterAll(async () => {
    process.env.V0_FAIRUSE_TENANT_COUNT_PER_ACCOUNT_HARD = "20";
    process.env.V0_FAIRUSE_TENANT_PROVISION_RATE_LIMIT = "10";
    process.env.V0_FAIRUSE_TENANT_PROVISION_WINDOW_SECONDS = "3600";
    await pool.end();
  });

  it("blocks tenant provisioning when rate limit is exceeded", async () => {
    process.env.V0_FAIRUSE_TENANT_COUNT_PER_ACCOUNT_HARD = "100";
    process.env.V0_FAIRUSE_TENANT_PROVISION_RATE_LIMIT = "1";
    process.env.V0_FAIRUSE_TENANT_PROVISION_WINDOW_SECONDS = "3600";

    const app = express();
    app.use(express.json());
    app.use("/v0/auth", bootstrapV0AuthModule(pool).router);

    const phone = uniquePhone();
    const accessToken = await registerAndLogin(app, phone);

    const firstCreate = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ tenantName: `Rate A ${Date.now()}` });
    expect(firstCreate.status).toBe(201);

    const secondCreate = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ tenantName: `Rate B ${Date.now()}` });

    const accountRow = await pool.query<{ id: string }>(
      `SELECT id FROM accounts WHERE phone = $1`,
      [phone]
    );
    const attemptCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_fair_use_events
       WHERE account_id = $1
         AND action_key = 'org.tenant.provision'`,
      [accountRow.rows[0].id]
    );
    expect(Number(attemptCount.rows[0]?.count ?? "0")).toBe(1);

    expect(secondCreate.status).toBe(429);
    expect(secondCreate.body.success).toBe(false);
    expect(secondCreate.body.code).toBe("FAIRUSE_RATE_LIMITED");

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [phone]);
  });

  it("blocks tenant provisioning when owner-tenant hard limit is reached", async () => {
    process.env.V0_FAIRUSE_TENANT_COUNT_PER_ACCOUNT_HARD = "1";
    process.env.V0_FAIRUSE_TENANT_PROVISION_RATE_LIMIT = "100";
    process.env.V0_FAIRUSE_TENANT_PROVISION_WINDOW_SECONDS = "3600";

    const app = express();
    app.use(express.json());
    app.use("/v0/auth", bootstrapV0AuthModule(pool).router);

    const phone = uniquePhone();
    const accessToken = await registerAndLogin(app, phone);

    const firstCreate = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ tenantName: `Hard A ${Date.now()}` });
    expect(firstCreate.status).toBe(201);

    const secondCreate = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ tenantName: `Hard B ${Date.now()}` });

    expect(secondCreate.status).toBe(409);
    expect(secondCreate.body.success).toBe(false);
    expect(secondCreate.body.code).toBe("FAIRUSE_HARD_LIMIT_EXCEEDED");

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [phone]);
  });
});

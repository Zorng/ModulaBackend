import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import crypto from "crypto";
import { createTestPool } from "../test-utils/db.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

describe("v0 access control hook (phase 6 scaffold)", () => {
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
    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    app.use("/v0/auth", v0AuthModule.router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("denies tenant-scoped route when requester has no active tenant membership", async () => {
    const phone = uniquePhone();
    const tenantId = crypto.randomUUID();

    await request(app).post("/v0/auth/register").send({
      phone,
      password: "Test123!",
      firstName: "No",
      lastName: "Membership",
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
    const accessToken = login.body.data.accessToken as string;

    await pool.query(
      `INSERT INTO tenants (id, name, status)
       VALUES ($1, 'AC Hook Tenant', 'ACTIVE')`,
      [tenantId]
    );

    const inviteAttempt = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        tenantId,
        phone: uniquePhone(),
        roleKey: "CASHIER",
      });

    expect(inviteAttempt.status).toBe(403);
    expect(inviteAttempt.body.code).toBe("NO_MEMBERSHIP");

    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [phone]);
  });

  it("denies branch-scoped route when tenant member has no active branch assignment", async () => {
    const ownerPhone = uniquePhone();
    const memberPhone = uniquePhone();

    await request(app).post("/v0/auth/register").send({
      phone: ownerPhone,
      password: "Test123!",
      firstName: "Owner",
      lastName: "AccessControl",
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
    const ownerToken = ownerLogin.body.data.accessToken as string;

    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `AC Hook Tenant ${Date.now()}`,
        firstBranchName: "Main Branch",
      });
    const tenantId = createdTenant.body.data.tenant.id as string;
    const branchId = createdTenant.body.data.branch.id as string;

    const invite = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: memberPhone,
        roleKey: "CASHIER",
      });
    const membershipId = invite.body.data.membershipId as string;

    await request(app).post("/v0/auth/register").send({
      phone: memberPhone,
      password: "Test123!",
      firstName: "Member",
      lastName: "NoBranch",
    });
    await request(app).post("/v0/auth/otp/send").send({ phone: memberPhone });
    await request(app).post("/v0/auth/otp/verify").send({
      phone: memberPhone,
      otp: "123456",
    });
    const memberLogin = await request(app).post("/v0/auth/login").send({
      phone: memberPhone,
      password: "Test123!",
    });
    const memberToken = memberLogin.body.data.accessToken as string;

    await request(app)
      .post(`/v0/auth/memberships/invitations/${membershipId}/accept`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({});

    const tenantScoped = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ tenantId });
    const tenantToken = tenantScoped.body.data.accessToken as string;

    const branchSelect = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchId });

    expect(branchSelect.status).toBe(403);
    expect(branchSelect.body.code).toBe("NO_BRANCH_ACCESS");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [
      ownerPhone,
      memberPhone,
    ]);
  });
});

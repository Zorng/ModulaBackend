import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { createActiveBranch } from "../test-utils/org.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

async function registerAndLogin(app: express.Express, phone: string): Promise<string> {
  await request(app).post("/v0/auth/register").send({
    phone,
    password: "Test123!",
    firstName: "User",
    lastName: "Isolation",
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

describe("v0 tenant isolation (phase 7 sweep)", () => {
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

  it("blocks cross-tenant privileged mutations by guessed membership IDs", async () => {
    const ownerAPhone = uniquePhone();
    const ownerBPhone = uniquePhone();
    const outsiderPhone = uniquePhone();

    const ownerAToken = await registerAndLogin(app, ownerAPhone);
    const ownerBToken = await registerAndLogin(app, ownerBPhone);

    const tenantA = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({
        tenantName: `Isolation A ${Date.now()}`,
      });
    expect(tenantA.status).toBe(201);

    const tenantB = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerBToken}`)
      .send({
        tenantName: `Isolation B ${Date.now()}`,
      });
    const tenantBId = tenantB.body.data.tenant.id as string;
    const branchBId = await createActiveBranch({
      pool,
      tenantId: tenantBId,
      branchName: "B-Branch",
    });

    const inviteInTenantB = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerBToken}`)
      .send({
        tenantId: tenantBId,
        phone: outsiderPhone,
        roleKey: "CASHIER",
      });
    expect(inviteInTenantB.status).toBe(201);
    const membershipIdInTenantB = inviteInTenantB.body.data.membershipId as string;

    const roleChangeByOwnerA = await request(app)
      .post(`/v0/auth/memberships/${membershipIdInTenantB}/role`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ roleKey: "MANAGER" });
    expect(roleChangeByOwnerA.status).toBe(403);
    expect(roleChangeByOwnerA.body.code).toBe("NO_MEMBERSHIP");

    const revokeByOwnerA = await request(app)
      .post(`/v0/auth/memberships/${membershipIdInTenantB}/revoke`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({});
    expect(revokeByOwnerA.status).toBe(403);
    expect(revokeByOwnerA.body.code).toBe("NO_MEMBERSHIP");

    const assignBranchByOwnerA = await request(app)
      .post(`/v0/auth/memberships/${membershipIdInTenantB}/branches`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ branchIds: [branchBId] });
    expect(assignBranchByOwnerA.status).toBe(403);
    expect(assignBranchByOwnerA.body.code).toBe("NO_MEMBERSHIP");

    const tenantSelectByOwnerA = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ tenantId: tenantBId });
    expect(tenantSelectByOwnerA.status).toBe(403);
    expect(tenantSelectByOwnerA.body.code).toBe("NO_MEMBERSHIP");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2, $3)`, [
      ownerAPhone,
      ownerBPhone,
      outsiderPhone,
    ]);
  });
});

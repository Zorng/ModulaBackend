import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import {
  assignActiveBranch,
  createActiveBranch,
  findActiveOwnerMembershipId,
} from "../test-utils/org.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { bootstrapV0OrgAccountModule } from "../modules/v0/orgAccount/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

async function registerAndLogin(app: express.Express, phone: string): Promise<string> {
  const register = await request(app).post("/v0/auth/register").send({
    phone,
    password: "Test123!",
    firstName: "Org",
    lastName: "User",
  });
  expect(register.status).toBe(201);

  await request(app).post("/v0/auth/otp/send").send({ phone });
  await request(app).post("/v0/auth/otp/verify").send({
    phone,
    otp: "123456",
  });

  const login = await request(app).post("/v0/auth/login").send({
    phone,
    password: "Test123!",
  });
  expect(login.status).toBe(200);
  return login.body.data.accessToken as string;
}

describe("v0 org account (phase F1 scaffold)", () => {
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
    const v0OrgAccountModule = bootstrapV0OrgAccountModule(pool);
    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    app.use("/v0/auth", v0AuthModule.router);
    app.use("/v0/org", v0OrgAccountModule.router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns tenant and branch profile details from selected context", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);

    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `X Cafe ${Date.now()}`,
      });
    expect(createdTenant.status).toBe(201);

    const tenantId = createdTenant.body.data.tenant.id as string;
    const ownerAccountResult = await pool.query<{ id: string }>(
      `SELECT id FROM accounts WHERE phone = $1`,
      [ownerPhone]
    );
    const ownerAccountId = ownerAccountResult.rows[0].id;
    const ownerMembershipId = await findActiveOwnerMembershipId({
      pool,
      tenantId,
      accountId: ownerAccountId,
    });
    const branchId = await createActiveBranch({
      pool,
      tenantId,
      branchName: "Sen Sok",
    });
    await assignActiveBranch({
      pool,
      tenantId,
      branchId,
      accountId: ownerAccountId,
      membershipId: ownerMembershipId,
    });

    await pool.query(
      `UPDATE tenants
       SET address = 'Street 2004',
           contact_phone = '+85512000001',
           logo_url = 'https://example.com/logo.png'
       WHERE id = $1`,
      [tenantId]
    );
    await pool.query(
      `UPDATE branches
       SET address = 'Sen Sok Blvd',
           contact_phone = '+85512000002'
       WHERE id = $1`,
      [branchId]
    );

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    expect(tenantSelected.status).toBe(200);
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const branchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchId });
    expect(branchSelected.status).toBe(200);
    const branchToken = branchSelected.body.data.accessToken as string;

    const tenantProfile = await request(app)
      .get("/v0/org/tenant/current")
      .set("Authorization", `Bearer ${branchToken}`);
    expect(tenantProfile.status).toBe(200);
    expect(tenantProfile.body.data).toMatchObject({
      tenantId,
      tenantName: createdTenant.body.data.tenant.name,
      tenantAddress: "Street 2004",
      contactNumber: "+85512000001",
      logoUrl: "https://example.com/logo.png",
      status: "ACTIVE",
    });

    const branchProfile = await request(app)
      .get("/v0/org/branch/current")
      .set("Authorization", `Bearer ${branchToken}`);
    expect(branchProfile.status).toBe(200);
    expect(branchProfile.body.data).toMatchObject({
      branchId,
      tenantId,
      branchName: "Sen Sok",
      branchAddress: "Sen Sok Blvd",
      contactNumber: "+85512000002",
      status: "ACTIVE",
    });

    const configuredKhqr = await request(app)
      .patch("/v0/org/branch/current/khqr-receiver")
      .set("Authorization", `Bearer ${branchToken}`)
      .send({
        khqrReceiverAccountId: "khqr-receiver",
        khqrReceiverName: "Main Branch Receiver",
      });
    expect(configuredKhqr.status).toBe(200);
    expect(configuredKhqr.body.data).toMatchObject({
      branchId,
      khqrReceiverAccountId: "khqr-receiver",
      khqrReceiverName: "Main Branch Receiver",
    });

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });

  it("lists assignment-scoped branches and still reads frozen branch status", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();

    const ownerToken = await registerAndLogin(app, ownerPhone);
    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Nodepresso ${Date.now()}`,
      });
    expect(createdTenant.status).toBe(201);

    const tenantId = createdTenant.body.data.tenant.id as string;
    const branchAId = await createActiveBranch({
      pool,
      tenantId,
      branchName: "Olympic",
    });
    const branchBId = await createActiveBranch({
      pool,
      tenantId,
      branchName: "Sen Sok",
      address: "Street 2004",
      contactPhone: "+85512000009",
    });

    const invited = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: cashierPhone,
        roleKey: "CASHIER",
      });
    expect(invited.status).toBe(201);
    const membershipId = invited.body.data.membershipId as string;

    const assigned = await request(app)
      .post(`/v0/auth/memberships/${membershipId}/branches`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchIds: [branchAId] });
    expect(assigned.status).toBe(200);

    const cashierToken = await registerAndLogin(app, cashierPhone);
    const accepted = await request(app)
      .post(`/v0/auth/memberships/invitations/${membershipId}/accept`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({});
    expect(accepted.status).toBe(200);

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ tenantId });
    expect(tenantSelected.status).toBe(200);
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const accessibleBeforeFreeze = await request(app)
      .get("/v0/org/branches/accessible")
      .set("Authorization", `Bearer ${tenantToken}`);
    expect(accessibleBeforeFreeze.status).toBe(200);
    expect(accessibleBeforeFreeze.body.data).toHaveLength(1);
    expect(accessibleBeforeFreeze.body.data[0].branchId).toBe(branchAId);
    expect(accessibleBeforeFreeze.body.data[0].status).toBe("ACTIVE");
    expect(
      accessibleBeforeFreeze.body.data.some(
        (branch: { branchId: string }) => branch.branchId === branchBId
      )
    ).toBe(false);

    const branchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchId: branchAId });
    expect(branchSelected.status).toBe(200);
    const branchToken = branchSelected.body.data.accessToken as string;

    await pool.query(`UPDATE branches SET status = 'FROZEN' WHERE id = $1`, [branchAId]);

    const accessibleAfterFreeze = await request(app)
      .get("/v0/org/branches/accessible")
      .set("Authorization", `Bearer ${tenantToken}`);
    expect(accessibleAfterFreeze.status).toBe(200);
    expect(accessibleAfterFreeze.body.data).toHaveLength(1);
    expect(accessibleAfterFreeze.body.data[0].branchId).toBe(branchAId);
    expect(accessibleAfterFreeze.body.data[0].status).toBe("FROZEN");

    const branchProfile = await request(app)
      .get("/v0/org/branch/current")
      .set("Authorization", `Bearer ${branchToken}`);
    expect(branchProfile.status).toBe(200);
    expect(branchProfile.body.data.branchId).toBe(branchAId);
    expect(branchProfile.body.data.status).toBe("FROZEN");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [
      ownerPhone,
      cashierPhone,
    ]);
  });
});

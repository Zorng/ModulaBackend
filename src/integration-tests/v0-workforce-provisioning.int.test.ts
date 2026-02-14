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

describe("v0 workforce provisioning (phase 4 scaffold)", () => {
  let pool: Pool;
  let app: express.Express;

  beforeAll(() => {
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

  it("hydrates staff profile and branch assignments on invite acceptance, and supports explicit admin assignment", async () => {
    const ownerPhone = uniquePhone();
    const inviteePhone = uniquePhone();

    const ownerRegister = await request(app).post("/v0/auth/register").send({
      phone: ownerPhone,
      password: "Test123!",
      firstName: "Owner",
      lastName: "Phase4",
    });
    expect(ownerRegister.status).toBe(201);

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
    const ownerAccessToken = ownerLogin.body.data.accessToken as string;

    const createTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerAccessToken}`)
      .send({
        tenantName: `Phase4 Tenant ${Date.now()}`,
        firstBranchName: "Branch A",
      });
    expect(createTenant.status).toBe(201);
    const tenantId = createTenant.body.data.tenant.id as string;
    const firstBranchId = createTenant.body.data.branch.id as string;

    const secondBranchInsert = await pool.query<{ id: string }>(
      `INSERT INTO branches (tenant_id, name, status)
       VALUES ($1, 'Branch B', 'ACTIVE')
       RETURNING id`,
      [tenantId]
    );
    const secondBranchId = secondBranchInsert.rows[0].id;

    const inviteRes = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerAccessToken}`)
      .send({
        tenantId,
        phone: inviteePhone,
        roleKey: "CASHIER",
      });
    expect(inviteRes.status).toBe(201);
    const inviteMembershipId = inviteRes.body.data.membershipId as string;

    const pendingAssignRes = await request(app)
      .post(`/v0/auth/memberships/${inviteMembershipId}/branches`)
      .set("Authorization", `Bearer ${ownerAccessToken}`)
      .send({ branchIds: [firstBranchId] });
    expect(pendingAssignRes.status).toBe(200);
    expect(pendingAssignRes.body.data.membershipStatus).toBe("INVITED");
    expect(pendingAssignRes.body.data.pendingBranchIds).toEqual([firstBranchId]);

    const inviteeRegister = await request(app).post("/v0/auth/register").send({
      phone: inviteePhone,
      password: "Test123!",
      firstName: "Cashier",
      lastName: "Phase4",
    });
    expect(inviteeRegister.status).toBe(201);
    expect(inviteeRegister.body.data.completedExistingInviteAccount).toBe(true);

    await request(app).post("/v0/auth/otp/send").send({ phone: inviteePhone });
    await request(app).post("/v0/auth/otp/verify").send({
      phone: inviteePhone,
      otp: "123456",
    });

    const inviteeLogin = await request(app).post("/v0/auth/login").send({
      phone: inviteePhone,
      password: "Test123!",
    });
    expect(inviteeLogin.status).toBe(200);
    const inviteeAccessToken = inviteeLogin.body.data.accessToken as string;

    const acceptRes = await request(app)
      .post(`/v0/auth/memberships/invitations/${inviteMembershipId}/accept`)
      .set("Authorization", `Bearer ${inviteeAccessToken}`)
      .send({});
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe("ACTIVE");
    expect(acceptRes.body.data.activeBranchIds).toEqual([firstBranchId]);

    const inviteeAccountId = inviteeRegister.body.data.accountId as string;
    const staffProfileCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_staff_profiles
       WHERE tenant_id = $1
         AND account_id = $2
         AND status = 'ACTIVE'`,
      [tenantId, inviteeAccountId]
    );
    expect(Number(staffProfileCount.rows[0]?.count ?? "0")).toBe(1);

    const activeAssignRes = await request(app)
      .post(`/v0/auth/memberships/${inviteMembershipId}/branches`)
      .set("Authorization", `Bearer ${ownerAccessToken}`)
      .send({ branchIds: [secondBranchId] });
    expect(activeAssignRes.status).toBe(200);
    expect(activeAssignRes.body.data.membershipStatus).toBe("ACTIVE");
    expect(activeAssignRes.body.data.activeBranchIds).toEqual(
      expect.arrayContaining([firstBranchId, secondBranchId])
    );

    const assignmentCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_branch_assignments
       WHERE membership_id = $1
         AND status = 'ACTIVE'`,
      [inviteMembershipId]
    );
    expect(Number(assignmentCount.rows[0]?.count ?? "0")).toBe(2);

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [
      ownerPhone,
      inviteePhone,
    ]);
  });
});

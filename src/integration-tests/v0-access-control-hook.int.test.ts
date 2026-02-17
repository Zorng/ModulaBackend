import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import crypto from "crypto";
import { createTestPool } from "../test-utils/db.js";
import { createActiveBranch, seedDefaultBranchEntitlements } from "../test-utils/org.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { bootstrapV0AttendanceModule } from "../modules/v0/attendance/index.js";
import { bootstrapV0StaffManagementModule } from "../modules/v0/hr/staffManagement/index.js";
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

  async function registerAndLogin(phone: string): Promise<string> {
    await request(app).post("/v0/auth/register").send({
      phone,
      password: "Test123!",
      firstName: "Access",
      lastName: "Control",
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
    const v0AttendanceModule = bootstrapV0AttendanceModule(pool);
    const v0StaffManagementModule = bootstrapV0StaffManagementModule(pool);
    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    app.use("/v0/auth", v0AuthModule.router);
    app.use("/v0/attendance", v0AttendanceModule.router);
    app.use("/v0/hr", v0StaffManagementModule.router);
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

  it("fails closed for unregistered /v0 routes", async () => {
    const unknownRoute = await request(app).get("/v0/not-registered-anywhere");
    expect(unknownRoute.status).toBe(403);
    expect(unknownRoute.body.code).toBe("ACCESS_CONTROL_ROUTE_NOT_REGISTERED");
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
      });
    const tenantId = createdTenant.body.data.tenant.id as string;
    const branchId = await createActiveBranch({
      pool,
      tenantId,
      branchName: "Main Branch",
    });
    await seedDefaultBranchEntitlements({ pool, tenantId, branchId });

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

  it("denies tenant-scoped write when tenant is frozen", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(ownerPhone);

    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Frozen Tenant ${Date.now()}`,
      });
    const tenantId = createdTenant.body.data.tenant.id as string;

    await pool.query(`UPDATE tenants SET status = 'FROZEN' WHERE id = $1`, [tenantId]);

    const inviteAttempt = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: uniquePhone(),
        roleKey: "CASHIER",
      });

    expect(inviteAttempt.status).toBe(403);
    expect(inviteAttempt.body.code).toBe("TENANT_NOT_ACTIVE");

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });

  it("denies tenant-scoped write when subscription state is frozen", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(ownerPhone);

    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Subscription Frozen ${Date.now()}`,
      });
    const tenantId = createdTenant.body.data.tenant.id as string;

    await pool.query(
      `UPDATE v0_tenant_subscription_states
       SET state = 'FROZEN', updated_at = NOW()
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const inviteAttempt = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: uniquePhone(),
        roleKey: "CASHIER",
      });

    expect(inviteAttempt.status).toBe(403);
    expect(inviteAttempt.body.code).toBe("SUBSCRIPTION_FROZEN");

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });

  it("denies branch-scoped write when branch is frozen", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();

    const ownerToken = await registerAndLogin(ownerPhone);
    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Frozen Branch ${Date.now()}`,
      });
    const tenantId = createdTenant.body.data.tenant.id as string;
    const branchId = await createActiveBranch({
      pool,
      tenantId,
      branchName: "Main Branch",
    });
    await seedDefaultBranchEntitlements({ pool, tenantId, branchId });

    const invite = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: cashierPhone,
        roleKey: "CASHIER",
      });
    const membershipId = invite.body.data.membershipId as string;

    await request(app)
      .post(`/v0/hr/staff/memberships/${membershipId}/branches`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchIds: [branchId] });

    const cashierToken = await registerAndLogin(cashierPhone);
    await request(app)
      .post(`/v0/auth/memberships/invitations/${membershipId}/accept`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({});

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ tenantId });
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const branchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchId });
    const branchToken = branchSelected.body.data.accessToken as string;

    await pool.query(`UPDATE branches SET status = 'FROZEN' WHERE id = $1`, [branchId]);

    const checkIn = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${branchToken}`)
      .send({});

    expect(checkIn.status).toBe(403);
    expect(checkIn.body.code).toBe("BRANCH_FROZEN");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [
      ownerPhone,
      cashierPhone,
    ]);
  });

  it("denies privileged tenant write for role without permission", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();
    const outsiderPhone = uniquePhone();

    const ownerToken = await registerAndLogin(ownerPhone);
    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Role Deny ${Date.now()}`,
      });
    const tenantId = createdTenant.body.data.tenant.id as string;

    const invited = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: cashierPhone,
        roleKey: "CASHIER",
      });
    const membershipId = invited.body.data.membershipId as string;

    const cashierToken = await registerAndLogin(cashierPhone);
    await request(app)
      .post(`/v0/auth/memberships/invitations/${membershipId}/accept`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({});

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ tenantId });
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const inviteByCashier = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({
        tenantId,
        phone: outsiderPhone,
        roleKey: "CASHIER",
      });

    expect(inviteByCashier.status).toBe(403);
    expect(inviteByCashier.body.code).toBe("PERMISSION_DENIED");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2, $3)`, [
      ownerPhone,
      cashierPhone,
      outsiderPhone,
    ]);
  });

  it("denies branch write as entitlement read-only and blocks read when disabled", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();

    const ownerToken = await registerAndLogin(ownerPhone);
    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Entitlement Tenant ${Date.now()}`,
      });
    const tenantId = createdTenant.body.data.tenant.id as string;
    const branchId = await createActiveBranch({
      pool,
      tenantId,
      branchName: "Main Branch",
    });
    await seedDefaultBranchEntitlements({ pool, tenantId, branchId });

    const invite = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: cashierPhone,
        roleKey: "CASHIER",
      });
    const membershipId = invite.body.data.membershipId as string;

    await request(app)
      .post(`/v0/hr/staff/memberships/${membershipId}/branches`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchIds: [branchId] });

    const cashierToken = await registerAndLogin(cashierPhone);
    await request(app)
      .post(`/v0/auth/memberships/invitations/${membershipId}/accept`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({});

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ tenantId });
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const branchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchId });
    const branchToken = branchSelected.body.data.accessToken as string;

    await pool.query(
      `UPDATE v0_branch_entitlements
       SET enforcement = 'READ_ONLY', updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND entitlement_key = 'module.workforce'`,
      [tenantId, branchId]
    );

    const readOnlyWrite = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${branchToken}`)
      .send({});
    expect(readOnlyWrite.status).toBe(403);
    expect(readOnlyWrite.body.code).toBe("ENTITLEMENT_READ_ONLY");

    await pool.query(
      `UPDATE v0_branch_entitlements
       SET enforcement = 'DISABLED_VISIBLE', updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND entitlement_key = 'module.workforce'`,
      [tenantId, branchId]
    );

    const blockedRead = await request(app)
      .get("/v0/attendance/me")
      .set("Authorization", `Bearer ${branchToken}`);
    expect(blockedRead.status).toBe(403);
    expect(blockedRead.body.code).toBe("ENTITLEMENT_BLOCKED");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [
      ownerPhone,
      cashierPhone,
    ]);
  });
});

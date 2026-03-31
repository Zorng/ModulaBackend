import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { createActiveBranch, seedDefaultBranchEntitlements } from "../test-utils/org.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { bootstrapV0AttendanceModule } from "../modules/v0/hr/attendance/index.js";
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
    firstName: "User",
    lastName: "Attendance",
  });
  expect([201, 409]).toContain(register.status);

  if (register.status === 201) {
    await request(app).post("/v0/auth/otp/send").send({ phone });
    await request(app).post("/v0/auth/otp/verify").send({
      phone,
      otp: "123456",
    });
  }

  const login = await request(app).post("/v0/auth/login").send({
    phone,
    password: "Test123!",
  });
  expect(login.status).toBe(200);
  return login.body.data.accessToken as string;
}

describe("v0 attendance (phase 8 vertical slice)", () => {
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
    const v0AttendanceModule = bootstrapV0AttendanceModule(pool);
    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    app.use("/v0/auth", v0AuthModule.router);
    app.use("/v0/attendance", v0AttendanceModule.router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("records check-in/check-out and handles idempotent replay for branch writes", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();

    const ownerToken = await registerAndLogin(app, ownerPhone);
    await registerAndLogin(app, cashierPhone);
    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Attendance Tenant ${Date.now()}`,
      });
    expect(createdTenant.status).toBe(201);

    const tenantId = createdTenant.body.data.tenant.id as string;
    const branchId = await createActiveBranch({
      pool,
      tenantId,
      branchName: "Main Branch",
    });
    await seedDefaultBranchEntitlements({ pool, tenantId, branchId });

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
      .send({ branchIds: [branchId] });
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

    const branchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchId });
    expect(branchSelected.status).toBe(200);
    const branchToken = branchSelected.body.data.accessToken as string;

    const checkIn = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${branchToken}`)
      .set("Idempotency-Key", "att-check-in-1")
      .send({ occurredAt: "2026-02-13T08:00:00.000Z" });
    expect(checkIn.status).toBe(201);
    expect(checkIn.body.data.type).toBe("CHECK_IN");

    const replayedCheckIn = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${branchToken}`)
      .set("Idempotency-Key", "att-check-in-1")
      .send({ occurredAt: "2026-02-13T08:00:00.000Z" });
    expect(replayedCheckIn.status).toBe(201);
    expect(replayedCheckIn.body.data.type).toBe("CHECK_IN");
    expect(replayedCheckIn.headers["idempotency-replayed"]).toBe("true");

    const duplicateCheckInBusiness = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${branchToken}`)
      .set("Idempotency-Key", "att-check-in-2")
      .send({ occurredAt: "2026-02-13T09:00:00.000Z" });
    expect(duplicateCheckInBusiness.status).toBe(409);
    expect(duplicateCheckInBusiness.body.error).toBe("already checked in");

    const checkOut = await request(app)
      .post("/v0/attendance/check-out")
      .set("Authorization", `Bearer ${branchToken}`)
      .set("Idempotency-Key", "att-check-out-1")
      .send({ occurredAt: "2026-02-13T17:00:00.000Z" });
    expect(checkOut.status).toBe(201);
    expect(checkOut.body.data.type).toBe("CHECK_OUT");

    const replayedCheckOut = await request(app)
      .post("/v0/attendance/check-out")
      .set("Authorization", `Bearer ${branchToken}`)
      .set("Idempotency-Key", "att-check-out-1")
      .send({ occurredAt: "2026-02-13T17:00:00.000Z" });
    expect(replayedCheckOut.status).toBe(201);
    expect(replayedCheckOut.body.data.type).toBe("CHECK_OUT");
    expect(replayedCheckOut.headers["idempotency-replayed"]).toBe("true");

    const duplicateCheckOutBusiness = await request(app)
      .post("/v0/attendance/check-out")
      .set("Authorization", `Bearer ${branchToken}`)
      .set("Idempotency-Key", "att-check-out-2")
      .send({ occurredAt: "2026-02-13T17:30:00.000Z" });
    expect(duplicateCheckOutBusiness.status).toBe(409);
    expect(duplicateCheckOutBusiness.body.error).toBe("no active check-in");

    const listMine = await request(app)
      .get("/v0/attendance/me?limit=10")
      .set("Authorization", `Bearer ${branchToken}`);
    expect(listMine.status).toBe(200);
    expect(Array.isArray(listMine.body.data.items)).toBe(true);
    expect(listMine.body.data.items).toHaveLength(2);
    expect(listMine.body.data.items[0].type).toBe("CHECK_OUT");
    expect(listMine.body.data.items[1].type).toBe("CHECK_IN");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [
      ownerPhone,
      cashierPhone,
    ]);
  });

  it("returns idempotency conflict for same key with different payload and requires idempotency key", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();

    const ownerToken = await registerAndLogin(app, ownerPhone);
    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Attendance Idempotency ${Date.now()}`,
      });
    expect(createdTenant.status).toBe(201);

    const tenantId = createdTenant.body.data.tenant.id as string;
    const branchId = await createActiveBranch({
      pool,
      tenantId,
      branchName: "Main Branch",
    });
    await seedDefaultBranchEntitlements({ pool, tenantId, branchId });

    const invited = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: cashierPhone,
        roleKey: "CASHIER",
      });
    const membershipId = invited.body.data.membershipId as string;

    await request(app)
      .post(`/v0/auth/memberships/${membershipId}/branches`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchIds: [branchId] });

    const cashierToken = await registerAndLogin(app, cashierPhone);
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

    const first = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${branchToken}`)
      .set("Idempotency-Key", "att-conflict-1")
      .send({ occurredAt: "2026-02-14T08:00:00.000Z" });
    expect(first.status).toBe(201);

    const conflict = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${branchToken}`)
      .set("Idempotency-Key", "att-conflict-1")
      .send({ occurredAt: "2026-02-14T08:30:00.000Z" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    const missingKey = await request(app)
      .post("/v0/attendance/check-out")
      .set("Authorization", `Bearer ${branchToken}`)
      .send({ occurredAt: "2026-02-14T17:00:00.000Z" });
    expect(missingKey.status).toBe(422);
    expect(missingKey.body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [
      ownerPhone,
      cashierPhone,
    ]);
  });

  it("supports manager force-end and manager/admin attendance query surfaces", async () => {
    const ownerPhone = uniquePhone();
    const managerPhone = uniquePhone();
    const cashierPhone = uniquePhone();

    const ownerToken = await registerAndLogin(app, ownerPhone);
    await registerAndLogin(app, managerPhone);
    await registerAndLogin(app, cashierPhone);
    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Attendance Manager ${Date.now()}`,
      });
    expect(createdTenant.status).toBe(201);

    const tenantId = createdTenant.body.data.tenant.id as string;
    const branchId = await createActiveBranch({
      pool,
      tenantId,
      branchName: "Main Branch",
    });
    await seedDefaultBranchEntitlements({ pool, tenantId, branchId });

    const managerInvite = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: managerPhone,
        roleKey: "MANAGER",
      });
    expect(managerInvite.status).toBe(201);
    const managerMembershipId = managerInvite.body.data.membershipId as string;

    const cashierInvite = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: cashierPhone,
        roleKey: "CASHIER",
      });
    expect(cashierInvite.status).toBe(201);
    const cashierMembershipId = cashierInvite.body.data.membershipId as string;

    await request(app)
      .post(`/v0/auth/memberships/${managerMembershipId}/branches`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchIds: [branchId] });
    await request(app)
      .post(`/v0/auth/memberships/${cashierMembershipId}/branches`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchIds: [branchId] });

    const managerToken = await registerAndLogin(app, managerPhone);
    const cashierToken = await registerAndLogin(app, cashierPhone);

    await request(app)
      .post(`/v0/auth/memberships/invitations/${managerMembershipId}/accept`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({});
    await request(app)
      .post(`/v0/auth/memberships/invitations/${cashierMembershipId}/accept`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({});

    const managerTenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ tenantId });
    const managerTenantToken = managerTenantSelected.body.data.accessToken as string;
    const managerBranchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${managerTenantToken}`)
      .send({ branchId });
    const managerBranchToken = managerBranchSelected.body.data.accessToken as string;

    const cashierTenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ tenantId });
    const cashierTenantToken = cashierTenantSelected.body.data.accessToken as string;
    const cashierBranchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${cashierTenantToken}`)
      .send({ branchId });
    const cashierBranchToken = cashierBranchSelected.body.data.accessToken as string;

    const ownerTenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    const ownerTenantToken = ownerTenantSelected.body.data.accessToken as string;

    const cashierCheckIn = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${cashierBranchToken}`)
      .set("Idempotency-Key", "att-force-check-in")
      .send({ occurredAt: "2026-02-15T08:00:00.000Z" });
    expect(cashierCheckIn.status).toBe(201);

    const forceEnded = await request(app)
      .post("/v0/attendance/force-end")
      .set("Authorization", `Bearer ${managerBranchToken}`)
      .set("Idempotency-Key", "att-force-end-1")
      .send({
        targetAccountId: cashierCheckIn.body.data.accountId,
        reason: "manager correction",
        occurredAt: "2026-02-15T17:00:00.000Z",
      });
    expect(forceEnded.status).toBe(201);
    expect(forceEnded.body.data.type).toBe("CHECK_OUT");
    expect(forceEnded.body.data.accountId).toBe(cashierCheckIn.body.data.accountId);
    expect(forceEnded.body.data.forceEndedByAccountId).toBeTruthy();
    expect(forceEnded.body.data.forceEndReason).toBe("manager correction");

    const persistedForceEnd = await pool.query<{
      force_ended_by_account_id: string | null;
      force_end_reason: string | null;
    }>(
      `SELECT force_ended_by_account_id, force_end_reason
       FROM v0_attendance_records
       WHERE id = $1`,
      [forceEnded.body.data.id]
    );
    expect(persistedForceEnd.rows[0]?.force_ended_by_account_id).toBe(
      forceEnded.body.data.forceEndedByAccountId
    );
    expect(persistedForceEnd.rows[0]?.force_end_reason).toBe("manager correction");

    const replayedForceEnd = await request(app)
      .post("/v0/attendance/force-end")
      .set("Authorization", `Bearer ${managerBranchToken}`)
      .set("Idempotency-Key", "att-force-end-1")
      .send({
        targetAccountId: cashierCheckIn.body.data.accountId,
        reason: "manager correction",
        occurredAt: "2026-02-15T17:00:00.000Z",
      });
    expect(replayedForceEnd.status).toBe(201);
    expect(replayedForceEnd.headers["idempotency-replayed"]).toBe("true");

    const branchList = await request(app)
      .get("/v0/attendance/branch?limit=10")
      .set("Authorization", `Bearer ${managerBranchToken}`);
    expect(branchList.status).toBe(200);
    expect(Array.isArray(branchList.body.data.items)).toBe(true);
    expect(branchList.body.data.items.length).toBeGreaterThanOrEqual(2);
    expect(branchList.body.data.items[0].account).toBeDefined();
    expect(branchList.body.data.items[0].branch).toBeDefined();

    const tenantList = await request(app)
      .get("/v0/attendance/tenant?limit=20")
      .set("Authorization", `Bearer ${ownerTenantToken}`);
    expect(tenantList.status).toBe(200);
    expect(Array.isArray(tenantList.body.data.items)).toBe(true);
    expect(
      tenantList.body.data.items.some(
        (row: { accountId: string; type: string }) =>
          row.accountId === cashierCheckIn.body.data.accountId && row.type === "CHECK_OUT"
      )
    ).toBe(true);

    const cashierDeniedBranchList = await request(app)
      .get("/v0/attendance/branch?limit=10")
      .set("Authorization", `Bearer ${cashierBranchToken}`);
    expect(cashierDeniedBranchList.status).toBe(403);
    expect(cashierDeniedBranchList.body.code).toBe("PERMISSION_DENIED");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2, $3)`, [
      ownerPhone,
      managerPhone,
      cashierPhone,
    ]);
  });

  it("denies attendance actions when branch context is missing", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();

    const ownerToken = await registerAndLogin(app, ownerPhone);
    await registerAndLogin(app, cashierPhone);
    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Attendance Guard ${Date.now()}`,
      });
    expect(createdTenant.status).toBe(201);

    const tenantId = createdTenant.body.data.tenant.id as string;
    const branchId = await createActiveBranch({
      pool,
      tenantId,
      branchName: "Guard Branch",
    });
    await seedDefaultBranchEntitlements({ pool, tenantId, branchId });

    const invited = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: cashierPhone,
        roleKey: "CASHIER",
      });
    const membershipId = invited.body.data.membershipId as string;
    await request(app)
      .post(`/v0/auth/memberships/${membershipId}/branches`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchIds: [branchId] });

    const cashierToken = await registerAndLogin(app, cashierPhone);
    await request(app)
      .post(`/v0/auth/memberships/invitations/${membershipId}/accept`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({});

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ tenantId });
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const noBranchContext = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${tenantToken}`)
      .set("Idempotency-Key", "att-no-branch-1")
      .send({ occurredAt: "2026-02-13T08:00:00.000Z" });

    expect(noBranchContext.status).toBe(403);
    expect(noBranchContext.body.code).toBe("BRANCH_CONTEXT_REQUIRED");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [
      ownerPhone,
      cashierPhone,
    ]);
  });
});

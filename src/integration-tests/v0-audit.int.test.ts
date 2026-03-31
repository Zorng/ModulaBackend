import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { createActiveBranch, seedDefaultBranchEntitlements } from "../test-utils/org.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { bootstrapV0AttendanceModule } from "../modules/v0/hr/attendance/index.js";
import { bootstrapV0AuditModule } from "../modules/v0/audit/index.js";
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
    firstName: "Audit",
    lastName: "User",
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

async function selectTenant(
  app: express.Express,
  token: string,
  tenantId: string
): Promise<string> {
  const selected = await request(app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${token}`)
    .send({ tenantId });
  expect(selected.status).toBe(200);
  return selected.body.data.accessToken as string;
}

describe("v0 audit (phase f5)", () => {
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
    const v0AuditModule = bootstrapV0AuditModule(pool);

    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    app.use("/v0/auth", v0AuthModule.router);
    app.use("/v0/attendance", v0AttendanceModule.router);
    app.use("/v0/audit", v0AuditModule.router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("writes success and rejection audit events with idempotent dedupe", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();

    const ownerToken = await registerAndLogin(app, ownerPhone);
    await registerAndLogin(app, cashierPhone);
    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Audit Tenant ${Date.now()}`,
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

    const cashierTenantToken = await selectTenant(app, cashierToken, tenantId);
    const cashierBranchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${cashierTenantToken}`)
      .send({ branchId });
    expect(cashierBranchSelected.status).toBe(200);
    const cashierBranchToken = cashierBranchSelected.body.data.accessToken as string;

    const checkIn = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${cashierBranchToken}`)
      .set("Idempotency-Key", "audit-check-in-1")
      .send({ occurredAt: "2026-02-15T08:00:00.000Z" });
    expect(checkIn.status).toBe(201);

    const replay = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${cashierBranchToken}`)
      .set("Idempotency-Key", "audit-check-in-1")
      .send({ occurredAt: "2026-02-15T08:00:00.000Z" });
    expect(replay.status).toBe(201);
    expect(replay.headers["idempotency-replayed"]).toBe("true");

    const rejected = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${cashierBranchToken}`)
      .set("Idempotency-Key", "audit-check-in-2")
      .send({ occurredAt: "2026-02-15T09:00:00.000Z" });
    expect(rejected.status).toBe(409);

    const rows = await pool.query<{
      action_key: string;
      outcome: string;
      reason_code: string | null;
      dedupe_key: string | null;
    }>(
      `SELECT action_key, outcome, reason_code, dedupe_key
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'attendance.checkIn'
       ORDER BY created_at ASC`,
      [tenantId]
    );

    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({
      action_key: "attendance.checkIn",
      outcome: "SUCCESS",
      reason_code: null,
      dedupe_key: "attendance.checkIn:SUCCESS:audit-check-in-1",
    });
    expect(rows.rows[1]).toMatchObject({
      action_key: "attendance.checkIn",
      outcome: "REJECTED",
      reason_code: "ALREADY_CHECKED_IN",
      dedupe_key: "attendance.checkIn:REJECTED:audit-check-in-2",
    });

    const ownerTenantToken = await selectTenant(app, ownerToken, tenantId);
    const listed = await request(app)
      .get("/v0/audit/events?actionKey=attendance.checkIn")
      .set("Authorization", `Bearer ${ownerTenantToken}`);

    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body.data.items)).toBe(true);
    expect(listed.body.data.items).toHaveLength(2);

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [ownerPhone, cashierPhone]);
  });

  it("restricts audit reads to owner/admin roles", async () => {
    const ownerPhone = uniquePhone();
    const adminPhone = uniquePhone();
    const cashierPhone = uniquePhone();

    const ownerToken = await registerAndLogin(app, ownerPhone);
    await registerAndLogin(app, adminPhone);
    await registerAndLogin(app, cashierPhone);
    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Audit Roles ${Date.now()}`,
      });
    expect(createdTenant.status).toBe(201);
    const tenantId = createdTenant.body.data.tenant.id as string;

    const adminInvite = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: adminPhone,
        roleKey: "ADMIN",
      });
    expect(adminInvite.status).toBe(201);

    const cashierInvite = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: cashierPhone,
        roleKey: "CASHIER",
      });
    expect(cashierInvite.status).toBe(201);

    const adminToken = await registerAndLogin(app, adminPhone);
    const cashierToken = await registerAndLogin(app, cashierPhone);

    const adminMembershipId = adminInvite.body.data.membershipId as string;
    const cashierMembershipId = cashierInvite.body.data.membershipId as string;

    await request(app)
      .post(`/v0/auth/memberships/invitations/${adminMembershipId}/accept`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    await request(app)
      .post(`/v0/auth/memberships/invitations/${cashierMembershipId}/accept`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({});

    const adminTenantToken = await selectTenant(app, adminToken, tenantId);
    const cashierTenantToken = await selectTenant(app, cashierToken, tenantId);

    const adminRead = await request(app)
      .get("/v0/audit/events")
      .set("Authorization", `Bearer ${adminTenantToken}`);
    expect(adminRead.status).toBe(200);

    const cashierRead = await request(app)
      .get("/v0/audit/events")
      .set("Authorization", `Bearer ${cashierTenantToken}`);
    expect(cashierRead.status).toBe(403);
    expect(cashierRead.body.code).toBe("PERMISSION_DENIED");

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2, $3)`, [
      ownerPhone,
      adminPhone,
      cashierPhone,
    ]);
  });
});

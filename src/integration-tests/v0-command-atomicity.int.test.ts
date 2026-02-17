import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { createActiveBranch, seedDefaultBranchEntitlements } from "../test-utils/org.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { bootstrapV0AttendanceModule } from "../modules/v0/attendance/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";

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
    firstName: "User",
    lastName: "Atomicity",
  });
  expect(registerRes.status).toBe(201);

  await request(app).post("/v0/auth/otp/send").send({ phone });
  await request(app).post("/v0/auth/otp/verify").send({ phone, otp: "123456" });

  const loginRes = await request(app).post("/v0/auth/login").send({
    phone,
    password: "Test123!",
  });
  expect(loginRes.status).toBe(200);
  return loginRes.body.data.accessToken as string;
}

async function setupCashierBranchContext(input: {
  app: express.Express;
  pool: Pool;
  ownerPhone: string;
  cashierPhone: string;
  tenantName: string;
}): Promise<{
  ownerToken: string;
  tenantId: string;
  branchId: string;
  membershipId: string;
  cashierBranchToken: string;
}> {
  const ownerToken = await registerAndLogin(input.app, input.ownerPhone);
  const createdTenant = await request(input.app)
    .post("/v0/auth/tenants")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      tenantName: input.tenantName,
    });
  expect(createdTenant.status).toBe(201);

  const tenantId = createdTenant.body.data.tenant.id as string;
  const branchId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: "Main Branch",
  });
  await seedDefaultBranchEntitlements({ pool: input.pool, tenantId, branchId });

  const invited = await request(input.app)
    .post("/v0/auth/memberships/invite")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      tenantId,
      phone: input.cashierPhone,
      roleKey: "CASHIER",
    });
  expect(invited.status).toBe(201);
  const membershipId = invited.body.data.membershipId as string;

  const assigned = await request(input.app)
    .post(`/v0/auth/memberships/${membershipId}/branches`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ branchIds: [branchId] });
  expect(assigned.status).toBe(200);

  const cashierToken = await registerAndLogin(input.app, input.cashierPhone);
  const accepted = await request(input.app)
    .post(`/v0/auth/memberships/invitations/${membershipId}/accept`)
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({});
  expect(accepted.status).toBe(200);

  const tenantSelected = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({ tenantId });
  expect(tenantSelected.status).toBe(200);
  const cashierTenantToken = tenantSelected.body.data.accessToken as string;

  const branchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${cashierTenantToken}`)
    .send({ branchId });
  expect(branchSelected.status).toBe(200);
  const cashierBranchToken = branchSelected.body.data.accessToken as string;

  return {
    ownerToken,
    tenantId,
    branchId,
    membershipId,
    cashierBranchToken,
  };
}

describe("v0 atomic command contract", () => {
  let pool: Pool;
  let app: express.Express;

  beforeAll(() => {
    process.env.V0_AUTH_PROVIDER = "local";
    process.env.AUTH_FIXED_OTP = "123456";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";

    pool = createTestPool();
    app = express();
    app.use(express.json());
    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    app.use("/v0/auth", bootstrapV0AuthModule(pool).router);
    app.use("/v0/attendance", bootstrapV0AttendanceModule(pool).router);
  });

  afterAll(async () => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
    await pool.end();
  });

  it("rolls back org.tenant.provision when outbox insert fails", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);
    const tenantName = `Atomic Tenant ${Date.now()}`;

    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "org.tenant.provision";

    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantName });

    expect(createdTenant.status).toBe(500);
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";

    const tenantCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM tenants
       WHERE name = $1`,
      [tenantName]
    );
    expect(Number(tenantCount.rows[0]?.count ?? "0")).toBe(0);

    const ownerAccount = await pool.query<{ id: string }>(
      `SELECT id
       FROM accounts
       WHERE phone = $1`,
      [ownerPhone]
    );
    const ownerAccountId = ownerAccount.rows[0]?.id ?? null;
    expect(ownerAccountId).not.toBeNull();

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE action_key = 'org.tenant.provision'
         AND actor_account_id = $1`,
      [ownerAccountId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(0);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE action_key = 'org.tenant.provision'
         AND actor_id = $1`,
      [ownerAccountId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(0);

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });

  it("rolls back org.membership.invite when outbox insert fails (via auth alias)", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);

    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantName: `Atomic Invite Tenant ${Date.now()}`,
      });
    expect(createdTenant.status).toBe(201);

    const tenantId = createdTenant.body.data.tenant.id as string;
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "org.membership.invite";

    const invited = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: cashierPhone,
        roleKey: "CASHIER",
      });

    expect(invited.status).toBe(500);
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";

    const membershipCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_tenant_memberships m
       JOIN accounts a ON a.id = m.account_id
       WHERE m.tenant_id = $1
         AND a.phone = $2`,
      [tenantId, cashierPhone]
    );
    expect(Number(membershipCount.rows[0]?.count ?? "0")).toBe(0);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'org.membership.invite'`,
      [tenantId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(0);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND action_key = 'org.membership.invite'`,
      [tenantId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(0);

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [ownerPhone, cashierPhone]);
  });

  it("keeps attendance replay-safe with a single outbox/audit write for duplicate idempotent replay", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();
    const setup = await setupCashierBranchContext({
      app,
      pool,
      ownerPhone,
      cashierPhone,
      tenantName: `Atomic Attendance Replay ${Date.now()}`,
    });

    const firstCheckIn = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${setup.cashierBranchToken}`)
      .set("Idempotency-Key", "atomic-attendance-replay-1")
      .send({ occurredAt: "2026-02-16T08:00:00.000Z" });
    expect(firstCheckIn.status).toBe(201);

    const replayedCheckIn = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${setup.cashierBranchToken}`)
      .set("Idempotency-Key", "atomic-attendance-replay-1")
      .send({ occurredAt: "2026-02-16T08:00:00.000Z" });
    expect(replayedCheckIn.status).toBe(201);
    expect(replayedCheckIn.headers["idempotency-replayed"]).toBe("true");

    const attendanceCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_attendance_records
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(attendanceCount.rows[0]?.count ?? "0")).toBe(1);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'attendance.checkIn'`,
      [setup.tenantId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(1);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND action_key = 'attendance.checkIn'`,
      [setup.tenantId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(1);

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [ownerPhone, cashierPhone]);
  });

  it("rolls back attendance.checkIn when outbox insert fails and clears idempotency processing state", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();
    const setup = await setupCashierBranchContext({
      app,
      pool,
      ownerPhone,
      cashierPhone,
      tenantName: `Atomic Attendance Rollback ${Date.now()}`,
    });

    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "attendance.checkIn";
    const failedCheckIn = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${setup.cashierBranchToken}`)
      .set("Idempotency-Key", "atomic-attendance-fail-1")
      .send({ occurredAt: "2026-02-16T08:10:00.000Z" });
    expect(failedCheckIn.status).toBe(500);
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";

    const attendanceCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_attendance_records
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(attendanceCount.rows[0]?.count ?? "0")).toBe(0);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'attendance.checkIn'`,
      [setup.tenantId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(0);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND action_key = 'attendance.checkIn'`,
      [setup.tenantId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(0);

    const idempotencyCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_idempotency_records
       WHERE tenant_id = $1
         AND action_key = 'attendance.checkIn'
         AND idempotency_key = 'atomic-attendance-fail-1'`,
      [setup.tenantId]
    );
    expect(Number(idempotencyCount.rows[0]?.count ?? "0")).toBe(0);

    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [ownerPhone, cashierPhone]);
  });
});

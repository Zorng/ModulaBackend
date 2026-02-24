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
import { bootstrapV0StaffManagementModule } from "../modules/v0/hr/staffManagement/index.js";
import { bootstrapV0ShiftModule } from "../modules/v0/hr/shift/index.js";
import { bootstrapV0PullSyncModule } from "../modules/v0/platformSystem/pullSync/index.js";
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
    firstName: "Shift",
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

async function setupShiftWriteContext(input: {
  app: express.Express;
  pool: Pool;
  ownerPhone: string;
  staffPhone: string;
  tenantName: string;
}): Promise<{
  tenantId: string;
  branchId: string;
  membershipId: string;
  ownerTenantToken: string;
  ownerBranchToken: string;
}> {
  const ownerToken = await registerAndLogin(input.app, input.ownerPhone);
  const createdTenant = await request(input.app)
    .post("/v0/auth/tenants")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantName: input.tenantName });
  expect(createdTenant.status).toBe(201);
  const tenantId = createdTenant.body.data.tenant.id as string;

  const branchId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: "Shift Branch",
  });

  const ownerAccount = await input.pool.query<{ id: string }>(
    `SELECT id
     FROM accounts
     WHERE phone = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.ownerPhone]
  );
  const ownerAccountId = ownerAccount.rows[0]?.id;
  if (!ownerAccountId) {
    throw new Error("owner account not found after registration");
  }
  const ownerMembershipId = await findActiveOwnerMembershipId({
    pool: input.pool,
    tenantId,
    accountId: ownerAccountId,
  });
  await assignActiveBranch({
    pool: input.pool,
    tenantId,
    branchId,
    accountId: ownerAccountId,
    membershipId: ownerMembershipId,
  });

  const invited = await request(input.app)
    .post("/v0/auth/memberships/invite")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      tenantId,
      phone: input.staffPhone,
      roleKey: "CASHIER",
    });
  expect(invited.status).toBe(201);
  const membershipId = invited.body.data.membershipId as string;

  const assigned = await request(input.app)
    .post(`/v0/auth/memberships/${membershipId}/branches`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ branchIds: [branchId] });
  expect(assigned.status).toBe(200);

  const staffToken = await registerAndLogin(input.app, input.staffPhone);
  const accepted = await request(input.app)
    .post(`/v0/auth/memberships/invitations/${membershipId}/accept`)
    .set("Authorization", `Bearer ${staffToken}`)
    .send({});
  expect(accepted.status).toBe(200);

  const ownerTenantContext = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantId });
  expect(ownerTenantContext.status).toBe(200);
  const ownerTenantToken = ownerTenantContext.body.data.accessToken as string;

  const ownerBranchContext = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${ownerTenantToken}`)
    .send({ branchId });
  expect(ownerBranchContext.status).toBe(200);
  const ownerBranchToken = ownerBranchContext.body.data.accessToken as string;

  return {
    tenantId,
    branchId,
    membershipId,
    ownerTenantToken,
    ownerBranchToken,
  };
}

describe("v0 shift (phase 4 reliability baseline)", () => {
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
    const v0StaffModule = bootstrapV0StaffManagementModule(pool);
    const v0ShiftModule = bootstrapV0ShiftModule(pool);
    const v0PullSyncModule = bootstrapV0PullSyncModule(pool);

    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    app.use("/v0/auth", v0AuthModule.router);
    app.use("/v0/hr", v0StaffModule.router);
    app.use("/v0/hr", v0ShiftModule.router);
    app.use("/v0/sync", v0PullSyncModule.router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates, updates, cancels and queries shift schedule", async () => {
    const ownerPhone = uniquePhone();
    const staffPhone = uniquePhone();

    const setup = await setupShiftWriteContext({
      app,
      pool,
      ownerPhone,
      staffPhone,
      tenantName: `Shift Tenant ${Date.now()}`,
    });

    const { tenantId, branchId, membershipId, ownerTenantToken, ownerBranchToken } = setup;

    const createdPattern = await request(app)
      .post("/v0/hr/shifts/patterns")
      .set("Authorization", `Bearer ${ownerTenantToken}`)
      .set("Idempotency-Key", "shift-pattern-create-1")
      .send({
        membershipId,
        branchId,
        daysOfWeek: [1, 2, 3, 4, 5],
        plannedStartTime: "08:00",
        plannedEndTime: "17:00",
        effectiveFrom: "2026-03-01",
        effectiveTo: null,
        note: "weekday shift",
      });
    expect(createdPattern.status).toBe(201);
    const patternId = createdPattern.body.data.id as string;

    const replayedPattern = await request(app)
      .post("/v0/hr/shifts/patterns")
      .set("Authorization", `Bearer ${ownerTenantToken}`)
      .set("Idempotency-Key", "shift-pattern-create-1")
      .send({
        membershipId,
        branchId,
        daysOfWeek: [1, 2, 3, 4, 5],
        plannedStartTime: "08:00",
        plannedEndTime: "17:00",
        effectiveFrom: "2026-03-01",
        effectiveTo: null,
        note: "weekday shift",
      });
    expect(replayedPattern.status).toBe(201);
    expect(replayedPattern.headers["idempotency-replayed"]).toBe("true");

    const updatedPattern = await request(app)
      .patch(`/v0/hr/shifts/patterns/${patternId}`)
      .set("Authorization", `Bearer ${ownerTenantToken}`)
      .set("Idempotency-Key", "shift-pattern-update-1")
      .send({
        note: "weekday shift updated",
      });
    expect(updatedPattern.status).toBe(200);
    expect(updatedPattern.body.data.note).toBe("weekday shift updated");

    const createdInstance = await request(app)
      .post("/v0/hr/shifts/instances")
      .set("Authorization", `Bearer ${ownerTenantToken}`)
      .set("Idempotency-Key", "shift-instance-create-1")
      .send({
        membershipId,
        branchId,
        patternId,
        date: "2026-03-05",
        plannedStartTime: "10:00",
        plannedEndTime: "14:00",
        note: "special event",
      });
    expect(createdInstance.status).toBe(201);
    const instanceId = createdInstance.body.data.id as string;

    const updatedInstance = await request(app)
      .patch(`/v0/hr/shifts/instances/${instanceId}`)
      .set("Authorization", `Bearer ${ownerTenantToken}`)
      .set("Idempotency-Key", "shift-instance-update-1")
      .send({
        plannedStartTime: "11:00",
        plannedEndTime: "15:00",
      });
    expect(updatedInstance.status).toBe(200);
    expect(updatedInstance.body.data.status).toBe("UPDATED");

    const schedule = await request(app)
      .get("/v0/hr/shifts/schedule")
      .query({ branchId, from: "2026-03-01", to: "2026-03-10" })
      .set("Authorization", `Bearer ${ownerTenantToken}`);
    expect(schedule.status).toBe(200);
    expect(Array.isArray(schedule.body.data.patterns)).toBe(true);
    expect(Array.isArray(schedule.body.data.instances)).toBe(true);
    expect(
      schedule.body.data.patterns.some((row: { id: string }) => row.id === patternId)
    ).toBe(true);
    expect(
      schedule.body.data.instances.some((row: { id: string }) => row.id === instanceId)
    ).toBe(true);

    const instanceDetail = await request(app)
      .get(`/v0/hr/shifts/instances/${instanceId}`)
      .set("Authorization", `Bearer ${ownerTenantToken}`);
    expect(instanceDetail.status).toBe(200);
    expect(instanceDetail.body.data.id).toBe(instanceId);

    const cancelled = await request(app)
      .post(`/v0/hr/shifts/instances/${instanceId}/cancel`)
      .set("Authorization", `Bearer ${ownerTenantToken}`)
      .set("Idempotency-Key", "shift-instance-cancel-1")
      .send({ reason: "manager cancelled" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");

    const deactivatedPattern = await request(app)
      .post(`/v0/hr/shifts/patterns/${patternId}/deactivate`)
      .set("Authorization", `Bearer ${ownerTenantToken}`)
      .set("Idempotency-Key", "shift-pattern-deactivate-1")
      .send({});
    expect(deactivatedPattern.status).toBe(200);
    expect(deactivatedPattern.body.data.status).toBe("INACTIVE");

    const pull = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${ownerBranchToken}`)
      .send({ cursor: null, limit: 300, moduleScopes: ["shift"] });
    expect(pull.status).toBe(200);
    const changes = pull.body.data.changes as Array<{
      moduleKey: string;
      entityType: string;
      entityId: string;
    }>;
    expect(
      changes.some(
        (row) =>
          row.moduleKey === "shift" &&
          row.entityType === "shift_pattern" &&
          row.entityId === patternId
      )
    ).toBe(true);
    expect(
      changes.some(
        (row) =>
          row.moduleKey === "shift" &&
          row.entityType === "shift_instance" &&
          row.entityId === instanceId
      )
    ).toBe(true);

    const evaluationTriggers = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND event_type = 'HR_WORK_REVIEW_EVALUATION_REQUESTED'`,
      [tenantId]
    );
    expect(Number(evaluationTriggers.rows[0]?.count ?? "0")).toBeGreaterThanOrEqual(6);

    // keep fixture rows; phone values are unique per test run
  });

  it("denies cashier from shift write actions", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();

    const ownerToken = await registerAndLogin(app, ownerPhone);
    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantName: `Shift ACL Tenant ${Date.now()}` });
    const tenantId = createdTenant.body.data.tenant.id as string;
    const branchId = await createActiveBranch({
      pool,
      tenantId,
      branchName: "Shift ACL Branch",
    });

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

    const cashierTenantContext = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ tenantId });
    const cashierTenantToken = cashierTenantContext.body.data.accessToken as string;

    const denied = await request(app)
      .post("/v0/hr/shifts/patterns")
      .set("Authorization", `Bearer ${cashierTenantToken}`)
      .set("Idempotency-Key", "shift-cashier-denied-1")
      .send({
        membershipId,
        branchId,
        daysOfWeek: [1],
        plannedStartTime: "08:00",
        plannedEndTime: "09:00",
      });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("PERMISSION_DENIED");
  });

  it("persists rejected shift outcomes and replays them idempotently", async () => {
    const setup = await setupShiftWriteContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      staffPhone: uniquePhone(),
      tenantName: `Shift Reject Tenant ${Date.now()}`,
    });

    const idemKey = "shift-pattern-reject-1";
    const first = await request(app)
      .post("/v0/hr/shifts/patterns")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", idemKey)
      .send({
        membershipId: setup.membershipId,
        branchId: setup.branchId,
        daysOfWeek: [1, 2],
        plannedStartTime: "18:00",
        plannedEndTime: "08:00",
        note: "invalid time range",
      });
    expect(first.status).toBe(422);
    expect(first.body.code).toBe("SHIFT_TIME_RANGE_INVALID");

    const replay = await request(app)
      .post("/v0/hr/shifts/patterns")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", idemKey)
      .send({
        membershipId: setup.membershipId,
        branchId: setup.branchId,
        daysOfWeek: [1, 2],
        plannedStartTime: "18:00",
        plannedEndTime: "08:00",
        note: "invalid time range",
      });
    expect(replay.status).toBe(422);
    expect(replay.headers["idempotency-replayed"]).toBe("true");

    const rejectedAudits = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'hr.shift.pattern.create'
         AND outcome = 'REJECTED'`,
      [setup.tenantId]
    );
    expect(Number(rejectedAudits.rows[0]?.count ?? "0")).toBe(1);

    const rejectedOutbox = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND event_type = 'HR_SHIFT_COMMAND_REJECTED'`,
      [setup.tenantId]
    );
    expect(Number(rejectedOutbox.rows[0]?.count ?? "0")).toBe(1);
  });

  it("rolls back shift writes when outbox insert fails", async () => {
    const setup = await setupShiftWriteContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      staffPhone: uniquePhone(),
      tenantName: `Shift Atomic Tenant ${Date.now()}`,
    });

    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "hr.shift.pattern.create";
    try {
      const failed = await request(app)
        .post("/v0/hr/shifts/patterns")
        .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
        .set("Idempotency-Key", "shift-atomic-fail-1")
        .send({
          membershipId: setup.membershipId,
          branchId: setup.branchId,
          daysOfWeek: [1, 2, 3],
          plannedStartTime: "08:00",
          plannedEndTime: "17:00",
          note: "must rollback",
        });
      expect(failed.status).toBe(500);
      expect(failed.body.success).toBe(false);

      const patterns = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM v0_shift_patterns
         WHERE tenant_id = $1`,
        [setup.tenantId]
      );
      expect(Number(patterns.rows[0]?.count ?? "0")).toBe(0);

      const audits = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM v0_audit_events
         WHERE tenant_id = $1
           AND action_key = 'hr.shift.pattern.create'`,
        [setup.tenantId]
      );
      expect(Number(audits.rows[0]?.count ?? "0")).toBe(0);
    } finally {
      delete process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY;
    }
  });
});

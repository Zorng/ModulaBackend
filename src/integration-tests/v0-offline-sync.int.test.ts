import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import {
  assignActiveBranch,
  createActiveBranch,
  findActiveOwnerMembershipId,
  seedDefaultBranchEntitlements,
} from "../test-utils/org.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { bootstrapV0OrgAccountModule } from "../modules/v0/orgAccount/index.js";
import { bootstrapV0AttendanceModule } from "../modules/v0/hr/attendance/index.js";
import { bootstrapV0CashSessionModule } from "../modules/v0/posOperation/cashSession/index.js";
import { bootstrapV0OfflineSyncModule } from "../modules/v0/platformSystem/offlineSync/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000)}`;
}

async function registerAndLogin(app: express.Express, phone: string): Promise<string> {
  const registerRes = await request(app).post("/v0/auth/register").send({
    phone,
    password: "Test123!",
    firstName: "Offline",
    lastName: "User",
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

async function setupOwnerBranchContext(input: {
  app: express.Express;
  pool: Pool;
}): Promise<{
  branchToken: string;
  tenantId: string;
  branchId: string;
}> {
  const ownerPhone = uniquePhone();
  const ownerToken = await registerAndLogin(input.app, ownerPhone);

  const createdTenant = await request(input.app)
    .post("/v0/auth/tenants")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantName: `Offline Sync ${uniqueSuffix()}` });
  expect(createdTenant.status).toBe(201);
  const tenantId = createdTenant.body.data.tenant.id as string;

  const ownerAccount = await input.pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE phone = $1`,
    [ownerPhone]
  );
  const ownerAccountId = ownerAccount.rows[0]?.id;
  expect(ownerAccountId).toBeTruthy();

  const ownerMembershipId = await findActiveOwnerMembershipId({
    pool: input.pool,
    tenantId,
    accountId: ownerAccountId!,
  });

  const branchId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: `Offline Branch ${uniqueSuffix()}`,
  });

  await assignActiveBranch({
    pool: input.pool,
    tenantId,
    branchId,
    accountId: ownerAccountId!,
    membershipId: ownerMembershipId,
  });
  await seedDefaultBranchEntitlements({ pool: input.pool, tenantId, branchId });

  const tenantSelected = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantId });
  expect(tenantSelected.status).toBe(200);
  const tenantToken = tenantSelected.body.data.accessToken as string;

  const branchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${tenantToken}`)
    .send({ branchId });
  expect(branchSelected.status).toBe(200);
  const branchToken = branchSelected.body.data.accessToken as string;

  return { branchToken, tenantId, branchId };
}

describe("v0 offline sync integration", () => {
  let pool: Pool;
  let app: express.Express;

  beforeAll(() => {
    process.env.V0_AUTH_PROVIDER = "local";
    process.env.AUTH_FIXED_OTP = "123456";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";

    pool = createTestPool();
    app = express();
    app.use(express.json());
    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    app.use("/v0/auth", bootstrapV0AuthModule(pool).router);
    app.use("/v0/org", bootstrapV0OrgAccountModule(pool).router);
    app.use("/v0/attendance", bootstrapV0AttendanceModule(pool).router);
    app.use("/v0/cash", bootstrapV0CashSessionModule(pool).router);
    app.use("/v0/offline-sync", bootstrapV0OfflineSyncModule(pool).router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("replays exactly once with DUPLICATE on same clientOpId and PAYLOAD_CONFLICT on different payload", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const clientOpId = "10000000-0000-4000-8000-000000000010";
    const occurredAt = new Date().toISOString();

    const first = await request(app)
      .post("/v0/offline-sync/replay")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId,
            operationType: "cashSession.open",
            tenantId: setup.tenantId,
            branchId: setup.branchId,
            occurredAt,
            payload: {
              openingFloatUsd: 20,
              openingFloatKhr: 50000,
              note: "offline open",
            },
          },
        ],
      });
    expect(first.status).toBe(200);
    expect(first.body.data.results[0]).toMatchObject({
      status: "APPLIED",
      operationType: "cashSession.open",
      clientOpId,
    });

    const replay = await request(app)
      .post("/v0/offline-sync/replay")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId,
            operationType: "cashSession.open",
            tenantId: setup.tenantId,
            branchId: setup.branchId,
            occurredAt,
            payload: {
              openingFloatUsd: 20,
              openingFloatKhr: 50000,
              note: "offline open",
            },
          },
        ],
      });
    expect(replay.status).toBe(200);
    expect(replay.body.data.results[0]).toMatchObject({
      status: "DUPLICATE",
      operationType: "cashSession.open",
      clientOpId,
    });

    const conflict = await request(app)
      .post("/v0/offline-sync/replay")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId,
            operationType: "cashSession.open",
            tenantId: setup.tenantId,
            branchId: setup.branchId,
            occurredAt,
            payload: {
              openingFloatUsd: 99,
              openingFloatKhr: 0,
              note: "different payload",
            },
          },
        ],
      });
    expect(conflict.status).toBe(200);
    expect(conflict.body.data.results[0]).toMatchObject({
      status: "FAILED",
      code: "OFFLINE_SYNC_PAYLOAD_CONFLICT",
      operationType: "cashSession.open",
      clientOpId,
    });

    const sessionCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_cash_sessions
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(sessionCount.rows[0]?.count ?? "0")).toBe(1);
  });

  it("halts on first failure when haltOnFailure is true (default)", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const now = new Date().toISOString();

    const response = await request(app)
      .post("/v0/offline-sync/replay")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000020",
            operationType: "cashSession.close",
            tenantId: setup.tenantId,
            branchId: setup.branchId,
            occurredAt: now,
            payload: {
              sessionId: "10000000-0000-4000-8000-000000000099",
              countedCashUsd: 10,
              countedCashKhr: 0,
            },
          },
          {
            clientOpId: "10000000-0000-4000-8000-000000000021",
            operationType: "attendance.startWork",
            tenantId: setup.tenantId,
            branchId: setup.branchId,
            occurredAt: now,
            payload: { occurredAt: now },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.stoppedAt).toBe(0);
    expect(response.body.data.results).toHaveLength(1);
    expect(response.body.data.results[0]).toMatchObject({
      status: "FAILED",
      operationType: "cashSession.close",
      code: "CASH_SESSION_NOT_FOUND",
    });

    const attendanceCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_attendance_records
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(attendanceCount.rows[0]?.count ?? "0")).toBe(0);
  });
});


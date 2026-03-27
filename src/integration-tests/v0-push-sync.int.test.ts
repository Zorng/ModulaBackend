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
import { bootstrapV0PushSyncModule } from "../modules/v0/platformSystem/pushSync/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";
import { hashJsonPayload } from "../shared/utils/hash.js";

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

async function insertKhqrAttempt(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  saleId: string;
  md5: string;
  status: "WAITING_FOR_PAYMENT" | "PAID_CONFIRMED" | "PENDING_CONFIRMATION";
  lastVerificationStatus?: "CONFIRMED" | "UNPAID" | "MISMATCH" | null;
}): Promise<void> {
  const paidConfirmedAt = input.status === "PAID_CONFIRMED" ? new Date() : null;
  const lastVerificationAt = input.lastVerificationStatus ? new Date() : null;
  const paymentIntentStatus =
    input.status === "PAID_CONFIRMED"
      ? "PAID_CONFIRMED"
      : input.status === "PENDING_CONFIRMATION"
        ? "FAILED_PROOF"
        : "WAITING_FOR_PAYMENT";

  const intentResult = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_payment_intents (
       tenant_id,
       branch_id,
       sale_id,
       status,
       payment_method,
       tender_currency,
       tender_amount,
       expected_to_account_id,
       paid_confirmed_at
     )
     VALUES (
       $1,
       $2,
       $3::UUID,
       $4,
       'KHQR',
       'USD',
       2.50,
       'khqr-receiver',
       $5
     )
     RETURNING id`,
    [
      input.tenantId,
      input.branchId,
      input.saleId,
      paymentIntentStatus,
      paidConfirmedAt,
    ]
  );
  const paymentIntentId = intentResult.rows[0]?.id;
  if (!paymentIntentId) {
    throw new Error("failed to seed payment intent for khqr attempt");
  }

  await input.pool.query(
    `INSERT INTO v0_khqr_payment_attempts (
       tenant_id,
       branch_id,
       payment_intent_id,
       sale_id,
       md5,
       status,
       expected_amount,
       expected_currency,
       expected_to_account_id,
       paid_confirmed_at,
       last_verification_status,
       last_verification_reason_code,
       last_verification_at
     )
     VALUES (
       $1,
       $2,
       $3::UUID,
       $4::UUID,
       $5,
       $6,
       2.50,
       'USD',
       'khqr-receiver',
       $7,
       $8::VARCHAR(16),
       CASE WHEN $8::TEXT = 'MISMATCH' THEN 'KHQR_PROOF_MISMATCH' ELSE NULL END,
       $9::TIMESTAMPTZ
     )`,
    [
      input.tenantId,
      input.branchId,
      paymentIntentId,
      input.saleId,
      input.md5,
      input.status,
      paidConfirmedAt,
      input.lastVerificationStatus ?? null,
      lastVerificationAt,
    ]
  );
}

describe("v0 push sync integration", () => {
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
    const pushSyncModule = bootstrapV0PushSyncModule(pool);
    app.use("/v0/sync", pushSyncModule.router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("replays exactly once with DUPLICATE on same clientOpId and PAYLOAD_CONFLICT on different payload", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const clientOpId = "10000000-0000-4000-8000-000000000010";
    const occurredAt = new Date().toISOString();

    const first = await request(app)
      .post("/v0/sync/push")
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
      .post("/v0/sync/push")
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
      .post("/v0/sync/push")
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
      resolution: {
        category: "PERMANENT",
        action: "mark_permanent_failed",
      },
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

  it("accepts canonical push route (/v0/sync/push)", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const clientOpId = "10000000-0000-4000-8000-000000000011";
    const occurredAt = new Date().toISOString();

    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId,
            operationType: "cashSession.open",
            occurredAt,
            payload: {
              openingFloatUsd: 15,
              openingFloatKhr: 25000,
              note: "push alias open",
            },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0]).toMatchObject({
      status: "APPLIED",
      operationType: "cashSession.open",
      clientOpId,
    });
  });

  it("halts on first failure when haltOnFailure is true (default)", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const now = new Date().toISOString();

    const response = await request(app)
      .post("/v0/sync/push")
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
      resolution: {
        category: "MANUAL",
        action: "requires_user_intervention",
      },
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

  it("reclaims stale IN_PROGRESS operations by lease timeout and applies replay", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const clientOpId = "10000000-0000-4000-8000-000000000030";
    const occurredAt = new Date().toISOString();
    const payload = {
      openingFloatUsd: 40,
      openingFloatKhr: 100000,
      note: "recover stale in-progress op",
    };

    const seededBatch = await pool.query<{ id: string }>(
      `INSERT INTO v0_offline_sync_batches (tenant_id, branch_id, status)
       VALUES ($1, $2, 'IN_PROGRESS')
       RETURNING id`,
      [setup.tenantId, setup.branchId]
    );
    const seededBatchId = seededBatch.rows[0]?.id;
    expect(seededBatchId).toBeTruthy();

    await pool.query(
      `INSERT INTO v0_offline_sync_operations (
         batch_id,
         tenant_id,
         branch_id,
         client_op_id,
         operation_index,
         operation_type,
         occurred_at,
         payload,
         payload_hash,
         status,
         lease_expires_at
       )
       VALUES ($1, $2, $3, $4, 0, 'cashSession.open', $5, $6::JSONB, $7, 'IN_PROGRESS', NOW() - INTERVAL '1 minute')`,
      [
        seededBatchId,
        setup.tenantId,
        setup.branchId,
        clientOpId,
        occurredAt,
        JSON.stringify(payload),
        hashJsonPayload(payload),
      ]
    );

    const replay = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId,
            operationType: "cashSession.open",
            tenantId: setup.tenantId,
            branchId: setup.branchId,
            occurredAt,
            payload,
          },
        ],
      });

    expect(replay.status).toBe(200);
    expect(replay.body.data.results[0]).toMatchObject({
      status: "APPLIED",
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

  it("returns OFFLINE_SYNC_IN_PROGRESS when existing operation lease is still active", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const clientOpId = "10000000-0000-4000-8000-000000000040";
    const occurredAt = new Date().toISOString();
    const payload = {
      openingFloatUsd: 50,
      openingFloatKhr: 0,
      note: "active lease lock",
    };

    const seededBatch = await pool.query<{ id: string }>(
      `INSERT INTO v0_offline_sync_batches (tenant_id, branch_id, status)
       VALUES ($1, $2, 'IN_PROGRESS')
       RETURNING id`,
      [setup.tenantId, setup.branchId]
    );
    const seededBatchId = seededBatch.rows[0]?.id;
    expect(seededBatchId).toBeTruthy();

    await pool.query(
      `INSERT INTO v0_offline_sync_operations (
         batch_id,
         tenant_id,
         branch_id,
         client_op_id,
         operation_index,
         operation_type,
         occurred_at,
         payload,
         payload_hash,
         status,
         lease_expires_at
       )
       VALUES ($1, $2, $3, $4, 0, 'cashSession.open', $5, $6::JSONB, $7, 'IN_PROGRESS', NOW() + INTERVAL '5 minutes')`,
      [
        seededBatchId,
        setup.tenantId,
        setup.branchId,
        clientOpId,
        occurredAt,
        JSON.stringify(payload),
        hashJsonPayload(payload),
      ]
    );

    const replay = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId,
            operationType: "cashSession.open",
            tenantId: setup.tenantId,
            branchId: setup.branchId,
            occurredAt,
            payload,
          },
        ],
      });

    expect(replay.status).toBe(200);
    expect(replay.body.data.results[0]).toMatchObject({
      status: "FAILED",
      operationType: "cashSession.open",
      clientOpId,
      code: "OFFLINE_SYNC_IN_PROGRESS",
      resolution: {
        category: "RETRYABLE",
        action: "retry_with_backoff",
      },
    });
  });

  it("accepts canonical envelope without per-op tenant/branch and with optional dependsOn/deviceId", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const occurredAt = new Date().toISOString();

    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        deviceId: "tablet-front-counter-01",
        haltOnFailure: true,
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000041",
            operationType: "attendance.startWork",
            occurredAt,
            dependsOn: [],
            payload: { occurredAt },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.results[0]).toMatchObject({
      status: "APPLIED",
      operationType: "attendance.startWork",
      clientOpId: "10000000-0000-4000-8000-000000000041",
    });
  });

  it("applies dependent operation when dependsOn references a prior applied op in batch", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const occurredAt = new Date().toISOString();

    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000042",
            operationType: "attendance.startWork",
            occurredAt,
            payload: { occurredAt },
          },
          {
            clientOpId: "10000000-0000-4000-8000-000000000043",
            operationType: "attendance.endWork",
            occurredAt,
            dependsOn: ["10000000-0000-4000-8000-000000000042"],
            payload: { occurredAt },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.results).toHaveLength(2);
    expect(response.body.data.results[0]).toMatchObject({
      status: "APPLIED",
      operationType: "attendance.startWork",
      clientOpId: "10000000-0000-4000-8000-000000000042",
    });
    expect(response.body.data.results[1]).toMatchObject({
      status: "APPLIED",
      operationType: "attendance.endWork",
      clientOpId: "10000000-0000-4000-8000-000000000043",
    });
  });

  it("fails with OFFLINE_SYNC_DEPENDENCY_MISSING when dependsOn target is not applied", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const occurredAt = new Date().toISOString();

    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000044",
            operationType: "attendance.startWork",
            occurredAt,
            dependsOn: ["10000000-0000-4000-8000-000000000099"],
            payload: { occurredAt },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.stoppedAt).toBe(0);
    expect(response.body.data.results).toHaveLength(1);
    expect(response.body.data.results[0]).toMatchObject({
      status: "FAILED",
      operationType: "attendance.startWork",
      clientOpId: "10000000-0000-4000-8000-000000000044",
      code: "OFFLINE_SYNC_DEPENDENCY_MISSING",
      resolution: {
        category: "MANUAL",
        action: "requires_user_intervention",
      },
    });
  });

  it("rejects payload when dependsOn references a later operation in same batch", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const occurredAt = new Date().toISOString();

    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000045",
            operationType: "attendance.endWork",
            occurredAt,
            dependsOn: ["10000000-0000-4000-8000-000000000046"],
            payload: { occurredAt },
          },
          {
            clientOpId: "10000000-0000-4000-8000-000000000046",
            operationType: "attendance.startWork",
            occurredAt,
            payload: { occurredAt },
          },
        ],
      });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("OFFLINE_SYNC_PAYLOAD_INVALID");
  });

  it("marks unsupported operation as PERMANENT in resolution hint", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const occurredAt = new Date().toISOString();

    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000047",
            operationType: "sale.finalize",
            occurredAt,
            payload: {},
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0]).toMatchObject({
      status: "FAILED",
      code: "OFFLINE_SYNC_OPERATION_NOT_SUPPORTED",
      resolution: {
        category: "PERMANENT",
        action: "mark_permanent_failed",
      },
    });
  });

  it("rejects KHQR sale.finalize when payment confirmation is missing", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const occurredAt = new Date().toISOString();

    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000049",
            operationType: "sale.finalize",
            occurredAt,
            payload: {
              saleId: "10000000-0000-4000-8000-000000000901",
              paymentMethod: "KHQR",
              md5: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0]).toMatchObject({
      status: "FAILED",
      code: "SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED",
      resolution: {
        category: "MANUAL",
        action: "requires_user_intervention",
      },
    });
  });

  it("rejects KHQR sale.finalize when proof is mismatched", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const occurredAt = new Date().toISOString();
    const saleId = "10000000-0000-4000-8000-000000000902";
    const md5 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    await insertKhqrAttempt({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      saleId,
      md5,
      status: "PENDING_CONFIRMATION",
      lastVerificationStatus: "MISMATCH",
    });

    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000050",
            operationType: "sale.finalize",
            occurredAt,
            payload: {
              saleId,
              paymentMethod: "KHQR",
              md5,
            },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0]).toMatchObject({
      status: "FAILED",
      code: "SALE_FINALIZE_KHQR_PROOF_MISMATCH",
      resolution: {
        category: "MANUAL",
        action: "requires_user_intervention",
      },
    });
  });

  it("passes KHQR confirmation gate before unsupported sale.finalize fallback", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const occurredAt = new Date().toISOString();
    const saleId = "10000000-0000-4000-8000-000000000903";
    const md5 = "cccccccccccccccccccccccccccccccc";

    await insertKhqrAttempt({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      saleId,
      md5,
      status: "PAID_CONFIRMED",
      lastVerificationStatus: "CONFIRMED",
    });

    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000051",
            operationType: "sale.finalize",
            occurredAt,
            payload: {
              saleId,
              paymentMethod: "KHQR",
              md5,
            },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0]).toMatchObject({
      status: "FAILED",
      code: "OFFLINE_SYNC_OPERATION_NOT_SUPPORTED",
      resolution: {
        category: "PERMANENT",
        action: "mark_permanent_failed",
      },
    });
  });

  it("replays offline checkout.cash.finalize exactly once and emits sale-order pull changes", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const openOccurredAt = "2026-03-19T09:00:00.000Z";
    const checkoutOccurredAt = "2026-03-19T09:05:00.000Z";
    const clientOpId = "10000000-0000-4000-8000-000000000052";
    const orderId = "10000000-0000-4000-8000-000000000911";
    const saleId = "10000000-0000-4000-8000-000000000912";

    const openResponse = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000053",
            operationType: "cashSession.open",
            occurredAt: openOccurredAt,
            payload: {
              openingFloatUsd: 25,
              openingFloatKhr: 0,
              note: "offline sale open",
            },
          },
        ],
      });
    expect(openResponse.status).toBe(200);
    expect(openResponse.body.data.results[0]).toMatchObject({
      status: "APPLIED",
      operationType: "cashSession.open",
    });

    const payload = {
      orderId,
      saleId,
      paymentMethod: "CASH",
      saleType: "TAKEAWAY",
      tenderCurrency: "USD",
      cashReceivedTenderAmount: 10,
      subtotalUsd: 7,
      subtotalKhr: 28700,
      discountUsd: 0,
      discountKhr: 0,
      vatUsd: 0,
      vatKhr: 0,
      grandTotalUsd: 7,
      grandTotalKhr: 28700,
      saleFxRateKhrPerUsd: 4100,
      saleKhrRoundingEnabled: true,
      saleKhrRoundingMode: "NEAREST",
      saleKhrRoundingGranularity: 100,
      items: [
        {
          menuItemId: "10000000-0000-4000-8000-000000000913",
          menuItemNameSnapshot: "Offline Latte",
          unitPrice: 3.5,
          quantity: 2,
          modifierSnapshot: [],
          note: "Less ice",
        },
      ],
    };

    const first = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId,
            operationType: "checkout.cash.finalize",
            occurredAt: checkoutOccurredAt,
            payload,
          },
        ],
      });
    expect(first.status).toBe(200);
    expect(first.body.data.results[0]).toMatchObject({
      status: "APPLIED",
      operationType: "checkout.cash.finalize",
      clientOpId,
      resultRefId: saleId,
    });

    const saleRows = await pool.query<{
      id: string;
      status: string;
      order_ticket_id: string | null;
      created_at: Date;
      finalized_at: Date | null;
    }>(
      `SELECT id, status, order_ticket_id, created_at, finalized_at
       FROM v0_sales
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3`,
      [setup.tenantId, setup.branchId, saleId]
    );
    expect(saleRows.rows).toHaveLength(1);
    expect(saleRows.rows[0]).toMatchObject({
      id: saleId,
      status: "FINALIZED",
      order_ticket_id: orderId,
    });
    expect(saleRows.rows[0].created_at.toISOString()).toBe(checkoutOccurredAt);
    expect(saleRows.rows[0].finalized_at?.toISOString()).toBe(checkoutOccurredAt);

    const orderRows = await pool.query<{
      id: string;
      status: string;
      source_mode: string;
      created_at: Date;
      checked_out_at: Date | null;
    }>(
      `SELECT id, status, source_mode, created_at, checked_out_at
       FROM v0_order_tickets
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3`,
      [setup.tenantId, setup.branchId, orderId]
    );
    expect(orderRows.rows).toHaveLength(1);
    expect(orderRows.rows[0]).toMatchObject({
      id: orderId,
      status: "CHECKED_OUT",
      source_mode: "DIRECT_CHECKOUT",
    });
    expect(orderRows.rows[0].created_at.toISOString()).toBe(checkoutOccurredAt);
    expect(orderRows.rows[0].checked_out_at?.toISOString()).toBe(checkoutOccurredAt);

    const batchRows = await pool.query<{ status: string; created_at: Date }>(
      `SELECT status, created_at
       FROM v0_order_fulfillment_batches
       WHERE tenant_id = $1
         AND branch_id = $2
         AND order_ticket_id = $3`,
      [setup.tenantId, setup.branchId, orderId]
    );
    expect(batchRows.rows).toHaveLength(1);
    expect(batchRows.rows[0].status).toBe("PENDING");
    expect(batchRows.rows[0].created_at.toISOString()).toBe(checkoutOccurredAt);

    const syncChanges = await pool.query<{ entity_type: string; entity_id: string }>(
      `SELECT entity_type, entity_id
       FROM v0_sync_changes
       WHERE tenant_id = $1
         AND branch_id = $2
         AND module_key = 'saleOrder'`,
      [setup.tenantId, setup.branchId]
    );
    expect(syncChanges.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity_type: "sale", entity_id: saleId }),
        expect.objectContaining({ entity_type: "order_ticket", entity_id: orderId }),
        expect.objectContaining({ entity_type: "order_fulfillment_batch" }),
      ])
    );

    const replay = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId,
            operationType: "checkout.cash.finalize",
            occurredAt: checkoutOccurredAt,
            payload,
          },
        ],
      });
    expect(replay.status).toBe(200);
    expect(replay.body.data.results[0]).toMatchObject({
      status: "DUPLICATE",
      operationType: "checkout.cash.finalize",
      clientOpId,
      resultRefId: saleId,
    });

    const conflict = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId,
            operationType: "checkout.cash.finalize",
            occurredAt: checkoutOccurredAt,
            payload: {
              ...payload,
              cashReceivedTenderAmount: 20,
            },
          },
        ],
      });
    expect(conflict.status).toBe(200);
    expect(conflict.body.data.results[0]).toMatchObject({
      status: "FAILED",
      code: "OFFLINE_SYNC_PAYLOAD_CONFLICT",
      operationType: "checkout.cash.finalize",
      clientOpId,
    });
  });

  it("rejects offline manual external-payment-claim capture as unsupported final scope", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000055",
            operationType: "order.manualExternalPaymentClaim.capture",
            occurredAt: "2026-03-19T09:12:00.000Z",
            payload: {
              orderId: "10000000-0000-4000-8000-000000000931",
              items: [
                {
                  menuItemId: "10000000-0000-4000-8000-000000000932",
                  menuItemNameSnapshot: "Offline Claim Latte",
                  unitPrice: 3.5,
                  quantity: 2,
                  modifierSnapshot: [],
                  note: "Customer paid via static QR during outage",
                },
              ],
            },
          },
        ],
      });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      success: false,
      code: "OFFLINE_SYNC_OPERATION_NOT_SUPPORTED",
    });
  });

  it("rejects offline checkout.cash.finalize when no cash session is open at replay time", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const occurredAt = "2026-03-19T10:00:00.000Z";

    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000054",
            operationType: "checkout.cash.finalize",
            occurredAt,
            payload: {
              orderId: "10000000-0000-4000-8000-000000000921",
              saleId: "10000000-0000-4000-8000-000000000922",
              paymentMethod: "CASH",
              saleType: "DINE_IN",
              tenderCurrency: "USD",
              cashReceivedTenderAmount: 5,
              subtotalUsd: 3.5,
              subtotalKhr: 14350,
              discountUsd: 0,
              discountKhr: 0,
              vatUsd: 0,
              vatKhr: 0,
              grandTotalUsd: 3.5,
              grandTotalKhr: 14350,
              saleFxRateKhrPerUsd: 4100,
              saleKhrRoundingEnabled: true,
              saleKhrRoundingMode: "NEAREST",
              saleKhrRoundingGranularity: 100,
              items: [
                {
                  menuItemId: "10000000-0000-4000-8000-000000000923",
                  menuItemNameSnapshot: "Offline Mocha",
                  unitPrice: 3.5,
                  quantity: 1,
                  modifierSnapshot: [],
                  note: null,
                },
              ],
            },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0]).toMatchObject({
      status: "FAILED",
      code: "SALE_CHECKOUT_REQUIRES_OPEN_CASH_SESSION",
      resolution: {
        category: "MANUAL",
        action: "requires_user_intervention",
      },
    });
  });

  it("rejects offline manual external-payment-claim capture before replay execution", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000057",
            operationType: "order.manualExternalPaymentClaim.capture",
            occurredAt: "2026-03-19T10:10:00.000Z",
            payload: {
              orderId: "10000000-0000-4000-8000-000000000941",
              items: [
                {
                  menuItemId: "10000000-0000-4000-8000-000000000942",
                  menuItemNameSnapshot: "Offline Claim Mocha",
                  unitPrice: 3.5,
                  quantity: 1,
                  modifierSnapshot: [],
                  note: null,
                },
              ],
            },
          },
        ],
      });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      success: false,
      code: "OFFLINE_SYNC_OPERATION_NOT_SUPPORTED",
    });
  });

  it("marks attendance invariant denial as MANUAL in resolution hint", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const occurredAt = new Date().toISOString();

    const response = await request(app)
      .post("/v0/sync/push")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        operations: [
          {
            clientOpId: "10000000-0000-4000-8000-000000000048",
            operationType: "attendance.endWork",
            occurredAt,
            payload: { occurredAt },
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0]).toMatchObject({
      status: "FAILED",
      code: "ATTENDANCE_NO_ACTIVE_CHECKIN",
      resolution: {
        category: "MANUAL",
        action: "requires_user_intervention",
      },
    });
  });
});

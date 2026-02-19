import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
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
import { bootstrapV0CashSessionModule } from "../modules/v0/posOperation/cashSession/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";
import { eventBus } from "../platform/events/index.js";
import { startV0CommandOutboxDispatcher } from "../platform/outbox/dispatcher.js";

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
    firstName: "Cash",
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
  ownerPhone: string;
  tenantName: string;
}): Promise<{
  ownerToken: string;
  ownerBranchToken: string;
  ownerAccountId: string;
  tenantId: string;
  branchId: string;
}> {
  const ownerToken = await registerAndLogin(input.app, input.ownerPhone);
  const createdTenant = await request(input.app)
    .post("/v0/auth/tenants")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantName: input.tenantName });
  expect(createdTenant.status).toBe(201);
  const tenantId = createdTenant.body.data.tenant.id as string;

  const ownerAccount = await input.pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE phone = $1`,
    [input.ownerPhone]
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
    branchName: `Cash Branch ${uniqueSuffix()}`,
  });
  await assignActiveBranch({
    pool: input.pool,
    tenantId,
    branchId,
    accountId: ownerAccountId!,
    membershipId: ownerMembershipId,
  });
  await seedDefaultBranchEntitlements({
    pool: input.pool,
    tenantId,
    branchId,
  });

  const tenantSelected = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantId });
  expect(tenantSelected.status).toBe(200);
  const ownerTenantToken = tenantSelected.body.data.accessToken as string;

  const branchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${ownerTenantToken}`)
    .send({ branchId });
  expect(branchSelected.status).toBe(200);
  const ownerBranchToken = branchSelected.body.data.accessToken as string;

  return {
    ownerToken,
    ownerBranchToken,
    ownerAccountId: ownerAccountId!,
    tenantId,
    branchId,
  };
}

describe("v0 cash session integration", () => {
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
    app.use("/v0/org", bootstrapV0OrgAccountModule(pool).router);
    app.use("/v0/cash", bootstrapV0CashSessionModule(pool).router);
  });

  afterEach(() => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
  });

  afterAll(async () => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
    await pool.end();
  });

  it("keeps open-session command idempotent (replay+conflict) with single audit/outbox write", async () => {
    const setup = await setupOwnerBranchContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Cash Replay ${uniqueSuffix()}`,
    });

    const payload = {
      openingFloatUsd: 20,
      openingFloatKhr: 50000,
      note: "Morning shift",
    };
    const idemKey = `cash-open-${uniqueSuffix()}`;

    const first = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", idemKey)
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      status: "OPEN",
      openingFloatUsd: 20,
      openingFloatKhr: 50000,
    });

    const replay = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", idemKey)
      .send(payload);
    expect(replay.status).toBe(200);
    expect(replay.headers["idempotency-replayed"]).toBe("true");

    const conflict = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", idemKey)
      .send({
        openingFloatUsd: 5,
        openingFloatKhr: 0,
        note: "Different payload",
      });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    const sessionCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_cash_sessions
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(sessionCount.rows[0]?.count ?? "0")).toBe(1);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'cashSession.open'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(1);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'cashSession.open'
         AND event_type = 'CASH_SESSION_OPENED'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(1);
  });

  it("rolls back cashSession.open when outbox insert fails", async () => {
    const setup = await setupOwnerBranchContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Cash Rollback ${uniqueSuffix()}`,
    });

    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "cashSession.open";

    const failed = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `cash-open-fail-${uniqueSuffix()}`)
      .send({
        openingFloatUsd: 10,
        openingFloatKhr: 10000,
        note: "Should rollback",
      });
    expect(failed.status).toBe(500);
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";

    const sessionCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_cash_sessions
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(sessionCount.rows[0]?.count ?? "0")).toBe(0);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'cashSession.open'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(0);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'cashSession.open'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(0);
  });

  it("keeps paid-in movement idempotent with single ledger append", async () => {
    const setup = await setupOwnerBranchContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Cash Movement Replay ${uniqueSuffix()}`,
    });

    const opened = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `cash-open-${uniqueSuffix()}`)
      .send({
        openingFloatUsd: 0,
        openingFloatKhr: 0,
      });
    expect(opened.status).toBe(200);
    const sessionId = opened.body.data.id as string;

    const payload = { amountUsd: 5, amountKhr: 0, reason: "Float top-up" };
    const idemKey = `cash-paidin-${uniqueSuffix()}`;
    const first = await request(app)
      .post(`/v0/cash/sessions/${sessionId}/movements/paid-in`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", idemKey)
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      sessionId,
      movementType: "MANUAL_IN",
      amountUsdDelta: 5,
      amountKhrDelta: 0,
    });

    const replay = await request(app)
      .post(`/v0/cash/sessions/${sessionId}/movements/paid-in`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", idemKey)
      .send(payload);
    expect(replay.status).toBe(200);
    expect(replay.headers["idempotency-replayed"]).toBe("true");

    const conflict = await request(app)
      .post(`/v0/cash/sessions/${sessionId}/movements/paid-in`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", idemKey)
      .send({ amountUsd: 7, amountKhr: 0, reason: "Different payload" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    const movementCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_cash_movements
       WHERE tenant_id = $1
         AND cash_session_id = $2
         AND movement_type = 'MANUAL_IN'`,
      [setup.tenantId, sessionId]
    );
    expect(Number(movementCount.rows[0]?.count ?? "0")).toBe(1);
  });

  it("publishes CASH_SESSION_OPENED via outbox dispatcher", async () => {
    const setup = await setupOwnerBranchContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Cash Outbox Publish ${uniqueSuffix()}`,
    });

    const open = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `cash-open-dispatch-${uniqueSuffix()}`)
      .send({
        openingFloatUsd: 12,
        openingFloatKhr: 25000,
      });
    expect(open.status).toBe(200);
    const sessionId = open.body.data.id as string;

    const outboxRow = await pool.query<{ id: string }>(
      `SELECT id
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'cashSession.open'
         AND event_type = 'CASH_SESSION_OPENED'
         AND entity_id = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [setup.tenantId, setup.branchId, sessionId]
    );
    const outboxId = outboxRow.rows[0]?.id;
    expect(outboxId).toBeTruthy();

    const published = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("cash session outbox event was not dispatched in time"));
      }, 4000);

      eventBus.subscribe("CASH_SESSION_OPENED", async (event: any) => {
        if (event?.outboxId === outboxId) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const dispatcher = startV0CommandOutboxDispatcher({
      db: pool,
      pollIntervalMs: 50,
      batchSize: 25,
    });

    try {
      await published;

      const publishedRow = await pool.query<{ published_at: Date | null }>(
        `SELECT published_at
         FROM v0_command_outbox
         WHERE id = $1`,
        [outboxId]
      );
      expect(publishedRow.rows[0]?.published_at).not.toBeNull();
    } finally {
      dispatcher.stop();
    }
  });
});

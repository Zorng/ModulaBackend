import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
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
  expect([201, 409]).toContain(registerRes.status);

  if (registerRes.status === 201) {
    await request(app).post("/v0/auth/otp/send").send({ phone });
    await request(app).post("/v0/auth/otp/verify").send({ phone, otp: "123456" });
  }

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

async function inviteAndAcceptBranchUser(input: {
  app: express.Express;
  pool: Pool;
  ownerToken: string;
  tenantId: string;
  branchId: string;
  roleKey: "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "CLERK";
  phone: string;
}): Promise<{
  accountId: string;
  membershipId: string;
  tenantToken: string;
  branchToken: string;
}> {
  await registerAndLogin(input.app, input.phone);
  const invited = await request(input.app)
    .post("/v0/auth/memberships/invite")
    .set("Authorization", `Bearer ${input.ownerToken}`)
    .send({
      tenantId: input.tenantId,
      phone: input.phone,
      roleKey: input.roleKey,
    });
  expect(invited.status).toBe(201);
  const membershipId = invited.body.data.membershipId as string;

  const assigned = await request(input.app)
    .post(`/v0/auth/memberships/${membershipId}/branches`)
    .set("Authorization", `Bearer ${input.ownerToken}`)
    .send({ branchIds: [input.branchId] });
  expect(assigned.status).toBe(200);

  const accessToken = await registerAndLogin(input.app, input.phone);
  const accepted = await request(input.app)
    .post(`/v0/auth/memberships/invitations/${membershipId}/accept`)
    .set("Authorization", `Bearer ${accessToken}`)
    .send({});
  expect(accepted.status).toBe(200);

  const tenantSelected = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ tenantId: input.tenantId });
  expect(tenantSelected.status).toBe(200);
  const tenantToken = tenantSelected.body.data.accessToken as string;

  const branchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${tenantToken}`)
    .send({ branchId: input.branchId });
  expect(branchSelected.status).toBe(200);
  const branchToken = branchSelected.body.data.accessToken as string;

  const accountQuery = await input.pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE phone = $1`,
    [input.phone]
  );
  const accountId = accountQuery.rows[0]?.id;
  expect(accountId).toBeTruthy();

  return {
    accountId: accountId!,
    membershipId,
    tenantToken,
    branchToken,
  };
}

async function insertSessionSale(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  finalizedByAccountId: string;
  status: "FINALIZED" | "VOID_PENDING" | "VOIDED";
  paymentMethod: "CASH" | "KHQR";
  saleType: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  grandTotalUsd: number;
  grandTotalKhr: number;
  finalizedAt: Date;
  voidedAt?: Date | null;
}): Promise<string> {
  const result = await input.pool.query<{ id: string }>(
     `INSERT INTO v0_sales (
       tenant_id,
       branch_id,
       status,
       payment_method,
       tender_currency,
       tender_amount,
       cash_received_tender_amount,
       cash_change_tender_amount,
       khqr_confirmed_at,
       subtotal_usd,
       subtotal_khr,
       discount_usd,
       discount_khr,
       vat_usd,
       vat_khr,
       grand_total_usd,
       grand_total_khr,
       sale_fx_rate_khr_per_usd,
       sale_khr_rounding_enabled,
       sale_khr_rounding_mode,
       sale_khr_rounding_granularity,
       subtotal_amount,
       discount_amount,
       vat_amount,
       total_amount,
       paid_amount,
       finalized_at,
       finalized_by_account_id,
       voided_at,
       voided_by_account_id,
       void_reason,
       sale_type
     )
     VALUES (
       $1, $2, $3, $4::VARCHAR(20),
       'USD',
       $5::NUMERIC(14,2),
       CASE WHEN $4::VARCHAR(20) = 'CASH' THEN $5::NUMERIC(14,2) ELSE NULL END,
       0,
       CASE
         WHEN $4::VARCHAR(20) = 'KHQR'
           AND $3::VARCHAR(20) IN ('FINALIZED', 'VOID_PENDING', 'VOIDED')
         THEN $7::TIMESTAMPTZ
         ELSE NULL
       END,
       $5::NUMERIC(14,2),
       $6::NUMERIC(14,2),
       0, 0, 0, 0,
       $5::NUMERIC(14,2),
       $6::NUMERIC(14,2),
       4100,
       TRUE,
       'NEAREST',
       100,
       $5::NUMERIC(14,2),
       0,
       0,
       $5::NUMERIC(14,2),
       $5::NUMERIC(14,2),
       $7,
       $8::UUID,
       $9::TIMESTAMPTZ,
       CASE WHEN $9::TIMESTAMPTZ IS NULL THEN NULL ELSE $8::UUID END,
       CASE WHEN $9 IS NULL THEN NULL ELSE 'voided in integration test' END,
       $10::VARCHAR(20)
     )
     RETURNING id`,
    [
      input.tenantId,
      input.branchId,
      input.status,
      input.paymentMethod,
      input.grandTotalUsd,
      input.grandTotalKhr,
      input.finalizedAt,
      input.finalizedByAccountId,
      input.voidedAt ?? null,
      input.saleType,
    ]
  );
  return result.rows[0].id;
}

async function insertSessionSaleLine(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  saleId: string;
  quantity: number;
  unitPrice: number;
  lineTotalAmount: number;
}): Promise<void> {
  await input.pool.query(
    `INSERT INTO v0_sale_lines (
       tenant_id,
       branch_id,
       sale_id,
       order_ticket_line_id,
       menu_item_id,
       menu_item_name_snapshot,
       unit_price,
       quantity,
       line_discount_amount,
       line_total_amount,
       modifier_snapshot
     )
     VALUES (
       $1, $2, $3, NULL, $4, $5,
       $6::NUMERIC(14,2),
       $7::NUMERIC(12,3),
       0,
       $8::NUMERIC(14,2),
       '[]'::JSONB
     )`,
    [
      input.tenantId,
      input.branchId,
      input.saleId,
      randomUUID(),
      `Session Sale ${uniqueSuffix()}`,
      input.unitPrice,
      input.quantity,
      input.lineTotalAmount,
    ]
  );
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

  it("returns null active session when branch has no open cash session", async () => {
    const setup = await setupOwnerBranchContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Cash Active Empty ${uniqueSuffix()}`,
    });

    const response = await request(app)
      .get("/v0/cash/sessions/active")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        session: null,
      },
    });
  });

  it(
    "returns the same open branch session to another cashier in the same branch",
    async () => {
      const setup = await setupOwnerBranchContext({
        app,
        pool,
      ownerPhone: uniquePhone(),
      tenantName: `Cash Occupancy ${uniqueSuffix()}`,
    });

    const cashierA = await inviteAndAcceptBranchUser({
      app,
      pool,
      ownerToken: setup.ownerToken,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "CASHIER",
      phone: uniquePhone(),
    });
    const cashierB = await inviteAndAcceptBranchUser({
      app,
      pool,
      ownerToken: setup.ownerToken,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "CASHIER",
      phone: uniquePhone(),
    });

    const opened = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${cashierA.branchToken}`)
      .set("Idempotency-Key", `cash-open-occupancy-${uniqueSuffix()}`)
      .send({
        openingFloatUsd: 20,
        openingFloatKhr: 50000,
        note: "Morning shift",
      });
    expect(opened.status).toBe(200);
    const sessionId = opened.body.data.id as string;

    const activeForCashierB = await request(app)
      .get("/v0/cash/sessions/active")
      .set("Authorization", `Bearer ${cashierB.branchToken}`);

    expect(activeForCashierB.status).toBe(200);
    expect(activeForCashierB.body).toMatchObject({
      success: true,
      data: {
        session: {
          id: sessionId,
          branchId: setup.branchId,
          tenantId: setup.tenantId,
          openedByAccountId: cashierA.accountId,
          openedByName: "Cash User",
          closedByName: null,
          status: "OPEN",
        },
      },
    });
    },
    15000
  );

  it("lists session-bound sale rows and enforces cashier self-scope", async () => {
    const setup = await setupOwnerBranchContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Cash Session Sales ${uniqueSuffix()}`,
    });

    const cashierA = await inviteAndAcceptBranchUser({
      app,
      pool,
      ownerToken: setup.ownerToken,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "CASHIER",
      phone: uniquePhone(),
    });
    const cashierB = await inviteAndAcceptBranchUser({
      app,
      pool,
      ownerToken: setup.ownerToken,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "CASHIER",
      phone: uniquePhone(),
    });

    const opened = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${cashierA.branchToken}`)
      .set("Idempotency-Key", `cash-open-sales-${uniqueSuffix()}`)
      .send({
        openingFloatUsd: 15,
        openingFloatKhr: 20000,
        note: "Session sales test",
      });
    expect(opened.status).toBe(200);
    const sessionId = opened.body.data.id as string;

    const finalizedAt = new Date();
    const saleId = await insertSessionSale({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      finalizedByAccountId: cashierA.accountId,
      status: "FINALIZED",
      paymentMethod: "CASH",
      saleType: "TAKEAWAY",
      grandTotalUsd: 7.5,
      grandTotalKhr: 30750,
      finalizedAt,
    });
    await insertSessionSaleLine({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      saleId,
      quantity: 2,
      unitPrice: 2.5,
      lineTotalAmount: 5,
    });
    await insertSessionSaleLine({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      saleId,
      quantity: 1,
      unitPrice: 2.5,
      lineTotalAmount: 2.5,
    });
    const saleId2 = await insertSessionSale({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      finalizedByAccountId: cashierA.accountId,
      status: "FINALIZED",
      paymentMethod: "KHQR",
      saleType: "DINE_IN",
      grandTotalUsd: 4,
      grandTotalKhr: 16400,
      finalizedAt: new Date(finalizedAt.getTime() + 1_000),
    });
    await insertSessionSaleLine({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      saleId: saleId2,
      quantity: 1,
      unitPrice: 4,
      lineTotalAmount: 4,
    });

    const ownerRead = await request(app)
      .get(`/v0/cash/sessions/${sessionId}/sales?limit=1&offset=0`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body).toMatchObject({
      success: true,
      data: {
        sessionId,
        limit: 1,
        offset: 0,
        total: 2,
        hasMore: true,
        items: [
          {
            saleId: saleId2,
            status: "FINALIZED",
            paymentMethod: "KHQR",
            saleType: "DINE_IN",
            totalItems: 1,
            grandTotalUsd: 4,
            grandTotalKhr: 16400,
            cashierAccountId: cashierA.accountId,
            cashierName: "Cash User",
            voidedAt: null,
          },
        ],
      },
    });
    expect(ownerRead.body.data.items[0].finalizedAt).toBeTruthy();

    const cashierOwnRead = await request(app)
      .get(`/v0/cash/sessions/${sessionId}/sales`)
      .set("Authorization", `Bearer ${cashierA.branchToken}`);
    expect(cashierOwnRead.status).toBe(200);
    expect(cashierOwnRead.body.data.total).toBe(2);
    expect(cashierOwnRead.body.data.hasMore).toBe(false);
    expect(cashierOwnRead.body.data.items).toHaveLength(2);
    expect(cashierOwnRead.body.data.items[0]).toMatchObject({
      saleId: saleId2,
      cashierAccountId: cashierA.accountId,
    });
    expect(cashierOwnRead.body.data.items[1]).toMatchObject({
      saleId,
      cashierAccountId: cashierA.accountId,
    });

    const cashierOtherRead = await request(app)
      .get(`/v0/cash/sessions/${sessionId}/sales`)
      .set("Authorization", `Bearer ${cashierB.branchToken}`);
    expect(cashierOtherRead.status).toBe(403);
    expect(cashierOtherRead.body).toMatchObject({
      success: false,
      code: "CASH_SESSION_FORBIDDEN_SELF_SCOPE",
    });
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

  it("allows another cashier in the same branch to record paid-in and view movements, but not adjustment", async () => {
    const setup = await setupOwnerBranchContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Cash Movement Branch Scope ${uniqueSuffix()}`,
    });

    const cashierA = await inviteAndAcceptBranchUser({
      app,
      pool,
      ownerToken: setup.ownerToken,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "CASHIER",
      phone: uniquePhone(),
    });
    const cashierB = await inviteAndAcceptBranchUser({
      app,
      pool,
      ownerToken: setup.ownerToken,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "CASHIER",
      phone: uniquePhone(),
    });

    const opened = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${cashierA.branchToken}`)
      .set("Idempotency-Key", `cash-open-branch-scope-${uniqueSuffix()}`)
      .send({
        openingFloatUsd: 10,
        openingFloatKhr: 0,
        note: "Opened by cashier A",
      });
    expect(opened.status).toBe(200);
    const sessionId = opened.body.data.id as string;

    const paidInByCashierB = await request(app)
      .post(`/v0/cash/sessions/${sessionId}/movements/paid-in`)
      .set("Authorization", `Bearer ${cashierB.branchToken}`)
      .set("Idempotency-Key", `cash-paidin-branch-scope-${uniqueSuffix()}`)
      .send({
        amountUsd: 3,
        amountKhr: 0,
        reason: "Float top-up by cashier B",
      });
    expect(paidInByCashierB.status).toBe(200);
    expect(paidInByCashierB.body.data).toMatchObject({
      sessionId,
      movementType: "MANUAL_IN",
      amountUsdDelta: 3,
      recordedByAccountId: cashierB.accountId,
    });

    const movementListForCashierB = await request(app)
      .get(`/v0/cash/sessions/${sessionId}/movements`)
      .set("Authorization", `Bearer ${cashierB.branchToken}`);
    expect(movementListForCashierB.status).toBe(200);
    expect(movementListForCashierB.body.data.items).toHaveLength(1);
    expect(movementListForCashierB.body.data.items[0]).toMatchObject({
      sessionId,
      movementType: "MANUAL_IN",
      recordedByAccountId: cashierB.accountId,
    });

    const adjustmentByCashierB = await request(app)
      .post(`/v0/cash/sessions/${sessionId}/movements/adjustment`)
      .set("Authorization", `Bearer ${cashierB.branchToken}`)
      .set("Idempotency-Key", `cash-adjustment-branch-scope-${uniqueSuffix()}`)
      .send({
        amountUsdDelta: 1,
        amountKhrDelta: 0,
        reason: "Should be denied",
      });
    expect(adjustmentByCashierB.status).toBe(403);
    expect(adjustmentByCashierB.body).toMatchObject({
      success: false,
      code: "PERMISSION_DENIED",
    });
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

      let publishedAt: Date | null = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const publishedRow = await pool.query<{ published_at: Date | null }>(
          `SELECT published_at
           FROM v0_command_outbox
           WHERE id = $1`,
          [outboxId]
        );
        publishedAt = publishedRow.rows[0]?.published_at ?? null;
        if (publishedAt) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(publishedAt).not.toBeNull();
    } finally {
      dispatcher.stop();
    }
  });
});

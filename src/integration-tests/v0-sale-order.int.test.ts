import { randomUUID } from "crypto";
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
import { bootstrapV0PullSyncModule } from "../modules/v0/platformSystem/pullSync/index.js";
import { bootstrapV0KhqrPaymentModule } from "../modules/v0/platformSystem/khqrPayment/index.js";
import { bootstrapV0CashSessionModule } from "../modules/v0/posOperation/cashSession/index.js";
import { bootstrapV0SaleOrderModule } from "../modules/v0/posOperation/saleOrder/index.js";
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
    firstName: "Sale",
    lastName: "Order",
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
  ownerBranchToken: string;
  tenantId: string;
  branchId: string;
  ownerAccountId: string;
  defaultMenuItemId: string;
  defaultMenuItemName: string;
}> {
  const ownerPhone = uniquePhone();
  const ownerToken = await registerAndLogin(input.app, ownerPhone);

  const createdTenant = await request(input.app)
    .post("/v0/auth/tenants")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantName: `SaleOrder Tenant ${uniqueSuffix()}` });
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
    branchName: `SaleOrder Branch ${uniqueSuffix()}`,
    khqrReceiverAccountId: "khqr-receiver",
    khqrReceiverName: "KHQR Receiver",
  });
  await assignActiveBranch({
    pool: input.pool,
    tenantId,
    branchId,
    accountId: ownerAccountId!,
    membershipId: ownerMembershipId,
  });
  await seedDefaultBranchEntitlements({ pool: input.pool, tenantId, branchId });
  const defaultMenuItemName = `Iced Latte ${uniqueSuffix()}`;
  const defaultMenuItemId = await seedMenuItem({
    pool: input.pool,
    tenantId,
    branchId,
    name: defaultMenuItemName,
    basePrice: 3.5,
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

  return {
    ownerBranchToken: branchSelected.body.data.accessToken as string,
    tenantId,
    branchId,
    ownerAccountId: ownerAccountId!,
    defaultMenuItemId,
    defaultMenuItemName,
  };
}

async function openCashSession(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  accountId: string;
}): Promise<string> {
  const inserted = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_cash_sessions (
       tenant_id,
       branch_id,
       opened_by_account_id,
       status,
       opening_float_usd,
       opening_float_khr
     )
     VALUES ($1, $2, $3, 'OPEN', 50, 0)
     ON CONFLICT (tenant_id, branch_id)
     WHERE status = 'OPEN'
     DO NOTHING
     RETURNING id`,
    [input.tenantId, input.branchId, input.accountId]
  );
  if (inserted.rows[0]?.id) {
    return inserted.rows[0].id;
  }
  const existing = await input.pool.query<{ id: string }>(
    `SELECT id
     FROM v0_cash_sessions
     WHERE tenant_id = $1
       AND branch_id = $2
       AND status = 'OPEN'
     LIMIT 1`,
    [input.tenantId, input.branchId]
  );
  const sessionId = existing.rows[0]?.id;
  if (!sessionId) {
    throw new Error("failed to open cash session for test setup");
  }
  return sessionId;
}

async function seedMenuItem(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  name: string;
  basePrice: number;
}): Promise<string> {
  const inserted = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_menu_items (tenant_id, name, base_price, status)
     VALUES ($1, $2, $3, 'ACTIVE')
     RETURNING id`,
    [input.tenantId, input.name, input.basePrice]
  );
  const menuItemId = inserted.rows[0]?.id;
  if (!menuItemId) {
    throw new Error("failed to seed menu item");
  }
  await input.pool.query(
    `INSERT INTO v0_menu_item_branch_visibility (tenant_id, menu_item_id, branch_id)
     VALUES ($1, $2, $3)`,
    [input.tenantId, menuItemId, input.branchId]
  );
  return menuItemId;
}

function buildOrderPayload(input: { menuItemId: string; quantity?: number }) {
  return {
    items: [
      {
        menuItemId: input.menuItemId,
        quantity: input.quantity ?? 1,
        modifierSelections: [],
        note: null,
      },
    ],
  };
}

describe("v0 sale-order integration", () => {
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
    app.use("/v0/payments/khqr", bootstrapV0KhqrPaymentModule(pool).router);
    app.use("/v0/sync", bootstrapV0PullSyncModule(pool).router);
    app.use("/v0", bootstrapV0SaleOrderModule(pool).router);
  });

  afterEach(() => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
  });

  afterAll(async () => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
    await pool.end();
  });

  it("rolls back order.place when outbox insert fails", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "order.place";

    const response = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-atomic-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));

    expect(response.status).toBe(500);

    const orderCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_order_tickets
       WHERE tenant_id = $1 AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(orderCount.rows[0]?.count ?? "0")).toBe(0);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'order.place'
         AND actor_account_id = $2`,
      [setup.tenantId, setup.ownerAccountId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(0);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'order.place'
         AND actor_id = $3`,
      [setup.tenantId, setup.branchId, setup.ownerAccountId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(0);
  });

  it("replays duplicate idempotent order.place and rejects payload conflicts", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });
    const idempotencyKey = `sale-order-idem-${uniqueSuffix()}`;
    const menuItemId = setup.defaultMenuItemId;

    const created = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(buildOrderPayload({ menuItemId, quantity: 1 }));
    expect(created.status).toBe(200);
    const orderId = created.body.data.id as string;
    expect(typeof orderId).toBe("string");

    const replayed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(buildOrderPayload({ menuItemId, quantity: 1 }));
    expect(replayed.status).toBe(200);
    expect(replayed.headers["idempotency-replayed"]).toBe("true");
    expect(replayed.body.data.id).toBe(orderId);

    const conflict = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(buildOrderPayload({ menuItemId, quantity: 2 }));
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    const orderCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_order_tickets
       WHERE tenant_id = $1 AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(orderCount.rows[0]?.count ?? "0")).toBe(1);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'order.place'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(1);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'order.place'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(1);
  });

  it("ignores client-provided price/name snapshots and uses server menu data", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const created = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-server-snapshot-${uniqueSuffix()}`)
      .send({
        items: [
          {
            menuItemId: setup.defaultMenuItemId,
            menuItemNameSnapshot: "Hacked Name",
            unitPrice: 0.01,
            quantity: 2,
            modifierSnapshot: [{ optionId: randomUUID(), priceDelta: -999 }],
            modifierSelections: [],
            note: "tampered payload",
          },
        ],
      });

    expect(created.status).toBe(200);
    expect(created.body.success).toBe(true);
    const line = created.body.data.lines?.[0];
    expect(line.menuItemNameSnapshot).toBe(setup.defaultMenuItemName);
    expect(line.unitPrice).toBe(3.5);
    expect(line.quantity).toBe(2);
    expect(line.lineSubtotal).toBe(7);
  });

  it("publishes order.place event and exposes saleOrder pull deltas", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const created = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-pull-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(created.status).toBe(200);
    const orderId = created.body.data.id as string;

    const outbox = await pool.query<{
      action_key: string;
      event_type: string;
      entity_id: string;
      outcome: string;
    }>(
      `SELECT action_key, event_type, entity_id, outcome
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'order.place'
         AND entity_id = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [setup.tenantId, setup.branchId, orderId]
    );
    expect(outbox.rows[0]).toMatchObject({
      action_key: "order.place",
      event_type: "ORDER_TICKET_PLACED",
      entity_id: orderId,
      outcome: "SUCCESS",
    });

    const pulled = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .send({
        cursor: null,
        limit: 200,
        moduleScopes: ["saleOrder"],
      });
    expect(pulled.status).toBe(200);
    expect(pulled.body.success).toBe(true);

    const changes = pulled.body.data.changes as Array<{
      moduleKey: string;
      entityType: string;
      entityId: string;
    }>;
    expect(
      changes.some(
        (change) =>
          change.moduleKey === "saleOrder"
          && change.entityType === "order_ticket"
          && change.entityId === orderId
      )
    ).toBe(true);
  });

  it("generates KHQR from sale snapshot, confirms payment, and finalizes", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const cashSessionId = await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const checkout = await request(app)
      .post(`/v0/orders/${orderId}/checkout`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-checkout-${uniqueSuffix()}`)
      .send({
        paymentMethod: "KHQR",
        tenderCurrency: "USD",
      });
    expect(checkout.status).toBe(200);
    const saleId = checkout.body.data.id as string;

    const generated = await request(app)
      .post(`/v0/payments/khqr/sales/${saleId}/generate`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-generate-${uniqueSuffix()}`)
      .send({
        expiresInSeconds: 180,
      });
    expect(generated.status).toBe(201);
    expect(generated.body.success).toBe(true);
    expect(generated.body.data.attempt.status).toBe("WAITING_FOR_PAYMENT");
    expect(generated.body.data.attempt.amount).toBe(3.5);
    expect(generated.body.data.attempt.currency).toBe("USD");
    expect(generated.body.data.attempt.toAccountId).toBe("khqr-receiver");
    expect(typeof generated.body.data.paymentRequest.payload).toBe("string");
    expect(generated.body.data.paymentRequest.payloadType).toBe("DEEPLINK_URL");
    expect(generated.body.data.paymentRequest.deepLinkUrl).toBe(
      generated.body.data.paymentRequest.payload
    );
    const md5 = generated.body.data.attempt.md5 as string;

    const webhook = await request(app)
      .post("/v0/payments/khqr/webhooks/provider")
      .set("x-khqr-webhook-secret", process.env.V0_KHQR_WEBHOOK_SECRET ?? "dev-khqr-webhook-secret")
      .send({
        tenantId: setup.tenantId,
        branchId: setup.branchId,
        md5,
        providerEventId: `evt-${uniqueSuffix()}`,
        providerTxHash: `tx-${uniqueSuffix()}`,
        providerReference: "bakong-confirmed",
        verificationStatus: "CONFIRMED",
        confirmedAmount: 3.5,
        confirmedCurrency: "USD",
        confirmedToAccountId: "khqr-receiver",
        occurredAt: new Date().toISOString(),
      });
    expect(webhook.status).toBe(200);
    expect(webhook.body.data.attempt.status).toBe("PAID_CONFIRMED");

    const finalized = await request(app)
      .post(`/v0/sales/${saleId}/finalize`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-finalize-${uniqueSuffix()}`)
      .send({
        khqrMd5: md5,
      });
    expect(finalized.status).toBe(200);
    expect(finalized.body.success).toBe(true);
    expect(finalized.body.data.status).toBe("FINALIZED");

    const xReport = await request(app)
      .get(`/v0/cash/sessions/${cashSessionId}/x`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(xReport.status).toBe(200);
    expect(xReport.body.success).toBe(true);
    expect(xReport.body.data.totalSalesKhqrUsd).toBe(3.5);
    expect(xReport.body.data.totalSalesNonCashUsd).toBe(3.5);
  });

  it("rejects order placement when no active cash session exists", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-no-session-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(422);
    expect(placed.body).toMatchObject({
      success: false,
      code: "ORDER_REQUIRES_OPEN_CASH_SESSION",
    });
  });

  it("rejects order checkout when active cash session is no longer open", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-checkout-no-session-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    await pool.query(
      `DELETE FROM v0_cash_sessions
       WHERE tenant_id = $1
         AND branch_id = $2
         AND status = 'OPEN'`,
      [setup.tenantId, setup.branchId]
    );

    const checkout = await request(app)
      .post(`/v0/orders/${orderId}/checkout`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-checkout-no-session-${uniqueSuffix()}`)
      .send({
        paymentMethod: "CASH",
        tenderCurrency: "USD",
      });
    expect(checkout.status).toBe(422);
    expect(checkout.body).toMatchObject({
      success: false,
      code: "SALE_CHECKOUT_REQUIRES_OPEN_CASH_SESSION",
    });
  });

  it("rejects adding order items when no active cash session exists", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-add-items-no-session-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    await pool.query(
      `DELETE FROM v0_cash_sessions
       WHERE tenant_id = $1
         AND branch_id = $2
         AND status = 'OPEN'`,
      [setup.tenantId, setup.branchId]
    );

    const addItems = await request(app)
      .post(`/v0/orders/${orderId}/items`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-add-items-no-session-${uniqueSuffix()}`)
      .send({
        items: [
          {
            menuItemId: randomUUID(),
            quantity: 1,
            modifierSelections: [],
            note: null,
          },
        ],
      });
    expect(addItems.status).toBe(422);
    expect(addItems.body).toMatchObject({
      success: false,
      code: "ORDER_REQUIRES_OPEN_CASH_SESSION",
    });
  });

  it("rejects KHQR checkout when tenderAmount does not match sale grand total", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-tender-invalid-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId, quantity: 3 }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const checkout = await request(app)
      .post(`/v0/orders/${orderId}/checkout`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-tender-invalid-checkout-${uniqueSuffix()}`)
      .send({
        paymentMethod: "KHQR",
        tenderCurrency: "USD",
        tenderAmount: 2.5,
      });

    expect(checkout.status).toBe(422);
    expect(checkout.body).toMatchObject({
      success: false,
      code: "SALE_KHQR_TENDER_AMOUNT_INVALID",
    });
  });

  it("rejects KHQR generation when no active cash session exists", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-no-session-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const checkout = await request(app)
      .post(`/v0/orders/${orderId}/checkout`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-no-session-checkout-${uniqueSuffix()}`)
      .send({
        paymentMethod: "KHQR",
        tenderCurrency: "USD",
      });
    expect(checkout.status).toBe(200);
    const saleId = checkout.body.data.id as string;

    await pool.query(
      `DELETE FROM v0_cash_sessions
       WHERE tenant_id = $1
         AND branch_id = $2
         AND status = 'OPEN'`,
      [setup.tenantId, setup.branchId]
    );

    const generated = await request(app)
      .post(`/v0/payments/khqr/sales/${saleId}/generate`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-no-session-generate-${uniqueSuffix()}`)
      .send({
        expiresInSeconds: 180,
      });
    expect(generated.status).toBe(422);
    expect(generated.body).toMatchObject({
      success: false,
      code: "KHQR_GENERATE_REQUIRES_OPEN_CASH_SESSION",
    });
  });

  it("rejects KHQR generation when branch receiver account is not configured", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });
    await pool.query(
      `UPDATE branches
       SET khqr_receiver_account_id = NULL,
           khqr_receiver_name = NULL
       WHERE tenant_id = $1
         AND id = $2`,
      [setup.tenantId, setup.branchId]
    );

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-missing-receiver-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const checkout = await request(app)
      .post(`/v0/orders/${orderId}/checkout`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-missing-receiver-checkout-${uniqueSuffix()}`)
      .send({
        paymentMethod: "KHQR",
        tenderCurrency: "USD",
      });
    expect(checkout.status).toBe(200);
    const saleId = checkout.body.data.id as string;

    const generated = await request(app)
      .post(`/v0/payments/khqr/sales/${saleId}/generate`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-missing-receiver-generate-${uniqueSuffix()}`)
      .send({});
    expect(generated.status).toBe(422);
    expect(generated.body).toMatchObject({
      success: false,
      code: "KHQR_BRANCH_RECEIVER_NOT_CONFIGURED",
    });
  });
});

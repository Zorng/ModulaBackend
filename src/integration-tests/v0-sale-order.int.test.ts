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
  };
}

async function openCashSession(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  accountId: string;
}): Promise<void> {
  await input.pool.query(
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
     DO NOTHING`,
    [input.tenantId, input.branchId, input.accountId]
  );
}

function buildOrderPayload(input: { menuItemId?: string; quantity?: number; unitPrice?: number }) {
  return {
    items: [
      {
        menuItemId: input.menuItemId ?? randomUUID(),
        menuItemNameSnapshot: "Iced Latte",
        unitPrice: input.unitPrice ?? 2.5,
        quantity: input.quantity ?? 1,
        modifierSnapshot: [],
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
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "order.place";

    const response = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-atomic-${uniqueSuffix()}`)
      .send(buildOrderPayload({}));

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
    const idempotencyKey = `sale-order-idem-${uniqueSuffix()}`;
    const menuItemId = randomUUID();

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

  it("publishes order.place event and exposes saleOrder pull deltas", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });

    const created = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-pull-${uniqueSuffix()}`)
      .send(buildOrderPayload({}));
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
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ unitPrice: 3.5 }));
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
  });

  it("rejects KHQR checkout when tenderAmount does not match sale grand total", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-tender-invalid-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ unitPrice: 2.5, quantity: 3 }));
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
      .send(buildOrderPayload({ unitPrice: 3.5 }));
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

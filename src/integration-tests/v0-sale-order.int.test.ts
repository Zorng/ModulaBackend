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
import { bootstrapV0InventoryModule } from "../modules/v0/posOperation/inventory/index.js";
import { bootstrapV0ReceiptModule } from "../modules/v0/posOperation/receipt/index.js";
import { bootstrapV0SaleOrderModule } from "../modules/v0/posOperation/saleOrder/index.js";
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
  await setBranchPayLaterPolicy({
    pool: input.pool,
    tenantId,
    branchId,
    enabled: true,
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

async function setupMemberBranchContext(input: {
  app: express.Express;
  pool: Pool;
  tenantId: string;
  branchId: string;
  roleKey: "ADMIN" | "MANAGER" | "CASHIER";
}): Promise<{
  accountId: string;
  branchToken: string;
}> {
  const phone = uniquePhone();
  const token = await registerAndLogin(input.app, phone);
  const accountQuery = await input.pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE phone = $1 LIMIT 1`,
    [phone]
  );
  const accountId = accountQuery.rows[0]?.id;
  expect(accountId).toBeTruthy();

  const membershipQuery = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_tenant_memberships (
       tenant_id,
       account_id,
       role_key,
       status,
       accepted_at
     )
     VALUES ($1, $2, $3, 'ACTIVE', NOW())
     RETURNING id`,
    [input.tenantId, accountId, input.roleKey]
  );
  const membershipId = membershipQuery.rows[0]?.id;
  expect(membershipId).toBeTruthy();

  await assignActiveBranch({
    pool: input.pool,
    tenantId: input.tenantId,
    branchId: input.branchId,
    accountId: accountId!,
    membershipId: membershipId!,
  });

  const tenantSelected = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${token}`)
    .send({ tenantId: input.tenantId });
  expect(tenantSelected.status).toBe(200);
  const tenantToken = tenantSelected.body.data.accessToken as string;

  const branchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${tenantToken}`)
    .send({ branchId: input.branchId });
  expect(branchSelected.status).toBe(200);

  return {
    accountId: accountId!,
    branchToken: branchSelected.body.data.accessToken as string,
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

async function seedTrackedBaseComponent(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  menuItemId: string;
  quantityInBaseUnit: number;
  initialOnHandInBaseUnit: number;
}): Promise<{ stockItemId: string }> {
  const createdStockItem = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_inventory_stock_items (
       tenant_id,
       category_id,
       name,
       base_unit,
       image_url,
       low_stock_threshold,
       status
     )
     VALUES ($1, NULL, $2, 'unit', NULL, NULL, 'ACTIVE')
     RETURNING id`,
    [input.tenantId, `Beans ${uniqueSuffix()}`]
  );
  const stockItemId = createdStockItem.rows[0]?.id;
  if (!stockItemId) {
    throw new Error("failed to seed stock item");
  }

  await input.pool.query(
    `INSERT INTO v0_menu_item_base_components (
       tenant_id,
       menu_item_id,
       stock_item_id,
       quantity_in_base_unit,
       tracking_mode
     )
     VALUES ($1, $2, $3, $4, 'TRACKED')`,
    [input.tenantId, input.menuItemId, stockItemId, input.quantityInBaseUnit]
  );

  await input.pool.query(
    `INSERT INTO v0_inventory_branch_stock (
       tenant_id,
       branch_id,
       stock_item_id,
       on_hand_in_base_unit,
       last_movement_at
     )
     VALUES ($1, $2, $3, $4, NOW())`,
    [input.tenantId, input.branchId, stockItemId, input.initialOnHandInBaseUnit]
  );

  return { stockItemId };
}

async function setBranchPayLaterPolicy(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  enabled: boolean;
}): Promise<void> {
  await input.pool.query(
    `UPDATE v0_branch_policies
     SET sale_allow_pay_later = $3,
         updated_at = NOW()
     WHERE tenant_id = $1
      AND branch_id = $2`,
    [input.tenantId, input.branchId, input.enabled]
  );
}

async function setBranchManualExternalPaymentClaimPolicy(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  enabled: boolean;
}): Promise<void> {
  await input.pool.query(
    `UPDATE v0_branch_policies
     SET sale_allow_manual_external_payment_claim = $3,
         updated_at = NOW()
     WHERE tenant_id = $1
       AND branch_id = $2`,
    [input.tenantId, input.branchId, input.enabled]
  );
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

function buildCheckoutCartPayload(input: { menuItemId: string; quantity?: number }) {
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
    app.use("/v0/inventory", bootstrapV0InventoryModule(pool).router);
    app.use("/v0/receipts", bootstrapV0ReceiptModule(pool).router);
    app.use("/v0/payments/khqr", bootstrapV0KhqrPaymentModule(pool).router);
    app.use("/v0/sync", bootstrapV0PullSyncModule(pool).router);
    app.use("/v0", bootstrapV0SaleOrderModule(pool).router);
  });

  afterEach(() => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
    delete process.env.V0_KHQR_STUB_VERIFICATION_STATUS;
  });

  afterAll(async () => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
    delete process.env.V0_KHQR_STUB_VERIFICATION_STATUS;
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

  it("deducts tracked inventory on finalized cash sale checkout", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const initialOnHandInBaseUnit = 20;
    const quantityInBaseUnitPerSaleUnit = 1;
    const saleQuantity = 2;
    const seededComponent = await seedTrackedBaseComponent({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      menuItemId: setup.defaultMenuItemId,
      quantityInBaseUnit: quantityInBaseUnitPerSaleUnit,
      initialOnHandInBaseUnit,
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-inventory-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId, quantity: saleQuantity }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const checkedOut = await request(app)
      .post(`/v0/orders/${orderId}/checkout`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-inventory-checkout-${uniqueSuffix()}`)
      .send({
        paymentMethod: "CASH",
        tenderCurrency: "USD",
      });
    expect(checkedOut.status).toBe(200);
    const saleId = checkedOut.body.data.id as string;

    await eventBus.publish({
      type: "ORDER_CHECKOUT_COMPLETED",
      outboxId: randomUUID(),
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      entityType: "sale",
      entityId: saleId,
      occurredAt: new Date().toISOString(),
    } as never);

    const stock = await pool.query<{ on_hand_in_base_unit: number }>(
      `SELECT on_hand_in_base_unit::FLOAT8 AS on_hand_in_base_unit
       FROM v0_inventory_branch_stock
       WHERE tenant_id = $1
         AND branch_id = $2
         AND stock_item_id = $3
       LIMIT 1`,
      [setup.tenantId, setup.branchId, seededComponent.stockItemId]
    );
    expect(stock.rows[0]?.on_hand_in_base_unit).toBe(
      initialOnHandInBaseUnit - quantityInBaseUnitPerSaleUnit * saleQuantity
    );

    const journal = await pool.query<{
      quantity_in_base_unit: number;
      source_id: string;
      reason_code: string;
      direction: string;
    }>(
      `SELECT
         quantity_in_base_unit::FLOAT8 AS quantity_in_base_unit,
         source_id,
         reason_code,
         direction
       FROM v0_inventory_journal_entries
       WHERE tenant_id = $1
         AND branch_id = $2
         AND stock_item_id = $3
         AND source_type = 'SALE_ORDER'
         AND source_id = $4
         AND reason_code = 'SALE_DEDUCTION'
       ORDER BY created_at DESC
       LIMIT 1`,
      [setup.tenantId, setup.branchId, seededComponent.stockItemId, saleId]
    );

    expect(journal.rows[0]).toBeDefined();
    expect(journal.rows[0]?.direction).toBe("OUT");
    expect(journal.rows[0]?.reason_code).toBe("SALE_DEDUCTION");
    expect(journal.rows[0]?.source_id).toBe(saleId);
    expect(journal.rows[0]?.quantity_in_base_unit).toBe(2);
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

  it("generates KHQR from sale snapshot and auto-finalizes on confirmed webhook", async () => {
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
        saleType: "DELIVERY",
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
    expect(webhook.body.data.saleFinalized).toBe(true);
    expect(webhook.body.data.sale.status).toBe("FINALIZED");

    const finalizedSale = await request(app)
      .get(`/v0/sales/${saleId}`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-finalized-read-${uniqueSuffix()}`);
    expect(finalizedSale.status).toBe(200);
    expect(finalizedSale.body.success).toBe(true);
    expect(finalizedSale.body.data.status).toBe("FINALIZED");
    expect(finalizedSale.body.data.saleType).toBe("DELIVERY");

    const xReport = await request(app)
      .get(`/v0/cash/sessions/${cashSessionId}/x`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(xReport.status).toBe(200);
    expect(xReport.body.success).toBe(true);
    expect(xReport.body.data.totalSalesKhqrUsd).toBe(3.5);
    expect(xReport.body.data.totalSalesNonCashUsd).toBe(3.5);

  });

  it("auto-finalizes KHQR sale via manual confirm fallback", async () => {
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
      .set("Idempotency-Key", `sale-order-khqr-manual-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const checkout = await request(app)
      .post(`/v0/orders/${orderId}/checkout`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-manual-checkout-${uniqueSuffix()}`)
      .send({
        paymentMethod: "KHQR",
        tenderCurrency: "USD",
      });
    expect(checkout.status).toBe(200);
    const saleId = checkout.body.data.id as string;

    const generated = await request(app)
      .post(`/v0/payments/khqr/sales/${saleId}/generate`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-manual-generate-${uniqueSuffix()}`)
      .send({
        expiresInSeconds: 180,
      });
    expect(generated.status).toBe(201);
    const md5 = generated.body.data.attempt.md5 as string;

    const previousStubStatus = process.env.V0_KHQR_STUB_VERIFICATION_STATUS;
    process.env.V0_KHQR_STUB_VERIFICATION_STATUS = "CONFIRMED";
    try {
      const confirmed = await request(app)
        .post("/v0/payments/khqr/confirm")
        .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
        .set("Idempotency-Key", `sale-order-khqr-manual-confirm-${uniqueSuffix()}`)
        .send({ md5 });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.success).toBe(true);
      expect(confirmed.body.data.verificationStatus).toBe("CONFIRMED");
      expect(confirmed.body.data.saleFinalized).toBe(true);
      expect(confirmed.body.data.sale.saleId).toBe(saleId);
      expect(confirmed.body.data.sale.status).toBe("FINALIZED");
      expect(confirmed.body.data.receipt.saleId).toBe(saleId);
      expect(confirmed.body.data.receipt.statusDisplay).toBe("NORMAL");
      expect(Array.isArray(confirmed.body.data.receipt.lines)).toBe(true);
      expect(confirmed.body.data.receipt.lines.length).toBe(1);
    } finally {
      if (previousStubStatus === undefined) {
        delete process.env.V0_KHQR_STUB_VERIFICATION_STATUS;
      } else {
        process.env.V0_KHQR_STUB_VERIFICATION_STATUS = previousStubStatus;
      }
    }

    const finalizedSale = await request(app)
      .get(`/v0/sales/${saleId}`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(finalizedSale.status).toBe(200);
    expect(finalizedSale.body.data.status).toBe("FINALIZED");

  });

  it("finalizes cash checkout directly from local cart without order ticket", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const finalized = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-cash-checkout-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 2 }),
        paymentMethod: "CASH",
        saleType: "TAKEAWAY",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });

    expect(finalized.status).toBe(200);
    expect(finalized.body.success).toBe(true);
    expect(finalized.body.data.status).toBe("FINALIZED");
    expect(finalized.body.data.saleType).toBe("TAKEAWAY");
    expect(finalized.body.data.paymentMethod).toBe("CASH");
    expect(finalized.body.data.orderId).toBeNull();

    const orderCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_order_tickets
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(orderCount.rows[0]?.count ?? "0")).toBe(0);
  });

  it("updates current-session X report after finalized cash checkout is dispatched", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const sessionId = await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const dispatcher = startV0CommandOutboxDispatcher({
      db: pool,
      pollIntervalMs: 50,
      batchSize: 25,
    });

    try {
      const finalized = await request(app)
        .post("/v0/checkout/cash/finalize")
        .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
        .set("Idempotency-Key", `sale-order-cash-x-report-${uniqueSuffix()}`)
        .send({
          ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 2 }),
          paymentMethod: "CASH",
          saleType: "TAKEAWAY",
          tenderCurrency: "USD",
          cashReceivedTenderAmount: 10,
        });

      expect(finalized.status).toBe(200);
      expect(finalized.body.data.status).toBe("FINALIZED");

      let xReportResponse:
        | request.Response
        | null = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        xReportResponse = await request(app)
          .get(`/v0/cash/sessions/${sessionId}/x`)
          .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
        if (
          xReportResponse.status === 200
          && xReportResponse.body?.data?.totalSaleInUsd === 7
          && xReportResponse.body?.data?.expectedCashUsd === 57
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      expect(xReportResponse?.status).toBe(200);
      expect(xReportResponse?.body).toMatchObject({
        success: true,
        data: {
          sessionId,
          totalSaleInUsd: 7,
          totalSaleInKhr: 0,
          expectedCashUsd: 57,
          expectedCashKhr: 0,
        },
      });

      const movementCount = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM v0_cash_movements
         WHERE tenant_id = $1
           AND cash_session_id = $2
           AND movement_type = 'SALE_IN'`,
        [setup.tenantId, sessionId]
      );
      expect(Number(movementCount.rows[0]?.count ?? "0")).toBe(1);
    } finally {
      dispatcher.stop();
    }
  });

  it("returns receipt-ready payload on finalized cash checkout response", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const finalized = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-receipt-create-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 2 }),
        paymentMethod: "CASH",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });

    expect(finalized.status).toBe(200);
    expect(finalized.body.success).toBe(true);
    const saleId = finalized.body.data.id as string;

    expect(finalized.body.data.receipt.saleId).toBe(saleId);
    expect(finalized.body.data.receipt.statusDisplay).toBe("NORMAL");
    expect(finalized.body.data.receipt.saleSnapshot.paymentMethod).toBe("CASH");
    expect(finalized.body.data.receipt.saleSnapshot.tenderCurrency).toBe("USD");
    expect(finalized.body.data.receipt.saleSnapshot.tenderAmount).toBe(8);
    expect(finalized.body.data.receipt.saleSnapshot.paidAmount).toBe(8);
    expect(finalized.body.data.receipt.saleSnapshot.cashReceivedTenderAmount).toBe(10);
    expect(finalized.body.data.receipt.saleSnapshot.cashChangeTenderAmount).toBe(2);
    expect(Array.isArray(finalized.body.data.receipt.lines)).toBe(true);
    expect(finalized.body.data.receipt.lines.length).toBe(1);

    const receiptRead = await request(app)
      .get(`/v0/receipts/${saleId}`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);

    expect(receiptRead.status).toBe(200);
    expect(receiptRead.body.data.receiptId).toBe(saleId);
    expect(receiptRead.body.data.saleSnapshot.paymentMethod).toBe("CASH");
    expect(receiptRead.body.data.saleSnapshot.tenderCurrency).toBe("USD");
    expect(receiptRead.body.data.saleSnapshot.tenderAmount).toBe(8);
    expect(receiptRead.body.data.saleSnapshot.paidAmount).toBe(8);
    expect(receiptRead.body.data.saleSnapshot.cashReceivedTenderAmount).toBe(10);
    expect(receiptRead.body.data.saleSnapshot.cashChangeTenderAmount).toBe(2);
  });

  it("does not emit legacy receipt.snapshot.create outbox action on checkout.cash.finalize", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const finalized = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-receipt-nonblocking-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        paymentMethod: "CASH",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });

    expect(finalized.status).toBe(200);
    expect(finalized.body.success).toBe(true);
    expect(finalized.body.data.status).toBe("FINALIZED");
    expect(finalized.body.data.receipt.statusDisplay).toBe("NORMAL");

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'receipt.snapshot.create'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(0);
  });

  it("rejects cash checkout when cash received is below grand total", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const rejected = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-cash-checkout-underpaid-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 2 }),
        paymentMethod: "CASH",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 1,
      });

    expect(rejected.status).toBe(422);
    expect(rejected.body).toMatchObject({
      success: false,
      code: "SALE_CASH_RECEIVED_INSUFFICIENT",
    });
  });

  it("allows cashier to place pay-later order and use checkout bridge", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const cashier = await setupMemberBranchContext({
      app,
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "CASHIER",
    });

    const listed = await request(app)
      .get("/v0/orders")
      .set("Authorization", `Bearer ${cashier.branchToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.success).toBe(true);

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${cashier.branchToken}`)
      .set("Idempotency-Key", `sale-order-cashier-orders-allowed-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    expect(placed.body.success).toBe(true);

    const finalized = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${cashier.branchToken}`)
      .set("Idempotency-Key", `sale-order-cashier-checkout-allowed-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        paymentMethod: "CASH",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });
    expect(finalized.status).toBe(200);
    expect(finalized.body.success).toBe(true);
    expect(finalized.body.data.status).toBe("FINALIZED");
    expect(finalized.body.data.paymentMethod).toBe("CASH");
    const saleId = finalized.body.data.id as string;
    expect(typeof saleId).toBe("string");
  });

  it("cancels unpaid order ticket and keeps retry idempotent", async () => {
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
      .set("Idempotency-Key", `sale-order-cancel-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const cancelled = await request(app)
      .post(`/v0/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-cancel-first-${uniqueSuffix()}`)
      .send({
        reason: "Customer left",
      });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.success).toBe(true);
    expect(cancelled.body.data.status).toBe("CANCELLED");
    expect(cancelled.body.data.cancelReason).toBe("Customer left");

    const replay = await request(app)
      .post(`/v0/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-cancel-second-${uniqueSuffix()}`)
      .send({
        reason: "Customer left again",
      });
    expect(replay.status).toBe(200);
    expect(replay.body.success).toBe(true);
    expect(replay.body.data.status).toBe("CANCELLED");
    expect(replay.body.data.cancelReason).toBe("Customer left");
  });

  it("auto-finalizes sale when checking out pay-later order with cash", async () => {
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
      .set("Idempotency-Key", `sale-order-cash-auto-finalize-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const checkedOut = await request(app)
      .post(`/v0/orders/${orderId}/checkout`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-cash-auto-finalize-checkout-${uniqueSuffix()}`)
      .send({
        paymentMethod: "CASH",
        saleType: "TAKEAWAY",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });
    expect(checkedOut.status).toBe(200);
    expect(checkedOut.body.success).toBe(true);
    expect(checkedOut.body.data.status).toBe("FINALIZED");
    expect(checkedOut.body.data.saleType).toBe("TAKEAWAY");
    expect(typeof checkedOut.body.data.finalizedAt).toBe("string");
    expect(checkedOut.body.data.order.status).toBe("CHECKED_OUT");
    expect(checkedOut.body.data.receipt.statusDisplay).toBe("NORMAL");
    expect(checkedOut.body.data.receipt.saleSnapshot.paymentMethod).toBe("CASH");
    const saleId = checkedOut.body.data.id as string;

    const sale = await request(app)
      .get(`/v0/sales/${saleId}`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(sale.status).toBe(200);
    expect(sale.body.success).toBe(true);
    expect(sale.body.data.status).toBe("FINALIZED");
    expect(sale.body.data.saleType).toBe("TAKEAWAY");
    expect(typeof sale.body.data.finalizedAt).toBe("string");
  });

  it("rejects cancelling a checked-out order ticket", async () => {
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
      .set("Idempotency-Key", `sale-order-cancel-checkedout-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const checkedOut = await request(app)
      .post(`/v0/orders/${orderId}/checkout`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-cancel-checkedout-checkout-${uniqueSuffix()}`)
      .send({
        paymentMethod: "CASH",
        tenderCurrency: "USD",
      });
    expect(checkedOut.status).toBe(200);

    const cancelled = await request(app)
      .post(`/v0/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-cancel-checkedout-cancel-${uniqueSuffix()}`)
      .send({
        reason: "Should fail",
      });
    expect(cancelled.status).toBe(409);
    expect(cancelled.body).toMatchObject({
      success: false,
      code: "ORDER_CANCEL_NOT_ALLOWED",
    });
  });

  it("initiates KHQR intent from local cart and finalizes on confirm", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const initiated = await request(app)
      .post("/v0/checkout/khqr/initiate")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-checkout-init-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        saleType: "DELIVERY",
        tenderCurrency: "USD",
        expiresInSeconds: 180,
      });

    expect(initiated.status).toBe(200);
    expect(initiated.body.success).toBe(true);
    expect(initiated.body.data.intent.status).toBe("WAITING_FOR_PAYMENT");
    expect(initiated.body.data.attempt.status).toBe("WAITING_FOR_PAYMENT");
    expect(initiated.body.data.attempt.saleId).toBeNull();
    expect(initiated.body.data.paymentRequest.toAccountId).toBe("khqr-receiver");
    expect(initiated.body.data.paymentRequest.receiverName).toBe("KHQR Receiver");
    const paymentIntentId = initiated.body.data.intent.paymentIntentId as string;
    const md5 = initiated.body.data.attempt.md5 as string;

    process.env.V0_KHQR_STUB_VERIFICATION_STATUS = "CONFIRMED";
    const confirmed = await request(app)
      .post("/v0/payments/khqr/confirm")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-checkout-confirm-${uniqueSuffix()}`)
      .send({ md5 });

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.success).toBe(true);
    expect(confirmed.body.data.verificationStatus).toBe("CONFIRMED");
    expect(confirmed.body.data.saleFinalized).toBe(true);
    expect(confirmed.body.data.sale.status).toBe("FINALIZED");
    expect(confirmed.body.data.sale.saleType).toBe("DELIVERY");

    const finalizedIntent = await pool.query<{ status: string; saleId: string | null }>(
      `SELECT status, sale_id AS "saleId"
       FROM v0_payment_intents
       WHERE id = $1`,
      [paymentIntentId]
    );
    expect(finalizedIntent.rows[0]?.status).toBe("FINALIZED");
    expect(typeof finalizedIntent.rows[0]?.saleId).toBe("string");
  });

  it("cancels KHQR intent from local cart and blocks finalization", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const initiated = await request(app)
      .post("/v0/checkout/khqr/initiate")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-checkout-cancel-init-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        tenderCurrency: "USD",
      });
    expect(initiated.status).toBe(200);
    const paymentIntentId = initiated.body.data.intent.paymentIntentId as string;
    const md5 = initiated.body.data.attempt.md5 as string;

    const cancelled = await request(app)
      .post(`/v0/checkout/khqr/intents/${paymentIntentId}/cancel`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-checkout-cancel-${uniqueSuffix()}`)
      .send({
        reasonCode: "KHQR_CANCELLED_BY_CASHIER",
      });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.success).toBe(true);
    expect(cancelled.body.data.status).toBe("CANCELLED");

    process.env.V0_KHQR_STUB_VERIFICATION_STATUS = "CONFIRMED";
    const confirmed = await request(app)
      .post("/v0/payments/khqr/confirm")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-checkout-cancel-confirm-${uniqueSuffix()}`)
      .send({ md5 });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.success).toBe(true);
    expect(confirmed.body.data.saleFinalized).toBe(false);
    expect(confirmed.body.data.attempt.status).toBe("CANCELLED");

    const intentRead = await request(app)
      .get(`/v0/checkout/khqr/intents/${paymentIntentId}`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(intentRead.status).toBe(200);
    expect(intentRead.body.data.status).toBe("CANCELLED");
    expect(intentRead.body.data.saleId).toBeNull();
  });

  it("does not finalize KHQR sale after attempt cancellation", async () => {
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
      .set("Idempotency-Key", `sale-order-khqr-cancel-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const checkout = await request(app)
      .post(`/v0/orders/${orderId}/checkout`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-cancel-checkout-${uniqueSuffix()}`)
      .send({
        paymentMethod: "KHQR",
        tenderCurrency: "USD",
      });
    expect(checkout.status).toBe(200);
    const saleId = checkout.body.data.id as string;

    const generated = await request(app)
      .post(`/v0/payments/khqr/sales/${saleId}/generate`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-cancel-generate-${uniqueSuffix()}`)
      .send({
        expiresInSeconds: 180,
      });
    expect(generated.status).toBe(201);
    const attemptId = generated.body.data.attempt.attemptId as string;
    const md5 = generated.body.data.attempt.md5 as string;

    const cancelled = await request(app)
      .post(`/v0/payments/khqr/attempts/${attemptId}/cancel`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-cancel-attempt-${uniqueSuffix()}`)
      .send({ reasonCode: "KHQR_CANCELLED_BY_CASHIER" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.success).toBe(true);
    expect(cancelled.body.data.attempt.status).toBe("CANCELLED");
    expect(cancelled.body.data.paymentIntent.status).toBe("CANCELLED");

    process.env.V0_KHQR_STUB_VERIFICATION_STATUS = "CONFIRMED";
    const confirmed = await request(app)
      .post("/v0/payments/khqr/confirm")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-cancel-confirm-${uniqueSuffix()}`)
      .send({ md5 });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.success).toBe(true);
    expect(confirmed.body.data.verificationStatus).toBe("CONFIRMED");
    expect(confirmed.body.data.saleFinalized).toBe(false);
    expect(confirmed.body.data.attempt.status).toBe("CANCELLED");

    const sale = await request(app)
      .get(`/v0/sales/${saleId}`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(sale.status).toBe(200);
    expect(sale.body.success).toBe(true);
    expect(sale.body.data.status).toBe("PENDING");
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

  it("rejects placing order ticket when pay-later policy is disabled", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });
    await setBranchPayLaterPolicy({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      enabled: false,
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-pay-later-disabled-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(422);
    expect(placed.body).toMatchObject({
      success: false,
      code: "ORDER_PAY_LATER_DISABLED",
    });
  });

  it("allows manual-claim order placement when pay-later is disabled but manual-claim policy is enabled", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });
    await setBranchPayLaterPolicy({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      enabled: false,
    });
    await setBranchManualExternalPaymentClaimPolicy({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      enabled: true,
    });

    const standard = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-standard-disabled-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(standard.status).toBe(422);
    expect(standard.body).toMatchObject({
      success: false,
      code: "ORDER_PAY_LATER_DISABLED",
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-manual-source-${uniqueSuffix()}`)
      .send({
        ...buildOrderPayload({ menuItemId: setup.defaultMenuItemId }),
        sourceMode: "MANUAL_EXTERNAL_PAYMENT_CLAIM",
      });
    expect(placed.status).toBe(200);
    expect(placed.body.success).toBe(true);
    expect(placed.body.data.sourceMode).toBe("MANUAL_EXTERNAL_PAYMENT_CLAIM");
  });

  it("creates manual payment claim, lists it, and blocks order mutation while pending", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });
    await setBranchPayLaterPolicy({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      enabled: false,
    });
    await setBranchManualExternalPaymentClaimPolicy({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      enabled: true,
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-manual-claim-place-${uniqueSuffix()}`)
      .send({
        ...buildOrderPayload({ menuItemId: setup.defaultMenuItemId }),
        sourceMode: "MANUAL_EXTERNAL_PAYMENT_CLAIM",
      });
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const createdClaim = await request(app)
      .post(`/v0/orders/${orderId}/manual-payment-claims`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-manual-claim-create-${uniqueSuffix()}`)
      .send({
        claimedPaymentMethod: "KHQR",
        saleType: "TAKEAWAY",
        tenderCurrency: "USD",
        claimedTenderAmount: 3.5,
        proofImageUrl: "https://example.com/proof.png",
        customerReference: "ABA-REF-001",
        note: "Customer transfer screenshot",
      });
    expect(createdClaim.status).toBe(200);
    expect(createdClaim.body.success).toBe(true);
    expect(createdClaim.body.data.status).toBe("PENDING");

    const claimList = await request(app)
      .get(`/v0/orders/${orderId}/manual-payment-claims`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(claimList.status).toBe(200);
    expect(claimList.body.success).toBe(true);
    expect(Array.isArray(claimList.body.data)).toBe(true);
    expect(claimList.body.data[0]?.id).toBe(createdClaim.body.data.id);

    const addItems = await request(app)
      .post(`/v0/orders/${orderId}/items`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-manual-claim-pending-add-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(addItems.status).toBe(409);
    expect(addItems.body).toMatchObject({
      success: false,
      code: "ORDER_MANUAL_PAYMENT_CLAIM_PENDING",
    });
  });

  it("lets manager approve manual KHQR claim into finalized sale without cash movement", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const sessionId = await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });
    await setBranchPayLaterPolicy({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      enabled: false,
    });
    await setBranchManualExternalPaymentClaimPolicy({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      enabled: true,
    });

    const manager = await setupMemberBranchContext({
      app,
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "MANAGER",
    });
    const cashier = await setupMemberBranchContext({
      app,
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "CASHIER",
    });
    const seededComponent = await seedTrackedBaseComponent({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      menuItemId: setup.defaultMenuItemId,
      quantityInBaseUnit: 1,
      initialOnHandInBaseUnit: 10,
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${cashier.branchToken}`)
      .set("Idempotency-Key", `sale-order-manual-approve-place-${uniqueSuffix()}`)
      .send({
        ...buildOrderPayload({ menuItemId: setup.defaultMenuItemId }),
        sourceMode: "MANUAL_EXTERNAL_PAYMENT_CLAIM",
      });
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const createdClaim = await request(app)
      .post(`/v0/orders/${orderId}/manual-payment-claims`)
      .set("Authorization", `Bearer ${cashier.branchToken}`)
      .set("Idempotency-Key", `sale-order-manual-approve-claim-${uniqueSuffix()}`)
      .send({
        claimedPaymentMethod: "KHQR",
        saleType: "TAKEAWAY",
        tenderCurrency: "USD",
        claimedTenderAmount: 3.5,
        proofImageUrl: "https://example.com/proof-approve.png",
        customerReference: "KHQR-001",
        note: "Offline transfer proof",
      });
    expect(createdClaim.status).toBe(200);
    const claimId = createdClaim.body.data.id as string;

    const cashierApprove = await request(app)
      .post(`/v0/orders/${orderId}/manual-payment-claims/${claimId}/approve`)
      .set("Authorization", `Bearer ${cashier.branchToken}`)
      .set("Idempotency-Key", `sale-order-manual-approve-cashier-${uniqueSuffix()}`)
      .send({ note: "Should not be allowed" });
    expect(cashierApprove.status).toBe(403);

    const dispatcher = startV0CommandOutboxDispatcher({
      db: pool,
      pollIntervalMs: 50,
      batchSize: 25,
    });

    try {
      const approved = await request(app)
        .post(`/v0/orders/${orderId}/manual-payment-claims/${claimId}/approve`)
        .set("Authorization", `Bearer ${manager.branchToken}`)
        .set("Idempotency-Key", `sale-order-manual-approve-manager-${uniqueSuffix()}`)
        .send({ note: "Verified with bank evidence" });

      expect(approved.status).toBe(200);
      expect(approved.body.success).toBe(true);
      expect(approved.body.data.status).toBe("FINALIZED");
      expect(approved.body.data.paymentMethod).toBe("KHQR");
      expect(approved.body.data.order.status).toBe("CHECKED_OUT");
      expect(approved.body.data.manualPaymentClaim.status).toBe("APPROVED");
      expect(approved.body.data.receipt.saleSnapshot.paymentMethod).toBe("KHQR");
      const saleId = approved.body.data.id as string;

      for (let attempt = 0; attempt < 40; attempt += 1) {
        const stock = await pool.query<{ on_hand_in_base_unit: number }>(
          `SELECT on_hand_in_base_unit::FLOAT8 AS on_hand_in_base_unit
           FROM v0_inventory_branch_stock
           WHERE tenant_id = $1
             AND branch_id = $2
             AND stock_item_id = $3
           LIMIT 1`,
          [setup.tenantId, setup.branchId, seededComponent.stockItemId]
        );
        if (stock.rows[0]?.on_hand_in_base_unit === 9) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const stock = await pool.query<{ on_hand_in_base_unit: number }>(
        `SELECT on_hand_in_base_unit::FLOAT8 AS on_hand_in_base_unit
         FROM v0_inventory_branch_stock
         WHERE tenant_id = $1
           AND branch_id = $2
           AND stock_item_id = $3
         LIMIT 1`,
        [setup.tenantId, setup.branchId, seededComponent.stockItemId]
      );
      expect(stock.rows[0]?.on_hand_in_base_unit).toBe(9);

      const cashMovements = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM v0_cash_movements
         WHERE tenant_id = $1
           AND cash_session_id = $2
           AND movement_type = 'SALE_IN'`,
        [setup.tenantId, sessionId]
      );
      expect(Number(cashMovements.rows[0]?.count ?? "0")).toBe(0);

      const outbox = await pool.query<{ action_key: string; event_type: string; entity_id: string }>(
        `SELECT action_key, event_type, entity_id
         FROM v0_command_outbox
         WHERE tenant_id = $1
           AND branch_id = $2
           AND action_key = 'order.manualPaymentClaim.approve'
         ORDER BY occurred_at DESC
         LIMIT 1`,
        [setup.tenantId, setup.branchId]
      );
      expect(outbox.rows[0]).toMatchObject({
        action_key: "order.manualPaymentClaim.approve",
        event_type: "SALE_FINALIZED",
        entity_id: saleId,
      });
    } finally {
      dispatcher.stop();
    }
  });

  it("rejects adding order items when pay-later policy is disabled", async () => {
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
      .set("Idempotency-Key", `sale-order-pay-later-disabled-add-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    await setBranchPayLaterPolicy({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      enabled: false,
    });

    const addItems = await request(app)
      .post(`/v0/orders/${orderId}/items`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-pay-later-disabled-add-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(addItems.status).toBe(422);
    expect(addItems.body).toMatchObject({
      success: false,
      code: "ORDER_PAY_LATER_DISABLED",
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

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

async function seedPendingMediaUpload(input: {
  pool: Pool;
  tenantId: string;
  area: "payment-proof";
  imageUrl: string;
  uploadedByAccountId: string;
}): Promise<void> {
  await input.pool.query(
    `INSERT INTO v0_media_uploads (
       tenant_id,
       area,
       object_key,
       image_url,
       mime_type,
       size_bytes,
       status,
       uploaded_by_account_id
     ) VALUES ($1, $2, $3, $4, 'image/png', 1024, 'PENDING', $5)`,
    [
      input.tenantId,
      input.area,
      `payment-proof-images/${input.tenantId}/${randomUUID()}.png`,
      input.imageUrl,
      input.uploadedByAccountId,
    ]
  );
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

async function seedModifierGroupWithOptions(input: {
  pool: Pool;
  tenantId: string;
  menuItemId: string;
  name: string;
  selectionMode: "SINGLE" | "MULTI";
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  options: Array<{ label: string; priceDelta: number }>;
}): Promise<{
  groupId: string;
  optionIds: string[];
}> {
  const groupResult = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_menu_modifier_groups (
       tenant_id,
       name,
       selection_mode,
       min_selections,
       max_selections,
       is_required,
       status
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
     RETURNING id`,
    [
      input.tenantId,
      input.name,
      input.selectionMode,
      input.minSelections,
      input.maxSelections,
      input.isRequired,
    ]
  );
  const groupId = groupResult.rows[0]?.id;
  if (!groupId) {
    throw new Error("failed to seed modifier group");
  }

  await input.pool.query(
    `INSERT INTO v0_menu_item_modifier_group_links (
       tenant_id,
       menu_item_id,
       modifier_group_id,
       display_order
     )
     VALUES ($1, $2, $3, 0)`,
    [input.tenantId, input.menuItemId, groupId]
  );

  const optionIds: string[] = [];
  for (const option of input.options) {
    const optionResult = await input.pool.query<{ id: string }>(
      `INSERT INTO v0_menu_modifier_options (
         tenant_id,
         modifier_group_id,
         label,
         price_delta,
         status
       )
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING id`,
      [input.tenantId, groupId, option.label, option.priceDelta]
    );
    const optionId = optionResult.rows[0]?.id;
    if (!optionId) {
      throw new Error("failed to seed modifier option");
    }
    optionIds.push(optionId);
  }

  return { groupId, optionIds };
}

async function attachModifierGroupToMenuItem(input: {
  pool: Pool;
  tenantId: string;
  menuItemId: string;
  groupId: string;
}): Promise<void> {
  await input.pool.query(
    `INSERT INTO v0_menu_item_modifier_group_links (
       tenant_id,
       menu_item_id,
       modifier_group_id,
       display_order
     )
     VALUES ($1, $2, $3, 0)`,
    [input.tenantId, input.menuItemId, input.groupId]
  );
}

async function setMenuItemModifierOptionEffect(input: {
  pool: Pool;
  tenantId: string;
  menuItemId: string;
  modifierOptionId: string;
  priceDelta: number;
  componentDeltas?: Array<{
    stockItemId: string;
    quantityDeltaInBaseUnit: number;
    trackingMode: "TRACKED" | "NOT_TRACKED";
  }>;
}): Promise<void> {
  await input.pool.query(
    `DELETE FROM v0_menu_item_modifier_option_effects
     WHERE tenant_id = $1
       AND menu_item_id = $2
       AND modifier_option_id = $3`,
    [input.tenantId, input.menuItemId, input.modifierOptionId]
  );
  await input.pool.query(
    `INSERT INTO v0_menu_item_modifier_option_effects (
       tenant_id,
       menu_item_id,
       modifier_option_id,
       price_delta
     )
     VALUES ($1, $2, $3, $4)`,
    [input.tenantId, input.menuItemId, input.modifierOptionId, input.priceDelta]
  );
  if (!input.componentDeltas || input.componentDeltas.length === 0) {
    return;
  }

  const effectIdResult = await input.pool.query<{ id: string }>(
    `SELECT id
     FROM v0_menu_item_modifier_option_effects
     WHERE tenant_id = $1
       AND menu_item_id = $2
       AND modifier_option_id = $3
     LIMIT 1`,
    [input.tenantId, input.menuItemId, input.modifierOptionId]
  );
  const effectId = effectIdResult.rows[0]?.id;
  if (!effectId) {
    throw new Error("failed to load menu item modifier option effect");
  }

  for (const delta of input.componentDeltas) {
    await input.pool.query(
      `INSERT INTO v0_menu_item_modifier_option_component_deltas (
         tenant_id,
         menu_item_modifier_option_effect_id,
         stock_item_id,
         quantity_delta_in_base_unit,
         tracking_mode
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.tenantId,
        effectId,
        delta.stockItemId,
        delta.quantityDeltaInBaseUnit,
        delta.trackingMode,
      ]
    );
  }
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

async function seedDormantLegacyOrder(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  openedByAccountId: string;
  sourceMode?: "STANDARD" | "MANUAL_EXTERNAL_PAYMENT_CLAIM";
}): Promise<string> {
  const inserted = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_order_tickets (
       tenant_id,
       branch_id,
       opened_by_account_id,
       source_mode
     )
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      input.tenantId,
      input.branchId,
      input.openedByAccountId,
      input.sourceMode ?? "STANDARD",
    ]
  );
  const orderId = inserted.rows[0]?.id;
  if (!orderId) {
    throw new Error("failed to seed dormant legacy order");
  }
  return orderId;
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

function buildManualClaimOrderPayload(input: { menuItemId: string; quantity?: number }) {
  return {
    ...buildOrderPayload(input),
    sourceMode: "MANUAL_EXTERNAL_PAYMENT_CLAIM",
  };
}

function buildManualPaymentClaimPayload(input?: {
  proofImageUrl?: string;
  claimedTenderAmount?: number;
}) {
  return {
    claimedPaymentMethod: "KHQR",
    saleType: "TAKEAWAY",
    tenderCurrency: "USD",
    claimedTenderAmount: input?.claimedTenderAmount ?? 3.5,
    proofImageUrl: input?.proofImageUrl ?? "https://example.com/proof.png",
    customerReference: "ABA-REF-001",
    note: "Customer transfer screenshot",
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

async function finalizeCashSaleAndRequestVoid(input: {
  app: express.Express;
  authToken: string;
  menuItemId: string;
  quantity?: number;
  reason: string;
}): Promise<{
  saleId: string;
  orderId: string;
  grandTotalUsd: number;
  grandTotalKhr: number;
}> {
  const finalized = await request(input.app)
    .post("/v0/checkout/cash/finalize")
    .set("Authorization", `Bearer ${input.authToken}`)
    .set("Idempotency-Key", `sale-order-void-queue-finalize-${uniqueSuffix()}`)
    .send({
      ...buildCheckoutCartPayload({
        menuItemId: input.menuItemId,
        quantity: input.quantity,
      }),
      saleType: "DINE_IN",
      tenderCurrency: "USD",
      cashReceivedTenderAmount: 20,
    });
  expect(finalized.status).toBe(200);

  const saleId = finalized.body.data.id as string;
  const orderId = finalized.body.data.orderId as string;
  const grandTotalUsd = finalized.body.data.grandTotalUsd as number;
  const grandTotalKhr = finalized.body.data.grandTotalKhr as number;

  const requested = await request(input.app)
    .post(`/v0/sales/${saleId}/void/request`)
    .set("Authorization", `Bearer ${input.authToken}`)
    .set("Idempotency-Key", `sale-order-void-queue-request-${uniqueSuffix()}`)
    .send({ reason: input.reason });
  expect(requested.status).toBe(200);
  expect(requested.body.data.status).toBe("PENDING");

  return {
    saleId,
    orderId,
    grandTotalUsd,
    grandTotalKhr,
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

  it("rejects generic deferred open-ticket order placement without creating writes", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const response = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-disabled-place-${uniqueSuffix()}`)
      .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId }));

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      success: false,
      code: "ORDER_OPEN_TICKET_DISABLED",
    });

    const orderCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_order_tickets
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(orderCount.rows[0]?.count ?? "0")).toBe(0);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'order.place'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(0);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'order.place'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(0);
  });

  it("creates manual external-payment-claim orders while generic pay-later stays disabled", async () => {
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
      .set("Idempotency-Key", `sale-order-manual-claim-place-${uniqueSuffix()}`)
      .send(buildManualClaimOrderPayload({ menuItemId: setup.defaultMenuItemId }));

    expect(created.status).toBe(200);
    expect(created.body.success).toBe(true);
    expect(created.body.data).toMatchObject({
      status: "OPEN",
      sourceMode: "MANUAL_EXTERNAL_PAYMENT_CLAIM",
    });
    expect(created.body.data.lines).toHaveLength(1);

    const orderCount = await pool.query<{ count: string; source_mode: string }>(
      `SELECT COUNT(*)::TEXT AS count, MAX(source_mode)::TEXT AS source_mode
       FROM v0_order_tickets
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(orderCount.rows[0]?.count ?? "0")).toBe(1);
    expect(orderCount.rows[0]?.source_mode).toBe("MANUAL_EXTERNAL_PAYMENT_CLAIM");
  });

  it("ignores client-provided price/name snapshots and uses server menu data during direct cash checkout", async () => {
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
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });

    expect(finalized.status).toBe(200);
    expect(finalized.body.success).toBe(true);
    const line = finalized.body.data.orderLines?.[0];
    expect(line.menuItemNameSnapshot).toBe(setup.defaultMenuItemName);
    expect(line.unitPrice).toBe(3.5);
    expect(line.quantity).toBe(2);
    expect(line.lineSubtotal).toBe(7);
  });

  it("finalizes cash checkout from local cart and materializes a checked-out order for fulfillment", async () => {
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
    expect(typeof finalized.body.data.orderId).toBe("string");
    expect(finalized.body.data.order).toMatchObject({
      id: finalized.body.data.orderId,
      status: "CHECKED_OUT",
      sourceMode: "DIRECT_CHECKOUT",
    });
    expect(finalized.body.data.batch).toMatchObject({
      orderId: finalized.body.data.orderId,
      status: "PENDING",
    });
    expect(Array.isArray(finalized.body.data.orderLines)).toBe(true);
    expect(finalized.body.data.orderLines.length).toBe(1);

    const orderRow = await pool.query<{
      id: string;
      status: string;
      source_mode: string;
    }>(
      `SELECT id, status, source_mode
       FROM v0_order_tickets
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [setup.tenantId, setup.branchId]
    );
    expect(orderRow.rows).toHaveLength(1);
    expect(orderRow.rows[0]).toMatchObject({
      id: finalized.body.data.orderId,
      status: "CHECKED_OUT",
      source_mode: "DIRECT_CHECKOUT",
    });

    const listed = await request(app)
      .get("/v0/orders?status=CHECKED_OUT")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(listed.status).toBe(200);
    const listedOrder = listed.body.data.items.find(
      (item: { id: string }) => item.id === finalized.body.data.orderId
    ) as { fulfillmentStatus: string | null } | undefined;
    expect(listedOrder?.fulfillmentStatus).toBe("PENDING");

    const fulfillment = await request(app)
      .patch(`/v0/orders/${finalized.body.data.orderId}/fulfillment`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-cash-checkout-fulfillment-${uniqueSuffix()}`)
      .send({
        status: "PREPARING",
        note: "Started after direct checkout",
      });
    expect(fulfillment.status).toBe(200);
    expect(fulfillment.body.data.status).toBe("PREPARING");
  });

  it("persists KHR snapshots using the configured sale rounding policy", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const cases = [
      {
        label: "nearest-100",
        saleFxRateKhrPerUsd: 4103,
        saleKhrRoundingEnabled: true,
        saleKhrRoundingMode: "NEAREST" as const,
        saleKhrRoundingGranularity: 100,
        expectedGrandTotalKhr: 14400,
      },
      {
        label: "down-100",
        saleFxRateKhrPerUsd: 4103,
        saleKhrRoundingEnabled: true,
        saleKhrRoundingMode: "DOWN" as const,
        saleKhrRoundingGranularity: 100,
        expectedGrandTotalKhr: 14300,
      },
      {
        label: "up-1000",
        saleFxRateKhrPerUsd: 4103,
        saleKhrRoundingEnabled: true,
        saleKhrRoundingMode: "UP" as const,
        saleKhrRoundingGranularity: 1000,
        expectedGrandTotalKhr: 15000,
      },
      {
        label: "disabled",
        saleFxRateKhrPerUsd: 4103,
        saleKhrRoundingEnabled: false,
        saleKhrRoundingMode: "NEAREST" as const,
        saleKhrRoundingGranularity: 100,
        expectedGrandTotalKhr: 14360.5,
      },
    ];

    for (const testCase of cases) {
      const finalized = await request(app)
        .post("/v0/checkout/cash/finalize")
        .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
        .set("Idempotency-Key", `sale-order-khr-rounding-${testCase.label}-${uniqueSuffix()}`)
        .send({
          ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
          saleType: "TAKEAWAY",
          tenderCurrency: "USD",
          cashReceivedTenderAmount: 10,
          saleFxRateKhrPerUsd: testCase.saleFxRateKhrPerUsd,
          saleKhrRoundingEnabled: testCase.saleKhrRoundingEnabled,
          saleKhrRoundingMode: testCase.saleKhrRoundingMode,
          saleKhrRoundingGranularity: testCase.saleKhrRoundingGranularity,
        });

      expect(finalized.status).toBe(200);
      expect(finalized.body.success).toBe(true);
      expect(finalized.body.data.grandTotalUsd).toBe(3.5);
      expect(finalized.body.data.subtotalKhr).toBe(testCase.expectedGrandTotalKhr);
      expect(finalized.body.data.grandTotalKhr).toBe(testCase.expectedGrandTotalKhr);
      expect(finalized.body.data.saleFxRateKhrPerUsd).toBe(testCase.saleFxRateKhrPerUsd);
      expect(finalized.body.data.saleKhrRoundingEnabled).toBe(testCase.saleKhrRoundingEnabled);
      expect(finalized.body.data.saleKhrRoundingMode).toBe(testCase.saleKhrRoundingMode);
      expect(finalized.body.data.saleKhrRoundingGranularity).toBe(
        String(testCase.saleKhrRoundingGranularity)
      );

      const persistedSale = await pool.query<{
        subtotal_khr: number;
        grand_total_khr: number;
      }>(
        `SELECT subtotal_khr::FLOAT8 AS subtotal_khr,
                grand_total_khr::FLOAT8 AS grand_total_khr
         FROM v0_sales
         WHERE tenant_id = $1
           AND branch_id = $2
           AND id = $3`,
        [setup.tenantId, setup.branchId, finalized.body.data.id as string]
      );
      expect(persistedSale.rows).toHaveLength(1);
      expect(persistedSale.rows[0]).toMatchObject({
        subtotal_khr: testCase.expectedGrandTotalKhr,
        grand_total_khr: testCase.expectedGrandTotalKhr,
      });

      const persistedSaleLine = await pool.query<{
        line_total_khr_snapshot: number | null;
      }>(
        `SELECT line_total_khr_snapshot::FLOAT8 AS line_total_khr_snapshot
         FROM v0_sale_lines
         WHERE tenant_id = $1
           AND sale_id = $2`,
        [setup.tenantId, finalized.body.data.id as string]
      );
      expect(persistedSaleLine.rows).toHaveLength(1);
      expect(persistedSaleLine.rows[0]?.line_total_khr_snapshot).toBe(
        testCase.expectedGrandTotalKhr
      );
    }
  });

  it("finalizes cash checkout with modifier group selections", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const sizeGroup = await seedModifierGroupWithOptions({
      pool,
      tenantId: setup.tenantId,
      menuItemId: setup.defaultMenuItemId,
      name: `Size ${uniqueSuffix()}`,
      selectionMode: "SINGLE",
      minSelections: 1,
      maxSelections: 1,
      isRequired: true,
      options: [{ label: "Regular", priceDelta: 0 }],
    });
    const sugarGroup = await seedModifierGroupWithOptions({
      pool,
      tenantId: setup.tenantId,
      menuItemId: setup.defaultMenuItemId,
      name: `Sugar ${uniqueSuffix()}`,
      selectionMode: "SINGLE",
      minSelections: 1,
      maxSelections: 1,
      isRequired: true,
      options: [{ label: "Normal", priceDelta: 0 }],
    });

    const finalized = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-cash-checkout-modifiers-${uniqueSuffix()}`)
      .send({
        items: [
          {
            menuItemId: setup.defaultMenuItemId,
            quantity: 2,
            modifierSelections: [
              {
                groupId: sizeGroup.groupId,
                optionIds: [sizeGroup.optionIds[0]],
              },
              {
                groupId: sugarGroup.groupId,
                optionIds: [sugarGroup.optionIds[0]],
              },
            ],
          },
        ],
        saleType: "TAKEAWAY",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 7,
      });

    expect(finalized.status).toBe(200);
    expect(finalized.body.success).toBe(true);
    expect(finalized.body.data.paymentMethod).toBe("CASH");
    expect(finalized.body.data.orderLines).toHaveLength(1);

    const orderLineSnapshot = finalized.body.data.orderLines[0]?.modifierSnapshot as
      | Array<{ selectedOptions?: unknown[] }>
      | undefined;
    expect(orderLineSnapshot).toHaveLength(2);

    const persistedOrderLine = await pool.query<{ modifier_snapshot: unknown }>(
      `SELECT modifier_snapshot
       FROM v0_order_ticket_lines
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [setup.tenantId]
    );
    expect(persistedOrderLine.rows[0]?.modifier_snapshot).toEqual(orderLineSnapshot);

    const persistedSaleLine = await pool.query<{ modifier_snapshot: unknown }>(
      `SELECT modifier_snapshot
       FROM v0_sale_lines
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [setup.tenantId]
    );
    expect(persistedSaleLine.rows[0]?.modifier_snapshot).toEqual(orderLineSnapshot);
  });

  it("prices shared modifier options per menu item using item-specific effects", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const juiceMenuItemId = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      name: `Orange Juice ${uniqueSuffix()}`,
      basePrice: 3.5,
    });
    const sizeGroup = await seedModifierGroupWithOptions({
      pool,
      tenantId: setup.tenantId,
      menuItemId: setup.defaultMenuItemId,
      name: `Shared Size ${uniqueSuffix()}`,
      selectionMode: "SINGLE",
      minSelections: 1,
      maxSelections: 1,
      isRequired: true,
      options: [{ label: "Large", priceDelta: 0 }],
    });
    await attachModifierGroupToMenuItem({
      pool,
      tenantId: setup.tenantId,
      menuItemId: juiceMenuItemId,
      groupId: sizeGroup.groupId,
    });
    await setMenuItemModifierOptionEffect({
      pool,
      tenantId: setup.tenantId,
      menuItemId: setup.defaultMenuItemId,
      modifierOptionId: sizeGroup.optionIds[0],
      priceDelta: 0.5,
    });
    await setMenuItemModifierOptionEffect({
      pool,
      tenantId: setup.tenantId,
      menuItemId: juiceMenuItemId,
      modifierOptionId: sizeGroup.optionIds[0],
      priceDelta: 1.25,
    });

    const latteSale = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-item-option-price-latte-${uniqueSuffix()}`)
      .send({
        items: [
          {
            menuItemId: setup.defaultMenuItemId,
            quantity: 1,
            modifierSelections: [
              {
                groupId: sizeGroup.groupId,
                optionIds: [sizeGroup.optionIds[0]],
              },
            ],
          },
        ],
        saleType: "TAKEAWAY",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });
    expect(latteSale.status).toBe(200);
    expect(latteSale.body.data.tenderAmount).toBe(4);
    expect(
      latteSale.body.data.orderLines[0]?.modifierSnapshot?.[0]?.selectedOptions?.[0]?.priceDelta
    ).toBe(0.5);

    const juiceSale = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-item-option-price-juice-${uniqueSuffix()}`)
      .send({
        items: [
          {
            menuItemId: juiceMenuItemId,
            quantity: 1,
            modifierSelections: [
              {
                groupId: sizeGroup.groupId,
                optionIds: [sizeGroup.optionIds[0]],
              },
            ],
          },
        ],
        saleType: "TAKEAWAY",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });
    expect(juiceSale.status).toBe(200);
    expect(juiceSale.body.data.tenderAmount).toBe(4.75);
    expect(
      juiceSale.body.data.orderLines[0]?.modifierSnapshot?.[0]?.selectedOptions?.[0]?.priceDelta
    ).toBe(1.25);
  });

  it("deducts tracked inventory from item-specific modifier effects on finalized sale checkout", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const initialOnHandInBaseUnit = 20;
    const quantityDeltaInBaseUnitPerSaleUnit = 3;
    const saleQuantity = 2;
    const createdStockItem = await pool.query<{ id: string }>(
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
      [setup.tenantId, `Modifier Beans ${uniqueSuffix()}`]
    );
    const stockItemId = createdStockItem.rows[0]?.id;
    if (!stockItemId) {
      throw new Error("failed to seed modifier effect stock item");
    }
    await pool.query(
      `INSERT INTO v0_inventory_branch_stock (
         tenant_id,
         branch_id,
         stock_item_id,
         on_hand_in_base_unit,
         last_movement_at
       )
       VALUES ($1, $2, $3, $4, NOW())`,
      [setup.tenantId, setup.branchId, stockItemId, initialOnHandInBaseUnit]
    );

    const sizeGroup = await seedModifierGroupWithOptions({
      pool,
      tenantId: setup.tenantId,
      menuItemId: setup.defaultMenuItemId,
      name: `Tracked Size ${uniqueSuffix()}`,
      selectionMode: "SINGLE",
      minSelections: 1,
      maxSelections: 1,
      isRequired: true,
      options: [{ label: "Large", priceDelta: 0 }],
    });
    await setMenuItemModifierOptionEffect({
      pool,
      tenantId: setup.tenantId,
      menuItemId: setup.defaultMenuItemId,
      modifierOptionId: sizeGroup.optionIds[0],
      priceDelta: 0.75,
      componentDeltas: [
        {
          stockItemId,
          quantityDeltaInBaseUnit: quantityDeltaInBaseUnitPerSaleUnit,
          trackingMode: "TRACKED",
        },
      ],
    });

    const checkedOut = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-item-effect-stock-checkout-${uniqueSuffix()}`)
      .send({
        items: [
          {
            menuItemId: setup.defaultMenuItemId,
            quantity: saleQuantity,
            modifierSelections: [
              {
                groupId: sizeGroup.groupId,
                optionIds: [sizeGroup.optionIds[0]],
              },
            ],
            note: null,
          },
        ],
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 50,
      });
    expect(checkedOut.status).toBe(200);
    const saleId = checkedOut.body.data.id as string;

    await eventBus.publish({
      type: "CHECKOUT_CASH_FINALIZED",
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
      [setup.tenantId, setup.branchId, stockItemId]
    );
    expect(stock.rows[0]?.on_hand_in_base_unit).toBe(
      initialOnHandInBaseUnit - quantityDeltaInBaseUnitPerSaleUnit * saleQuantity
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
       LIMIT 1`,
      [setup.tenantId, setup.branchId, stockItemId, saleId]
    );
    expect(journal.rows[0]).toMatchObject({
      quantity_in_base_unit: quantityDeltaInBaseUnitPerSaleUnit * saleQuantity,
      source_id: saleId,
      reason_code: "SALE_DEDUCTION",
      direction: "OUT",
    });
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
    expect(finalized.body.data.receipt.saleSnapshot.tenderAmount).toBe(7);
    expect(finalized.body.data.receipt.saleSnapshot.paidAmount).toBe(7);
    expect(finalized.body.data.receipt.saleSnapshot.cashReceivedTenderAmount).toBe(10);
    expect(finalized.body.data.receipt.saleSnapshot.cashChangeTenderAmount).toBe(3);
    expect(Array.isArray(finalized.body.data.receipt.lines)).toBe(true);
    expect(finalized.body.data.receipt.lines.length).toBe(1);

    const receiptRead = await request(app)
      .get(`/v0/receipts/${saleId}`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);

    expect(receiptRead.status).toBe(200);
    expect(receiptRead.body.data.receiptId).toBe(saleId);
    expect(receiptRead.body.data.saleSnapshot.paymentMethod).toBe("CASH");
    expect(receiptRead.body.data.saleSnapshot.tenderCurrency).toBe("USD");
    expect(receiptRead.body.data.saleSnapshot.tenderAmount).toBe(7);
    expect(receiptRead.body.data.saleSnapshot.paidAmount).toBe(7);
    expect(receiptRead.body.data.saleSnapshot.cashReceivedTenderAmount).toBe(10);
    expect(receiptRead.body.data.saleSnapshot.cashChangeTenderAmount).toBe(3);
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

  it("allows cashier to finalize direct cash checkout and list the resulting fulfillment order", async () => {
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

    const finalized = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${cashier.branchToken}`)
      .set("Idempotency-Key", `sale-order-cashier-checkout-allowed-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });
    expect(finalized.status).toBe(200);
    expect(finalized.body.success).toBe(true);
    expect(finalized.body.data.status).toBe("FINALIZED");
    expect(finalized.body.data.paymentMethod).toBe("CASH");

    const orderId = finalized.body.data.orderId as string;
    const saleId = finalized.body.data.id as string;

    const listed = await request(app)
      .get("/v0/orders?status=CHECKED_OUT")
      .set("Authorization", `Bearer ${cashier.branchToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.success).toBe(true);

    const listedOrder = listed.body.data.items.find(
      (item: { id: string }) => item.id === orderId
    ) as
      | {
          status: string;
          sourceMode: string;
          saleId: string | null;
          saleStatus: string | null;
          paymentMethod: string | null;
          fulfillmentStatus: string | null;
        }
      | undefined;
    expect(listedOrder).toMatchObject({
      status: "CHECKED_OUT",
      sourceMode: "DIRECT_CHECKOUT",
      saleId,
      saleStatus: "FINALIZED",
      paymentMethod: "CASH",
      fulfillmentStatus: "PENDING",
    });
  });

  it("includes latest fulfillment status in direct-checkout order list summaries", async () => {
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
      .set("Idempotency-Key", `sale-order-fulfillment-list-direct-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });
    expect(finalized.status).toBe(200);
    const orderId = finalized.body.data.orderId as string;
    const saleId = finalized.body.data.id as string;

    const initialList = await request(app)
      .get("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(initialList.status).toBe(200);
    const initialOrder = initialList.body.data.items.find(
      (item: { id: string }) => item.id === orderId
    ) as
      | {
          fulfillmentStatus: string | null;
          totalUsdExact: number;
          linesPreview: Array<{
            menuItemNameSnapshot: string;
            quantity: number;
            modifierLabels: string[];
          }>;
          checkedOutAt: string | null;
          saleId: string | null;
          saleStatus: string | null;
          paymentMethod: string | null;
        }
      | undefined;
    expect(initialOrder).toMatchObject({
      fulfillmentStatus: "PENDING",
      totalUsdExact: 3.5,
      checkedOutAt: expect.any(String),
      saleId,
      saleStatus: "FINALIZED",
      paymentMethod: "CASH",
    });
    expect(initialOrder?.linesPreview).toEqual([
      {
        menuItemNameSnapshot: setup.defaultMenuItemName,
        quantity: 1,
        modifierLabels: [],
      },
    ]);

    const updated = await request(app)
      .patch(`/v0/orders/${orderId}/fulfillment`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-fulfillment-list-update-${uniqueSuffix()}`)
      .send({
        status: "PREPARING",
        note: "Started by kitchen",
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.status).toBe("PREPARING");

    const listed = await request(app)
      .get("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(listed.status).toBe(200);
    const order = listed.body.data.items.find(
      (item: { id: string }) => item.id === orderId
    ) as { fulfillmentStatus: string | null; totalUsdExact: number } | undefined;
    expect(order?.fulfillmentStatus).toBe("PREPARING");
    expect(order?.totalUsdExact).toBe(3.5);
  });

  it("lists active fulfillment work across direct-checkout orders only", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const activeCheckout = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-fulfillment-view-active-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        saleType: "TAKEAWAY",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });
    expect(activeCheckout.status).toBe(200);
    const activeOrderId = activeCheckout.body.data.orderId as string;

    const completedCheckout = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-fulfillment-view-completed-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });
    expect(completedCheckout.status).toBe(200);
    const completedOrderId = completedCheckout.body.data.orderId as string;

    const cancelledCheckout = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-fulfillment-view-cancelled-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });
    expect(cancelledCheckout.status).toBe(200);
    const cancelledOrderId = cancelledCheckout.body.data.orderId as string;

    const completedFulfillment = await request(app)
      .patch(`/v0/orders/${completedOrderId}/fulfillment`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-fulfillment-view-completed-batch-${uniqueSuffix()}`)
      .send({
        status: "COMPLETED",
        note: "Already finished",
      });
    expect(completedFulfillment.status).toBe(200);

    const cancelledFulfillment = await request(app)
      .patch(`/v0/orders/${cancelledOrderId}/fulfillment`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-fulfillment-view-cancelled-batch-${uniqueSuffix()}`)
      .send({
        status: "CANCELLED",
        note: "Stopped before preparation",
      });
    expect(cancelledFulfillment.status).toBe(200);

    const listed = await request(app)
      .get("/v0/orders?view=FULFILLMENT_ACTIVE")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.success).toBe(true);

    const listedIds = listed.body.data.items.map((item: { id: string }) => item.id);
    expect(listedIds).toContain(activeOrderId);
    expect(listedIds).not.toContain(completedOrderId);
    expect(listedIds).not.toContain(cancelledOrderId);

    const checkedOutOnly = await request(app)
      .get("/v0/orders?view=FULFILLMENT_ACTIVE&status=CHECKED_OUT")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(checkedOutOnly.status).toBe(200);
    const checkedOutIds = checkedOutOnly.body.data.items.map((item: { id: string }) => item.id);
    expect(checkedOutIds).toContain(activeOrderId);
    expect(checkedOutIds).not.toContain(completedOrderId);
  });

  it("lists dedicated void reviewer queue rows with queue metadata and status filters", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
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

    const pendingSale = await finalizeCashSaleAndRequestVoid({
      app,
      authToken: cashier.branchToken,
      menuItemId: setup.defaultMenuItemId,
      reason: "Pending reviewer queue item",
    });
    const approvedSale = await finalizeCashSaleAndRequestVoid({
      app,
      authToken: cashier.branchToken,
      menuItemId: setup.defaultMenuItemId,
      reason: "Approved reviewer queue item",
    });
    const rejectedSale = await finalizeCashSaleAndRequestVoid({
      app,
      authToken: cashier.branchToken,
      menuItemId: setup.defaultMenuItemId,
      reason: "Rejected reviewer queue item",
    });

    const approved = await request(app)
      .post(`/v0/sales/${approvedSale.saleId}/void/approve`)
      .set("Authorization", `Bearer ${manager.branchToken}`)
      .set("Idempotency-Key", `sale-order-void-queue-approve-${uniqueSuffix()}`)
      .send({ note: "Approved in queue flow" });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("APPROVED");

    const rejected = await request(app)
      .post(`/v0/sales/${rejectedSale.saleId}/void/reject`)
      .set("Authorization", `Bearer ${manager.branchToken}`)
      .set("Idempotency-Key", `sale-order-void-queue-reject-${uniqueSuffix()}`)
      .send({ note: "Rejected in queue flow" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe("REJECTED");

    const pendingQueue = await request(app)
      .get("/v0/sales/void-requests")
      .set("Authorization", `Bearer ${manager.branchToken}`);
    expect(pendingQueue.status).toBe(200);
    expect(pendingQueue.body.data.total).toBe(1);
    expect(pendingQueue.body.data.items).toHaveLength(1);
    expect(pendingQueue.body.data.items[0]).toMatchObject({
      voidRequestId: expect.any(String),
      saleId: pendingSale.saleId,
      orderId: pendingSale.orderId,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      branchName: expect.any(String),
      saleStatus: "FINALIZED",
      voidRequestStatus: "PENDING",
      requestedAt: expect.any(String),
      requestedByAccountId: cashier.accountId,
      requestedByDisplayName: "Sale Order",
      reason: "Pending reviewer queue item",
      paymentMethod: "CASH",
      grandTotalUsd: pendingSale.grandTotalUsd,
      grandTotalKhr: pendingSale.grandTotalKhr,
      fulfillmentStatus: "PENDING",
      saleCreatedAt: expect.any(String),
    });

    const approvedQueue = await request(app)
      .get("/v0/sales/void-requests?status=APPROVED")
      .set("Authorization", `Bearer ${manager.branchToken}`);
    expect(approvedQueue.status).toBe(200);
    expect(approvedQueue.body.data.total).toBe(1);
    expect(approvedQueue.body.data.items[0]).toMatchObject({
      saleId: approvedSale.saleId,
      saleStatus: "FINALIZED",
      voidRequestStatus: "APPROVED",
      reason: "Approved reviewer queue item",
    });

    const rejectedQueue = await request(app)
      .get("/v0/sales/void-requests?status=REJECTED")
      .set("Authorization", `Bearer ${manager.branchToken}`);
    expect(rejectedQueue.status).toBe(200);
    expect(rejectedQueue.body.data.total).toBe(1);
    expect(rejectedQueue.body.data.items[0]).toMatchObject({
      saleId: rejectedSale.saleId,
      saleStatus: "FINALIZED",
      voidRequestStatus: "REJECTED",
      reason: "Rejected reviewer queue item",
    });

    const allQueue = await request(app)
      .get("/v0/sales/void-requests?status=ALL")
      .set("Authorization", `Bearer ${manager.branchToken}`);
    expect(allQueue.status).toBe(200);
    expect(allQueue.body.data.total).toBe(3);
    expect(
      (allQueue.body.data.items as Array<{ saleId: string; voidRequestStatus: string }>).map(
        (item) => `${item.saleId}:${item.voidRequestStatus}`
      )
    ).toEqual(
      expect.arrayContaining([
        `${pendingSale.saleId}:PENDING`,
        `${approvedSale.saleId}:APPROVED`,
        `${rejectedSale.saleId}:REJECTED`,
      ])
    );

    const invalidStatus = await request(app)
      .get("/v0/sales/void-requests?status=NOT_A_STATUS")
      .set("Authorization", `Bearer ${manager.branchToken}`);
    expect(invalidStatus.status).toBe(422);
    expect(invalidStatus.body).toMatchObject({
      success: false,
      code: "VOID_REQUEST_STATUS_INVALID",
    });
  }, 15_000);

  it("restricts dedicated void reviewer queue to reviewer roles", async () => {
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

    await finalizeCashSaleAndRequestVoid({
      app,
      authToken: setup.ownerBranchToken,
      menuItemId: setup.defaultMenuItemId,
      reason: "Reviewer-only queue access guard",
    });

    const queueRead = await request(app)
      .get("/v0/sales/void-requests")
      .set("Authorization", `Bearer ${cashier.branchToken}`);
    expect(queueRead.status).toBe(403);
  });

  it("rejects invalid and still-disabled pay-later order list views", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    for (const view of ["NOT_A_REAL_VIEW", "PAY_LATER_EDITABLE"]) {
      const listed = await request(app)
        .get(`/v0/orders?view=${view}`)
        .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
      expect(listed.status).toBe(422);
      expect(listed.body).toMatchObject({
        success: false,
        code: "ORDER_LIST_VIEW_INVALID",
      });
    }
  });

  it("rejects invalid and still-disabled generic sourceMode filters", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    for (const sourceMode of ["NOT_A_REAL_SOURCE_MODE", "STANDARD"]) {
      const listed = await request(app)
        .get(`/v0/orders?sourceMode=${sourceMode}`)
        .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
      expect(listed.status).toBe(422);
      expect(listed.body).toMatchObject({
        success: false,
        code: "ORDER_LIST_SOURCE_MODE_INVALID",
      });
    }
  });

  it("restores manual-claim review and sourceMode order read surfaces without exposing dormant standard orders", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });

    const legacyOrderId = await seedDormantLegacyOrder({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      openedByAccountId: setup.ownerAccountId,
      sourceMode: "STANDARD",
    });
    const claimOrderId = await seedDormantLegacyOrder({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      openedByAccountId: setup.ownerAccountId,
      sourceMode: "MANUAL_EXTERNAL_PAYMENT_CLAIM",
    });

    const finalized = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-direct-visible-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });
    expect(finalized.status).toBe(200);
    const directOrderId = finalized.body.data.orderId as string;

    const listed = await request(app)
      .get("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(listed.status).toBe(200);
    const listedIds = listed.body.data.items.map((item: { id: string }) => item.id);
    expect(listedIds).toContain(directOrderId);
    expect(listedIds).not.toContain(legacyOrderId);
    expect(listedIds).not.toContain(claimOrderId);

    const claimReview = await request(app)
      .get("/v0/orders?view=MANUAL_CLAIM_REVIEW")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(claimReview.status).toBe(200);
    const claimReviewIds = claimReview.body.data.items.map((item: { id: string }) => item.id);
    expect(claimReviewIds).toContain(claimOrderId);
    expect(claimReviewIds).not.toContain(legacyOrderId);
    expect(claimReviewIds).not.toContain(directOrderId);

    const claimSourceOnly = await request(app)
      .get("/v0/orders?sourceMode=MANUAL_EXTERNAL_PAYMENT_CLAIM")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(claimSourceOnly.status).toBe(200);
    const claimSourceIds = claimSourceOnly.body.data.items.map((item: { id: string }) => item.id);
    expect(claimSourceIds).toContain(claimOrderId);
    expect(claimSourceIds).not.toContain(legacyOrderId);
    expect(claimSourceIds).not.toContain(directOrderId);

    const legacyDetail = await request(app)
      .get(`/v0/orders/${legacyOrderId}`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(legacyDetail.status).toBe(404);
    expect(legacyDetail.body).toMatchObject({
      success: false,
      code: "ORDER_NOT_FOUND",
    });

    const claimDetail = await request(app)
      .get(`/v0/orders/${claimOrderId}`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(claimDetail.status).toBe(200);
    expect(claimDetail.body.data).toMatchObject({
      id: claimOrderId,
      sourceMode: "MANUAL_EXTERNAL_PAYMENT_CLAIM",
      saleId: null,
      saleStatus: null,
      paymentMethod: null,
    });
    expect(Array.isArray(claimDetail.body.data.manualPaymentClaims)).toBe(true);

    const legacyFulfillment = await request(app)
      .patch(`/v0/orders/${legacyOrderId}/fulfillment`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-legacy-fulfillment-${uniqueSuffix()}`)
      .send({
        status: "PREPARING",
        note: "Should stay hidden",
      });
    expect(legacyFulfillment.status).toBe(404);
    expect(legacyFulfillment.body).toMatchObject({
      success: false,
      code: "ORDER_NOT_FOUND",
    });
  });

  it("keeps generic deferred mutations disabled on manual-claim orders", async () => {
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
      .set("Idempotency-Key", `sale-order-disabled-manual-mutations-place-${uniqueSuffix()}`)
      .send(buildManualClaimOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(created.status).toBe(200);
    const orderId = created.body.data.id as string;

    const mutationResponses = await Promise.all([
      request(app)
        .post(`/v0/orders/${orderId}/items`)
        .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
        .set("Idempotency-Key", `sale-order-disabled-add-${uniqueSuffix()}`)
        .send(buildOrderPayload({ menuItemId: setup.defaultMenuItemId })),
      request(app)
        .post(`/v0/orders/${orderId}/cancel`)
        .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
        .set("Idempotency-Key", `sale-order-disabled-cancel-${uniqueSuffix()}`)
        .send({ reason: "Deferred flow removed" }),
      request(app)
        .post(`/v0/orders/${orderId}/checkout`)
        .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
        .set("Idempotency-Key", `sale-order-disabled-checkout-${uniqueSuffix()}`)
        .send({
          paymentMethod: "CASH",
          tenderCurrency: "USD",
          cashReceivedTenderAmount: 10,
        }),
    ]);

    for (const response of mutationResponses) {
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        success: false,
        code: "ORDER_OPEN_TICKET_DISABLED",
      });
    }
  });

  it("creates and lists manual payment claims on manual-claim orders and links payment-proof uploads", async () => {
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
      .set("Idempotency-Key", `sale-order-manual-claim-create-order-${uniqueSuffix()}`)
      .send(buildManualClaimOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const proofImageUrl = `/images/${setup.tenantId}/payment-proof/uploaded-${uniqueSuffix()}.png`;
    await seedPendingMediaUpload({
      pool,
      tenantId: setup.tenantId,
      area: "payment-proof",
      imageUrl: proofImageUrl,
      uploadedByAccountId: setup.ownerAccountId,
    });

    const createdClaim = await request(app)
      .post(`/v0/orders/${orderId}/manual-payment-claims`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-manual-claim-create-${uniqueSuffix()}`)
      .send(buildManualPaymentClaimPayload({ proofImageUrl }));
    expect(createdClaim.status).toBe(200);
    expect(createdClaim.body.success).toBe(true);
    expect(createdClaim.body.data).toMatchObject({
      orderId,
      status: "PENDING",
      proofImageUrl,
      claimedPaymentMethod: "KHQR",
    });

    const uploadRow = await pool.query<{
      status: string;
      linked_entity_type: string | null;
      linked_entity_id: string | null;
    }>(
      `SELECT status, linked_entity_type, linked_entity_id
       FROM v0_media_uploads
       WHERE tenant_id = $1
         AND area = 'payment-proof'
         AND image_url = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [setup.tenantId, proofImageUrl]
    );
    expect(uploadRow.rows[0]).toMatchObject({
      status: "LINKED",
      linked_entity_type: "order_manual_payment_claim",
      linked_entity_id: createdClaim.body.data.id as string,
    });

    const claimList = await request(app)
      .get(`/v0/orders/${orderId}/manual-payment-claims`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(claimList.status).toBe(200);
    expect(claimList.body.success).toBe(true);
    expect(Array.isArray(claimList.body.data)).toBe(true);
    expect(claimList.body.data[0]).toMatchObject({
      id: createdClaim.body.data.id,
      status: "PENDING",
    });

    const claimReview = await request(app)
      .get("/v0/orders?view=MANUAL_CLAIM_REVIEW")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(claimReview.status).toBe(200);
    const listedOrder = claimReview.body.data.items.find(
      (item: { id: string }) => item.id === orderId
    ) as
      | {
          manualPaymentClaimId: string | null;
          manualPaymentClaimStatus: string | null;
          paymentMethod: string | null;
        }
      | undefined;
    expect(listedOrder).toMatchObject({
      manualPaymentClaimId: createdClaim.body.data.id,
      manualPaymentClaimStatus: "PENDING",
      paymentMethod: null,
    });
  });

  it("lets reviewer approve manual KHQR claim into finalized sale without cash movement", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const sessionId = await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
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
      .send(buildManualClaimOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const createdClaim = await request(app)
      .post(`/v0/orders/${orderId}/manual-payment-claims`)
      .set("Authorization", `Bearer ${cashier.branchToken}`)
      .set("Idempotency-Key", `sale-order-manual-approve-claim-${uniqueSuffix()}`)
      .send(buildManualPaymentClaimPayload({
        proofImageUrl: `https://example.com/proof-approve-${uniqueSuffix()}.png`,
      }));
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
      expect(approved.body.data).toMatchObject({
        status: "FINALIZED",
        paymentMethod: "KHQR",
        order: {
          id: orderId,
          status: "CHECKED_OUT",
        },
        manualPaymentClaim: {
          id: claimId,
          status: "APPROVED",
        },
      });
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

  it("lets reviewer reject manual claims and keeps the order open for review", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      accountId: setup.ownerAccountId,
    });
    const manager = await setupMemberBranchContext({
      app,
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "MANAGER",
    });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-manual-reject-place-${uniqueSuffix()}`)
      .send(buildManualClaimOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(200);
    const orderId = placed.body.data.id as string;

    const createdClaim = await request(app)
      .post(`/v0/orders/${orderId}/manual-payment-claims`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-manual-reject-claim-${uniqueSuffix()}`)
      .send(buildManualPaymentClaimPayload({
        proofImageUrl: `https://example.com/proof-reject-${uniqueSuffix()}.png`,
      }));
    expect(createdClaim.status).toBe(200);
    const claimId = createdClaim.body.data.id as string;

    const rejected = await request(app)
      .post(`/v0/orders/${orderId}/manual-payment-claims/${claimId}/reject`)
      .set("Authorization", `Bearer ${manager.branchToken}`)
      .set("Idempotency-Key", `sale-order-manual-reject-manager-${uniqueSuffix()}`)
      .send({ note: "Proof was insufficient" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data).toMatchObject({
      id: claimId,
      status: "REJECTED",
      reviewNote: "Proof was insufficient",
    });

    const orderDetail = await request(app)
      .get(`/v0/orders/${orderId}`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(orderDetail.status).toBe(200);
    expect(orderDetail.body.data).toMatchObject({
      id: orderId,
      status: "OPEN",
      sourceMode: "MANUAL_EXTERNAL_PAYMENT_CLAIM",
      saleId: null,
      saleStatus: null,
      paymentMethod: null,
    });
    expect(orderDetail.body.data.manualPaymentClaims[0]).toMatchObject({
      id: claimId,
      status: "REJECTED",
    });

    const claimReview = await request(app)
      .get("/v0/orders?view=MANUAL_CLAIM_REVIEW")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(claimReview.status).toBe(200);
    const listedOrder = claimReview.body.data.items.find(
      (item: { id: string }) => item.id === orderId
    ) as
      | {
          manualPaymentClaimId: string | null;
          manualPaymentClaimStatus: string | null;
        }
      | undefined;
    expect(listedOrder).toMatchObject({
      manualPaymentClaimId: claimId,
      manualPaymentClaimStatus: "REJECTED",
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
    expect(typeof confirmed.body.data.sale.orderId).toBe("string");

    const directCheckoutOrderId = confirmed.body.data.sale.orderId as string;
    const directCheckoutOrder = await pool.query<{
      id: string;
      status: string;
      source_mode: string;
    }>(
      `SELECT id, status, source_mode
       FROM v0_order_tickets
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3`,
      [setup.tenantId, setup.branchId, directCheckoutOrderId]
    );
    expect(directCheckoutOrder.rows[0]).toMatchObject({
      id: directCheckoutOrderId,
      status: "CHECKED_OUT",
      source_mode: "DIRECT_CHECKOUT",
    });

    const listed = await request(app)
      .get("/v0/orders?status=CHECKED_OUT")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(listed.status).toBe(200);
    const listedOrder = listed.body.data.items.find(
      (item: { id: string }) => item.id === directCheckoutOrderId
    ) as { fulfillmentStatus: string | null } | undefined;
    expect(listedOrder?.fulfillmentStatus).toBe("PENDING");

    const finalizedIntent = await pool.query<{ status: string; saleId: string | null }>(
      `SELECT status, sale_id AS "saleId"
       FROM v0_payment_intents
       WHERE id = $1`,
      [paymentIntentId]
    );
    expect(finalizedIntent.rows[0]?.status).toBe("FINALIZED");
    expect(typeof finalizedIntent.rows[0]?.saleId).toBe("string");

    const finalizedSale = await request(app)
      .get(`/v0/sales/${finalizedIntent.rows[0]?.saleId}`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(finalizedSale.status).toBe(200);
    expect(finalizedSale.body.data.orderId).toBe(directCheckoutOrderId);

    const fulfillment = await request(app)
      .patch(`/v0/orders/${directCheckoutOrderId}/fulfillment`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-checkout-fulfillment-${uniqueSuffix()}`)
      .send({
        status: "PREPARING",
        note: "Started after KHQR direct checkout confirm",
      });
    expect(fulfillment.status).toBe(200);
    expect(fulfillment.body.data.status).toBe("PREPARING");
  });

  it("initiates KHQR intent from local cart and finalizes on webhook with a fulfillable order anchor", async () => {
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
      .set("Idempotency-Key", `sale-order-khqr-checkout-webhook-init-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        saleType: "TAKEAWAY",
        tenderCurrency: "USD",
        expiresInSeconds: 180,
      });

    expect(initiated.status).toBe(200);
    const md5 = initiated.body.data.attempt.md5 as string;

    const webhook = await request(app)
      .post("/v0/payments/khqr/webhooks/provider")
      .set("x-khqr-webhook-secret", process.env.V0_KHQR_WEBHOOK_SECRET ?? "dev-khqr-webhook-secret")
      .send({
        tenantId: setup.tenantId,
        branchId: setup.branchId,
        md5,
        providerEventId: `evt-direct-${uniqueSuffix()}`,
        providerTxHash: `tx-direct-${uniqueSuffix()}`,
        providerReference: "bakong-direct-checkout",
        verificationStatus: "CONFIRMED",
        confirmedAmount: 3.5,
        confirmedCurrency: "USD",
        confirmedToAccountId: "khqr-receiver",
        occurredAt: new Date().toISOString(),
      });

    expect(webhook.status).toBe(200);
    expect(webhook.body.success).toBe(true);
    expect(webhook.body.data.saleFinalized).toBe(true);
    expect(webhook.body.data.sale.status).toBe("FINALIZED");
    expect(typeof webhook.body.data.sale.orderId).toBe("string");

    const directCheckoutOrderId = webhook.body.data.sale.orderId as string;
    const directCheckoutOrder = await pool.query<{
      id: string;
      status: string;
      source_mode: string;
    }>(
      `SELECT id, status, source_mode
       FROM v0_order_tickets
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3`,
      [setup.tenantId, setup.branchId, directCheckoutOrderId]
    );
    expect(directCheckoutOrder.rows[0]).toMatchObject({
      id: directCheckoutOrderId,
      status: "CHECKED_OUT",
      source_mode: "DIRECT_CHECKOUT",
    });

    const listed = await request(app)
      .get("/v0/orders?status=CHECKED_OUT")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(listed.status).toBe(200);
    const listedOrder = listed.body.data.items.find(
      (item: { id: string }) => item.id === directCheckoutOrderId
    ) as { fulfillmentStatus: string | null } | undefined;
    expect(listedOrder?.fulfillmentStatus).toBe("PENDING");

    const fulfillment = await request(app)
      .patch(`/v0/orders/${directCheckoutOrderId}/fulfillment`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-checkout-webhook-fulfillment-${uniqueSuffix()}`)
      .send({
        status: "PREPARING",
        note: "Started after KHQR direct checkout webhook",
      });
    expect(fulfillment.status).toBe(200);
    expect(fulfillment.body.data.status).toBe("PREPARING");
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

  it("rejects manual external-payment-claim order placement when no active cash session exists", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });

    const placed = await request(app)
      .post("/v0/orders")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-no-session-place-${uniqueSuffix()}`)
      .send(buildManualClaimOrderPayload({ menuItemId: setup.defaultMenuItemId }));
    expect(placed.status).toBe(422);
    expect(placed.body).toMatchObject({
      success: false,
      code: "ORDER_REQUIRES_OPEN_CASH_SESSION",
    });
  });

  it("rejects KHQR intent initiation when no active cash session exists", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });

    const initiated = await request(app)
      .post("/v0/checkout/khqr/initiate")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-no-session-initiate-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        tenderCurrency: "USD",
      });

    expect(initiated.status).toBe(422);
    expect(initiated.body).toMatchObject({
      success: false,
      code: "SALE_CHECKOUT_REQUIRES_OPEN_CASH_SESSION",
    });
  });

  it("rejects KHQR intent initiation when branch receiver account is not configured", async () => {
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

    const initiated = await request(app)
      .post("/v0/checkout/khqr/initiate")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `sale-order-khqr-missing-receiver-initiate-${uniqueSuffix()}`)
      .send({
        ...buildCheckoutCartPayload({ menuItemId: setup.defaultMenuItemId, quantity: 1 }),
        tenderCurrency: "USD",
      });

    expect(initiated.status).toBe(422);
    expect(initiated.body).toMatchObject({
      success: false,
      code: "KHQR_BRANCH_RECEIVER_NOT_CONFIGURED",
    });
  });
});

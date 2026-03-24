import { randomUUID } from "crypto";
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
import { bootstrapV0ReportingModule } from "../modules/v0/reporting/index.js";
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

async function registerAndLogin(input: {
  app: express.Express;
  phone: string;
  firstName: string;
  lastName: string;
}): Promise<string> {
  const registerRes = await request(input.app).post("/v0/auth/register").send({
    phone: input.phone,
    password: "Test123!",
    firstName: input.firstName,
    lastName: input.lastName,
  });
  expect(registerRes.status).toBe(201);

  await request(input.app).post("/v0/auth/otp/send").send({ phone: input.phone });
  await request(input.app)
    .post("/v0/auth/otp/verify")
    .send({ phone: input.phone, otp: "123456" });

  const loginRes = await request(input.app).post("/v0/auth/login").send({
    phone: input.phone,
    password: "Test123!",
  });
  expect(loginRes.status).toBe(200);
  return loginRes.body.data.accessToken as string;
}

async function setupOwnerTenantWithTwoBranches(input: {
  app: express.Express;
  pool: Pool;
  tenantName: string;
}): Promise<{
  ownerAccountId: string;
  tenantId: string;
  branchAId: string;
  branchBId: string;
  ownerToken: string;
  ownerTenantToken: string;
  ownerBranchAToken: string;
  ownerBranchBToken: string;
}> {
  const ownerPhone = uniquePhone();
  const ownerToken = await registerAndLogin({
    app: input.app,
    phone: ownerPhone,
    firstName: "Report",
    lastName: "Owner",
  });

  const createdTenant = await request(input.app)
    .post("/v0/auth/tenants")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantName: input.tenantName });
  expect(createdTenant.status).toBe(201);
  const tenantId = createdTenant.body.data.tenant.id as string;

  const ownerAccountQuery = await input.pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE phone = $1 LIMIT 1`,
    [ownerPhone]
  );
  const ownerAccountId = ownerAccountQuery.rows[0]?.id;
  expect(ownerAccountId).toBeTruthy();

  const ownerMembershipId = await findActiveOwnerMembershipId({
    pool: input.pool,
    tenantId,
    accountId: ownerAccountId!,
  });

  const branchAId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: `Reporting Branch A ${uniqueSuffix()}`,
  });
  const branchBId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: `Reporting Branch B ${uniqueSuffix()}`,
  });

  await assignActiveBranch({
    pool: input.pool,
    tenantId,
    branchId: branchAId,
    accountId: ownerAccountId!,
    membershipId: ownerMembershipId,
  });
  await assignActiveBranch({
    pool: input.pool,
    tenantId,
    branchId: branchBId,
    accountId: ownerAccountId!,
    membershipId: ownerMembershipId,
  });
  await seedDefaultBranchEntitlements({
    pool: input.pool,
    tenantId,
    branchId: branchAId,
  });
  await seedDefaultBranchEntitlements({
    pool: input.pool,
    tenantId,
    branchId: branchBId,
  });

  const tenantSelected = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantId });
  expect(tenantSelected.status).toBe(200);
  const ownerTenantToken = tenantSelected.body.data.accessToken as string;

  const branchASelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${ownerTenantToken}`)
    .send({ branchId: branchAId });
  expect(branchASelected.status).toBe(200);

  const branchBSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${ownerTenantToken}`)
    .send({ branchId: branchBId });
  expect(branchBSelected.status).toBe(200);

  return {
    ownerAccountId: ownerAccountId!,
    tenantId,
    branchAId,
    branchBId,
    ownerToken,
    ownerTenantToken,
    ownerBranchAToken: branchASelected.body.data.accessToken as string,
    ownerBranchBToken: branchBSelected.body.data.accessToken as string,
  };
}

async function setupMemberBranchContext(input: {
  app: express.Express;
  pool: Pool;
  tenantId: string;
  roleKey: "ADMIN" | "MANAGER";
  assignedBranchIds: string[];
  selectedBranchId: string;
}): Promise<{
  accountId: string;
  membershipId: string;
  tenantToken: string;
  branchToken: string;
}> {
  const phone = uniquePhone();
  const accountToken = await registerAndLogin({
    app: input.app,
    phone,
    firstName: input.roleKey,
    lastName: "User",
  });

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

  for (const branchId of input.assignedBranchIds) {
    await assignActiveBranch({
      pool: input.pool,
      tenantId: input.tenantId,
      branchId,
      accountId: accountId!,
      membershipId: membershipId!,
    });
  }

  const tenantSelected = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${accountToken}`)
    .send({ tenantId: input.tenantId });
  expect(tenantSelected.status).toBe(200);
  const tenantToken = tenantSelected.body.data.accessToken as string;

  const branchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${tenantToken}`)
    .send({ branchId: input.selectedBranchId });
  expect(branchSelected.status).toBe(200);

  return {
    accountId: accountId!,
    membershipId: membershipId!,
    tenantToken,
    branchToken: branchSelected.body.data.accessToken as string,
  };
}

async function insertSale(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  finalizedByAccountId: string;
  status: "FINALIZED" | "VOID_PENDING" | "VOIDED";
  grandTotalUsd: number;
  grandTotalKhr: number;
  saleType: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
}): Promise<string> {
  const finalizedAt = new Date();
  const voidedAt = input.status === "VOIDED" ? new Date() : null;

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
       $1, $2, $3,
       'CASH',
       'USD',
       $4::NUMERIC(14,2),
       $4::NUMERIC(14,2),
       0,
       $4::NUMERIC(14,2),
       $5::NUMERIC(14,2),
       0, 0, 0, 0,
       $4::NUMERIC(14,2),
       $5::NUMERIC(14,2),
       4100,
       TRUE,
       'NEAREST',
       100,
       $4::NUMERIC(14,2),
       0,
       0,
       $4::NUMERIC(14,2),
       $4::NUMERIC(14,2),
       $6,
       $7,
       $8,
       $9,
       $10,
       $11
     )
     RETURNING id`,
    [
      input.tenantId,
      input.branchId,
      input.status,
      input.grandTotalUsd,
      input.grandTotalKhr,
      finalizedAt,
      input.finalizedByAccountId,
      voidedAt,
      voidedAt ? input.finalizedByAccountId : null,
      voidedAt ? "voided in integration test" : null,
      input.saleType,
    ]
  );

  return result.rows[0].id;
}

async function insertSaleLine(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  saleId: string;
  menuItemId: string;
  menuItemNameSnapshot: string;
  menuCategoryIdSnapshot?: string | null;
  menuCategoryNameSnapshot?: string | null;
  unitPrice: number;
  quantity: number;
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
       menu_category_id_snapshot,
       menu_category_name_snapshot,
       unit_price,
       quantity,
       line_discount_amount,
       line_total_amount,
       modifier_snapshot
     )
     VALUES (
       $1, $2, $3, NULL, $4, $5, $6, $7,
       $8::NUMERIC(14,2),
       $9::NUMERIC(12,3),
       0,
       $10::NUMERIC(14,2),
       '[]'::JSONB
     )`,
    [
      input.tenantId,
      input.branchId,
      input.saleId,
      input.menuItemId,
      input.menuItemNameSnapshot,
      input.menuCategoryIdSnapshot ?? null,
      input.menuCategoryNameSnapshot ?? null,
      input.unitPrice,
      input.quantity,
      input.lineTotalAmount,
    ]
  );
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
  categoryId?: string | null;
}): Promise<string> {
  const inserted = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_menu_items (tenant_id, name, base_price, category_id, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     RETURNING id`,
    [input.tenantId, input.name, input.basePrice, input.categoryId ?? null]
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

describe("v0 reporting integration", () => {
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
    app.use("/v0/cash", bootstrapV0CashSessionModule(pool).router);
    app.use("/v0", bootstrapV0SaleOrderModule(pool).router);
    app.use("/v0/reports", bootstrapV0ReportingModule(pool).router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("partitions FINALIZED sales from VOID_PENDING and VOIDED totals", async () => {
    const setup = await setupOwnerTenantWithTwoBranches({
      app,
      pool,
      tenantName: `Reporting Tenant ${uniqueSuffix()}`,
    });

    const finalizedSaleId = await insertSale({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      finalizedByAccountId: setup.ownerAccountId,
      status: "FINALIZED",
      grandTotalUsd: 10,
      grandTotalKhr: 41000,
      saleType: "DINE_IN",
    });
    await insertSaleLine({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      saleId: finalizedSaleId,
      menuItemId: randomUUID(),
      menuItemNameSnapshot: "Latte Snapshot",
      menuCategoryNameSnapshot: "Coffee",
      unitPrice: 5,
      quantity: 2,
      lineTotalAmount: 10,
    });

    const voidPendingSaleId = await insertSale({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      finalizedByAccountId: setup.ownerAccountId,
      status: "VOID_PENDING",
      grandTotalUsd: 5,
      grandTotalKhr: 20500,
      saleType: "TAKEAWAY",
    });
    await insertSaleLine({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      saleId: voidPendingSaleId,
      menuItemId: randomUUID(),
      menuItemNameSnapshot: "Mocha Snapshot",
      menuCategoryNameSnapshot: "Coffee",
      unitPrice: 5,
      quantity: 1,
      lineTotalAmount: 5,
    });

    const voidedSaleId = await insertSale({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      finalizedByAccountId: setup.ownerAccountId,
      status: "VOIDED",
      grandTotalUsd: 3,
      grandTotalKhr: 12300,
      saleType: "DELIVERY",
    });
    await insertSaleLine({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      saleId: voidedSaleId,
      menuItemId: randomUUID(),
      menuItemNameSnapshot: "Brownie Snapshot",
      menuCategoryNameSnapshot: "Bakery",
      unitPrice: 3,
      quantity: 1,
      lineTotalAmount: 3,
    });

    const summaryRes = await request(app)
      .get("/v0/reports/sales/summary")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "BRANCH",
      });
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.success).toBe(true);
    expect(summaryRes.body.data.confirmed.transactionCount).toBe(1);
    expect(summaryRes.body.data.confirmed.totalGrandUsd).toBe(10);
    expect(summaryRes.body.data.exceptions.voidPending.count).toBe(1);
    expect(summaryRes.body.data.exceptions.voidPending.totalUsd).toBe(5);
    expect(summaryRes.body.data.exceptions.voided.count).toBe(1);
    expect(summaryRes.body.data.exceptions.voided.totalUsd).toBe(3);
    expect(summaryRes.body.data.scope.branchScope).toBe("BRANCH");
    expect(summaryRes.body.data.scope.branchId).toBe(setup.branchAId);

    const drillDownRes = await request(app)
      .get("/v0/reports/sales/drill-down")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "BRANCH",
        status: "ALL",
        limit: 50,
        offset: 0,
      });
    expect(drillDownRes.status).toBe(200);
    expect(drillDownRes.body.success).toBe(true);
    const statuses = (drillDownRes.body.data.items as Array<{ status: string }>).map(
      (item) => item.status
    );
    expect(statuses).toContain("FINALIZED");
    expect(statuses).toContain("VOID_PENDING");
    expect(statuses).toContain("VOIDED");
  });

  it("keeps historical sales report snapshots stable after menu catalog edits", async () => {
    const setup = await setupOwnerTenantWithTwoBranches({
      app,
      pool,
      tenantName: `Reporting Snapshot Tenant ${uniqueSuffix()}`,
    });

    const category = await pool.query<{ id: string }>(
      `INSERT INTO v0_menu_categories (tenant_id, name, status)
       VALUES ($1, $2, 'ACTIVE')
       RETURNING id`,
      [setup.tenantId, "Original Drinks"]
    );
    const categoryId = category.rows[0].id;

    const menuItem = await pool.query<{ id: string }>(
      `INSERT INTO v0_menu_items (tenant_id, name, base_price, category_id, status)
       VALUES ($1, $2, 2.5, $3, 'ACTIVE')
       RETURNING id`,
      [setup.tenantId, "Original Latte", categoryId]
    );
    const menuItemId = menuItem.rows[0].id;

    const saleId = await insertSale({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      finalizedByAccountId: setup.ownerAccountId,
      status: "FINALIZED",
      grandTotalUsd: 2.5,
      grandTotalKhr: 10250,
      saleType: "TAKEAWAY",
    });
    await insertSaleLine({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      saleId,
      menuItemId,
      menuItemNameSnapshot: "Latte Snapshot Name",
      menuCategoryIdSnapshot: categoryId,
      menuCategoryNameSnapshot: "Category Snapshot Name",
      unitPrice: 2.5,
      quantity: 1,
      lineTotalAmount: 2.5,
    });

    await pool.query(
      `UPDATE v0_menu_items
       SET name = 'Renamed Current Latte',
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2`,
      [setup.tenantId, menuItemId]
    );
    await pool.query(
      `UPDATE v0_menu_categories
       SET name = 'Renamed Current Category',
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2`,
      [setup.tenantId, categoryId]
    );

    const summaryRes = await request(app)
      .get("/v0/reports/sales/summary")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "BRANCH",
        topN: 10,
      });
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.success).toBe(true);

    const topItem = (summaryRes.body.data.topItems as Array<{ menuItemId: string; itemNameSnapshot: string }>).find(
      (item) => item.menuItemId === menuItemId
    );
    expect(topItem?.itemNameSnapshot).toBe("Latte Snapshot Name");
    expect(topItem?.itemNameSnapshot).not.toBe("Renamed Current Latte");

    const categoryEntry = (
      summaryRes.body.data.categoryBreakdown as Array<{ categoryNameSnapshot: string }>
    ).find((item) => item.categoryNameSnapshot === "Category Snapshot Name");
    expect(categoryEntry).toBeTruthy();
  });

  it("uses sale-line category snapshots from real checkout writes in category breakdown", async () => {
    const setup = await setupOwnerTenantWithTwoBranches({
      app,
      pool,
      tenantName: `Reporting Live Category Tenant ${uniqueSuffix()}`,
    });

    const categoryResult = await pool.query<{ id: string }>(
      `INSERT INTO v0_menu_categories (tenant_id, name, status)
       VALUES ($1, $2, 'ACTIVE')
       RETURNING id`,
      [setup.tenantId, "Coffee"]
    );
    const categoryId = categoryResult.rows[0]?.id;
    expect(categoryId).toBeTruthy();

    const menuItemId = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      name: `Category Latte ${uniqueSuffix()}`,
      basePrice: 3.5,
      categoryId,
    });

    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      accountId: setup.ownerAccountId,
    });

    const finalizeRes = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .set("Idempotency-Key", `reporting-category-checkout-${uniqueSuffix()}`)
      .send({
        items: [{ menuItemId, quantity: 2 }],
        saleType: "TAKEAWAY",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
      });
    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.success).toBe(true);

    const persistedSaleLines = await pool.query<{
      menu_category_id_snapshot: string | null;
      menu_category_name_snapshot: string | null;
    }>(
      `SELECT menu_category_id_snapshot, menu_category_name_snapshot
       FROM v0_sale_lines
       WHERE tenant_id = $1
         AND sale_id = $2`,
      [setup.tenantId, finalizeRes.body.data.id as string]
    );
    expect(persistedSaleLines.rows).toHaveLength(1);
    expect(persistedSaleLines.rows[0]).toMatchObject({
      menu_category_id_snapshot: categoryId,
      menu_category_name_snapshot: "Coffee",
    });

    const summaryRes = await request(app)
      .get("/v0/reports/sales/summary")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "BRANCH",
      });
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.success).toBe(true);

    const categoryBreakdown = summaryRes.body.data.categoryBreakdown as Array<{
      categoryNameSnapshot: string;
      quantity: number;
    }>;
    const coffeeEntry = categoryBreakdown.find(
      (item) => item.categoryNameSnapshot === "Coffee"
    );
    expect(coffeeEntry).toBeTruthy();
    expect(coffeeEntry?.quantity).toBe(2);
  });

  it("uses rounded persisted KHR sale snapshots in sales summary and drill-down", async () => {
    const setup = await setupOwnerTenantWithTwoBranches({
      app,
      pool,
      tenantName: `Reporting Rounded KHR Tenant ${uniqueSuffix()}`,
    });

    const menuItemId = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      name: `Rounded Latte ${uniqueSuffix()}`,
      basePrice: 3.5,
    });

    await openCashSession({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      accountId: setup.ownerAccountId,
    });

    const finalizeRes = await request(app)
      .post("/v0/checkout/cash/finalize")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .set("Idempotency-Key", `reporting-rounded-khr-${uniqueSuffix()}`)
      .send({
        items: [{ menuItemId, quantity: 1 }],
        saleType: "TAKEAWAY",
        tenderCurrency: "USD",
        cashReceivedTenderAmount: 10,
        saleFxRateKhrPerUsd: 4103,
        saleKhrRoundingEnabled: true,
        saleKhrRoundingMode: "NEAREST",
        saleKhrRoundingGranularity: 100,
      });
    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.success).toBe(true);
    expect(finalizeRes.body.data.grandTotalKhr).toBe(14400);

    const summaryRes = await request(app)
      .get("/v0/reports/sales/summary")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "BRANCH",
      });
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.success).toBe(true);
    expect(summaryRes.body.data.confirmed.transactionCount).toBe(1);
    expect(summaryRes.body.data.confirmed.totalGrandUsd).toBe(3.5);
    expect(summaryRes.body.data.confirmed.totalGrandKhr).toBe(14400);
    expect(summaryRes.body.data.topItems).toHaveLength(1);
    expect(summaryRes.body.data.topItems[0].revenueUsd).toBe(3.5);
    expect(summaryRes.body.data.topItems[0].revenueKhr).toBe(14400);
    expect(summaryRes.body.data.categoryBreakdown).toHaveLength(1);
    expect(summaryRes.body.data.categoryBreakdown[0].revenueUsd).toBe(3.5);
    expect(summaryRes.body.data.categoryBreakdown[0].revenueKhr).toBe(14400);

    const drillDownRes = await request(app)
      .get("/v0/reports/sales/drill-down")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "BRANCH",
        status: "FINALIZED",
        limit: 20,
        offset: 0,
      });
    expect(drillDownRes.status).toBe(200);
    expect(drillDownRes.body.success).toBe(true);
    expect(drillDownRes.body.data.items).toHaveLength(1);
    expect(drillDownRes.body.data.items[0].grandTotalKhr).toBe(14400);
  });

  it("falls back to report-time FX derivation for historical sale lines without KHR snapshots", async () => {
    const setup = await setupOwnerTenantWithTwoBranches({
      app,
      pool,
      tenantName: `Reporting Historical FX Fallback Tenant ${uniqueSuffix()}`,
    });

    const saleId = await insertSale({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      finalizedByAccountId: setup.ownerAccountId,
      status: "FINALIZED",
      grandTotalUsd: 3,
      grandTotalKhr: 12300,
      saleType: "TAKEAWAY",
    });

    await pool.query(
      `UPDATE v0_sales
       SET sale_fx_rate_khr_per_usd = 4101
       WHERE tenant_id = $1
         AND id = $2`,
      [setup.tenantId, saleId]
    );

    const menuItemId = randomUUID();
    await insertSaleLine({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      saleId,
      menuItemId,
      menuItemNameSnapshot: "Historical Latte Snapshot",
      menuCategoryNameSnapshot: "Coffee",
      unitPrice: 3,
      quantity: 1,
      lineTotalAmount: 3,
    });

    const persistedSaleLine = await pool.query<{
      line_total_khr_snapshot: string | null;
    }>(
      `SELECT line_total_khr_snapshot
       FROM v0_sale_lines
       WHERE tenant_id = $1
         AND sale_id = $2`,
      [setup.tenantId, saleId]
    );
    expect(persistedSaleLine.rows).toHaveLength(1);
    expect(persistedSaleLine.rows[0]?.line_total_khr_snapshot).toBeNull();

    const summaryRes = await request(app)
      .get("/v0/reports/sales/summary")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "BRANCH",
      });
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.success).toBe(true);
    expect(summaryRes.body.data.confirmed.totalGrandKhr).toBe(12300);
    expect(summaryRes.body.data.topItems).toHaveLength(1);
    expect(summaryRes.body.data.topItems[0]).toMatchObject({
      menuItemId,
      revenueUsd: 3,
      revenueKhr: 12303,
    });
    expect(summaryRes.body.data.categoryBreakdown).toHaveLength(1);
    expect(summaryRes.body.data.categoryBreakdown[0]).toMatchObject({
      categoryNameSnapshot: "Coffee",
      revenueUsd: 3,
      revenueKhr: 12303,
    });
  });

  it("enforces role/scope rules for BRANCH vs ALL_BRANCHES and labels frozen branches", async () => {
    const setup = await setupOwnerTenantWithTwoBranches({
      app,
      pool,
      tenantName: `Reporting Scope Tenant ${uniqueSuffix()}`,
    });

    await insertSale({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchAId,
      finalizedByAccountId: setup.ownerAccountId,
      status: "FINALIZED",
      grandTotalUsd: 2,
      grandTotalKhr: 8200,
      saleType: "DINE_IN",
    });
    await insertSale({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchBId,
      finalizedByAccountId: setup.ownerAccountId,
      status: "FINALIZED",
      grandTotalUsd: 3,
      grandTotalKhr: 12300,
      saleType: "TAKEAWAY",
    });

    await pool.query(
      `UPDATE branches
       SET status = 'FROZEN',
           updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2`,
      [setup.tenantId, setup.branchBId]
    );

    const manager = await setupMemberBranchContext({
      app,
      pool,
      tenantId: setup.tenantId,
      roleKey: "MANAGER",
      assignedBranchIds: [setup.branchAId],
      selectedBranchId: setup.branchAId,
    });
    const admin = await setupMemberBranchContext({
      app,
      pool,
      tenantId: setup.tenantId,
      roleKey: "ADMIN",
      assignedBranchIds: [setup.branchAId],
      selectedBranchId: setup.branchAId,
    });

    const managerAllBranchesRes = await request(app)
      .get("/v0/reports/sales/summary")
      .set("Authorization", `Bearer ${manager.branchToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "ALL_BRANCHES",
      });
    expect(managerAllBranchesRes.status).toBe(403);
    expect(managerAllBranchesRes.body.code).toBe("REPORT_BRANCH_SCOPE_FORBIDDEN");

    const managerBranchRes = await request(app)
      .get("/v0/reports/sales/summary")
      .set("Authorization", `Bearer ${manager.branchToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "BRANCH",
      });
    expect(managerBranchRes.status).toBe(200);
    expect(managerBranchRes.body.data.scope.branchScope).toBe("BRANCH");
    expect(managerBranchRes.body.data.confirmed.totalGrandUsd).toBe(2);

    const adminAllBranchesRes = await request(app)
      .get("/v0/reports/sales/summary")
      .set("Authorization", `Bearer ${admin.branchToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "ALL_BRANCHES",
      });
    expect(adminAllBranchesRes.status).toBe(403);
    expect(adminAllBranchesRes.body.code).toBe(
      "REPORT_ALL_BRANCHES_REQUIRES_FULL_BRANCH_ACCESS"
    );

    const ownerAllBranchesRes = await request(app)
      .get("/v0/reports/sales/summary")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "ALL_BRANCHES",
      });
    expect(ownerAllBranchesRes.status).toBe(200);
    expect(ownerAllBranchesRes.body.success).toBe(true);
    expect(ownerAllBranchesRes.body.data.scope.branchScope).toBe("ALL_BRANCHES");
    expect(ownerAllBranchesRes.body.data.scope.branchId).toBeNull();
    expect(ownerAllBranchesRes.body.data.scope.frozenBranchIds).toContain(setup.branchBId);
    expect(ownerAllBranchesRes.body.data.confirmed.totalGrandUsd).toBe(5);
  });

  it("returns deterministic degradation response for attendance report endpoints", async () => {
    const setup = await setupOwnerTenantWithTwoBranches({
      app,
      pool,
      tenantName: `Reporting Attendance Tenant ${uniqueSuffix()}`,
    });

    const summaryRes = await request(app)
      .get("/v0/reports/attendance/summary")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "BRANCH",
      });
    expect(summaryRes.status).toBe(503);
    expect(summaryRes.body.code).toBe("REPORT_NOT_AVAILABLE");

    const drillDownRes = await request(app)
      .get("/v0/reports/attendance/drill-down")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .query({
        window: "custom",
        from: "2000-01-01",
        to: "2099-12-31",
        branchScope: "BRANCH",
      });
    expect(drillDownRes.status).toBe(503);
    expect(drillDownRes.body.code).toBe("REPORT_NOT_AVAILABLE");
  });
});

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
import { bootstrapV0InventoryModule } from "../modules/v0/posOperation/inventory/index.js";
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
    firstName: "Inventory",
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

async function setupOwnerTenantContext(input: {
  app: express.Express;
  pool: Pool;
  ownerPhone: string;
  tenantName: string;
}): Promise<{
  ownerToken: string;
  ownerTenantToken: string;
  ownerBranchAToken: string;
  ownerBranchBToken: string;
  tenantId: string;
  branchAId: string;
  branchBId: string;
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

  const branchAId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: `Inventory Branch A ${uniqueSuffix()}`,
  });
  const branchBId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: `Inventory Branch B ${uniqueSuffix()}`,
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
  const ownerBranchAToken = branchASelected.body.data.accessToken as string;

  const branchBSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${ownerTenantToken}`)
    .send({ branchId: branchBId });
  expect(branchBSelected.status).toBe(200);
  const ownerBranchBToken = branchBSelected.body.data.accessToken as string;

  return {
    ownerToken,
    ownerTenantToken,
    ownerBranchAToken,
    ownerBranchBToken,
    tenantId,
    branchAId,
    branchBId,
  };
}

describe("v0 inventory integration", () => {
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
    app.use("/v0/sync", bootstrapV0PullSyncModule(pool).router);
    app.use("/v0/inventory", bootstrapV0InventoryModule(pool).router);
  });

  afterAll(async () => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
    await pool.end();
  });

  afterEach(() => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
  });

  it("replays category create by idempotency key and rejects payload conflicts", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Inventory Tenant ${uniqueSuffix()}`,
    });

    const idemKey = `idem-cat-${uniqueSuffix()}`;
    const name = `Dairy ${uniqueSuffix()}`;

    const created = await request(app)
      .post("/v0/inventory/categories")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", idemKey)
      .send({ name });
    expect(created.status).toBe(200);
    expect(created.body.success).toBe(true);
    const categoryId = created.body.data.id as string;
    expect(typeof categoryId).toBe("string");

    const replayed = await request(app)
      .post("/v0/inventory/categories")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", idemKey)
      .send({ name });
    expect(replayed.status).toBe(200);
    expect(replayed.headers["idempotency-replayed"]).toBe("true");
    expect(replayed.body.data.id).toBe(categoryId);

    const conflict = await request(app)
      .post("/v0/inventory/categories")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", idemKey)
      .send({ name: `Other ${uniqueSuffix()}` });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("fans out tenant-scope catalog writes into branch sync streams", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Inventory Tenant ${uniqueSuffix()}`,
    });

    const itemName = `Milk ${uniqueSuffix()}`;
    const createdItem = await request(app)
      .post("/v0/inventory/items")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `idem-item-${uniqueSuffix()}`)
      .send({
        name: itemName,
        baseUnit: "ml",
        categoryId: null,
        imageUrl: null,
        lowStockThreshold: null,
      });
    expect(createdItem.status).toBe(200);
    const stockItemId = createdItem.body.data.id as string;

    const pullA = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .send({ cursor: null, limit: 200, moduleScopes: ["inventory"] });
    expect(pullA.status).toBe(200);
    const changesA = pullA.body.data.changes as Array<{ moduleKey: string; entityType: string; entityId: string }>;
    expect(
      changesA.some(
        (c) => c.moduleKey === "inventory" && c.entityType === "inventory_stock_item" && c.entityId === stockItemId
      )
    ).toBe(true);

    const pullB = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.ownerBranchBToken}`)
      .send({ cursor: null, limit: 200, moduleScopes: ["inventory"] });
    expect(pullB.status).toBe(200);
    const changesB = pullB.body.data.changes as Array<{ moduleKey: string; entityType: string; entityId: string }>;
    expect(
      changesB.some(
        (c) => c.moduleKey === "inventory" && c.entityType === "inventory_stock_item" && c.entityId === stockItemId
      )
    ).toBe(true);
  });

  it("records restock as batch + journal + branch stock projection and exposes sync deltas", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Inventory Tenant ${uniqueSuffix()}`,
    });

    const createdItem = await request(app)
      .post("/v0/inventory/items")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `idem-item-${uniqueSuffix()}`)
      .send({
        name: `Beans ${uniqueSuffix()}`,
        baseUnit: "g",
        categoryId: null,
        imageUrl: null,
        lowStockThreshold: 500,
      });
    expect(createdItem.status).toBe(200);
    const stockItemId = createdItem.body.data.id as string;

    const receivedAt = new Date().toISOString();
    const restock = await request(app)
      .post("/v0/inventory/restock-batches")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `idem-restock-${uniqueSuffix()}`)
      .send({
        branchId: setup.branchAId,
        stockItemId,
        quantityInBaseUnit: 1200,
        receivedAt,
        expiryDate: null,
        supplierName: "Supplier X",
        purchaseCostUsd: 12.5,
        note: "Initial restock",
      });
    expect(restock.status).toBe(200);
    expect(restock.body.success).toBe(true);

    const batchId = restock.body.data.id as string;
    const journalEntryId = restock.body.data.journalEntry?.id as string;
    const branchStockProjectionId = restock.body.data.branchStockProjection?.id as string;

    expect(typeof batchId).toBe("string");
    expect(typeof journalEntryId).toBe("string");
    expect(typeof branchStockProjectionId).toBe("string");

    const listedBatches = await request(app)
      .get(`/v0/inventory/restock-batches?branchId=${setup.branchAId}&stockItemId=${stockItemId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(listedBatches.status).toBe(200);
    expect(listedBatches.body.data.items).toHaveLength(1);
    expect(listedBatches.body.data.items[0]?.branchId).toBe(setup.branchAId);

    const branchStock = await request(app)
      .get(`/v0/inventory/stock/branch?branchId=${setup.branchAId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(branchStock.status).toBe(200);
    expect(
      (branchStock.body.data as Array<{ stockItemId: string; onHandInBaseUnit: number }>).some(
        (row) => row.stockItemId === stockItemId && row.onHandInBaseUnit === 1200
      )
    ).toBe(true);

    const branchJournal = await request(app)
      .get(`/v0/inventory/journal?branchId=${setup.branchAId}&stockItemId=${stockItemId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(branchJournal.status).toBe(200);
    expect(branchJournal.body.data.items).toHaveLength(1);
    expect(branchJournal.body.data.items[0]?.branchId).toBe(setup.branchAId);

    const onHand = await pool.query<{ on_hand_in_base_unit: number }>(
      `SELECT on_hand_in_base_unit::FLOAT8 AS on_hand_in_base_unit
       FROM v0_inventory_branch_stock
       WHERE tenant_id = $1 AND branch_id = $2 AND stock_item_id = $3`,
      [setup.tenantId, setup.branchAId, stockItemId]
    );
    expect(onHand.rows[0]?.on_hand_in_base_unit).toBe(1200);

    const pull = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .send({ cursor: null, limit: 500, moduleScopes: ["inventory"] });
    expect(pull.status).toBe(200);

    const changes = pull.body.data.changes as Array<{ entityType: string; entityId: string; moduleKey: string }>;
    expect(
      changes.some((c) => c.moduleKey === "inventory" && c.entityType === "inventory_restock_batch" && c.entityId === batchId)
    ).toBe(true);
    expect(
      changes.some((c) => c.moduleKey === "inventory" && c.entityType === "inventory_journal_entry" && c.entityId === journalEntryId)
    ).toBe(true);
    expect(
      changes.some(
        (c) =>
          c.moduleKey === "inventory" &&
          c.entityType === "inventory_branch_stock_projection" &&
          c.entityId === branchStockProjectionId
      )
    ).toBe(true);
  });

  it("provides tenant-wide inventory journal lane with optional branch filter", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Inventory Journal Tenant ${uniqueSuffix()}`,
    });

    const createdItem = await request(app)
      .post("/v0/inventory/items")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `idem-item-${uniqueSuffix()}`)
      .send({
        name: `Sugar ${uniqueSuffix()}`,
        baseUnit: "g",
        categoryId: null,
        imageUrl: null,
        lowStockThreshold: null,
      });
    expect(createdItem.status).toBe(200);
    const stockItemId = createdItem.body.data.id as string;

    const restockA = await request(app)
      .post("/v0/inventory/restock-batches")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `idem-restock-a-${uniqueSuffix()}`)
      .send({
        branchId: setup.branchAId,
        stockItemId,
        quantityInBaseUnit: 1000,
        receivedAt: new Date().toISOString(),
        expiryDate: null,
        supplierName: "Supplier A",
        purchaseCostUsd: 10,
        note: "Branch A restock",
      });
    expect(restockA.status).toBe(200);

    const restockB = await request(app)
      .post("/v0/inventory/restock-batches")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `idem-restock-b-${uniqueSuffix()}`)
      .send({
        branchId: setup.branchBId,
        stockItemId,
        quantityInBaseUnit: 2000,
        receivedAt: new Date().toISOString(),
        expiryDate: null,
        supplierName: "Supplier B",
        purchaseCostUsd: 20,
        note: "Branch B restock",
      });
    expect(restockB.status).toBe(200);

    const listedAll = await request(app)
      .get(`/v0/inventory/journal/all?stockItemId=${stockItemId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(listedAll.status).toBe(200);

    const allRows = listedAll.body.data.items as Array<{ branchId: string; stockItemId: string }>;
    expect(allRows).toHaveLength(2);
    expect(allRows.every((row) => row.stockItemId === stockItemId)).toBe(true);
    expect(allRows.map((row) => row.branchId).sort()).toEqual(
      [setup.branchAId, setup.branchBId].sort()
    );

    const listedBranchA = await request(app)
      .get(`/v0/inventory/journal/all?stockItemId=${stockItemId}&branchId=${setup.branchAId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(listedBranchA.status).toBe(200);

    const branchRows = listedBranchA.body.data.items as Array<{ branchId: string }>;
    expect(branchRows).toHaveLength(1);
    expect(branchRows[0]?.branchId).toBe(setup.branchAId);
  });

  it("filters inventory journal by exact date and inclusive date range", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Inventory Journal Date Tenant ${uniqueSuffix()}`,
    });

    const createdItem = await request(app)
      .post("/v0/inventory/items")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `idem-item-date-${uniqueSuffix()}`)
      .send({
        name: `Condensed Milk ${uniqueSuffix()}`,
        baseUnit: "ml",
        categoryId: null,
        imageUrl: null,
        lowStockThreshold: null,
      });
    expect(createdItem.status).toBe(200);
    const stockItemId = createdItem.body.data.id as string;

    const branchADayOne = await request(app)
      .post("/v0/inventory/restock-batches")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `idem-restock-date-a1-${uniqueSuffix()}`)
      .send({
        branchId: setup.branchAId,
        stockItemId,
        quantityInBaseUnit: 800,
        receivedAt: "2026-03-10T09:15:00+07:00",
        expiryDate: null,
        supplierName: "Supplier A",
        purchaseCostUsd: 8,
        note: "Branch A day one",
      });
    expect(branchADayOne.status).toBe(200);

    const branchADayThree = await request(app)
      .post("/v0/inventory/restock-batches")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `idem-restock-date-a3-${uniqueSuffix()}`)
      .send({
        branchId: setup.branchAId,
        stockItemId,
        quantityInBaseUnit: 900,
        receivedAt: "2026-03-12T11:45:00+07:00",
        expiryDate: null,
        supplierName: "Supplier A",
        purchaseCostUsd: 9,
        note: "Branch A day three",
      });
    expect(branchADayThree.status).toBe(200);

    const branchBDayThree = await request(app)
      .post("/v0/inventory/restock-batches")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `idem-restock-date-b3-${uniqueSuffix()}`)
      .send({
        branchId: setup.branchBId,
        stockItemId,
        quantityInBaseUnit: 700,
        receivedAt: "2026-03-12T08:00:00+07:00",
        expiryDate: null,
        supplierName: "Supplier B",
        purchaseCostUsd: 7,
        note: "Branch B day three",
      });
    expect(branchBDayThree.status).toBe(200);

    const exactDate = await request(app)
      .get(
        `/v0/inventory/journal?branchId=${setup.branchAId}&stockItemId=${stockItemId}&date=2026-03-10`
      )
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(exactDate.status).toBe(200);

    const exactRows = exactDate.body.data.items as Array<{
      branchId: string;
      note: string;
      occurredAt: string;
    }>;
    expect(exactRows).toHaveLength(1);
    expect(exactRows[0]?.branchId).toBe(setup.branchAId);
    expect(exactRows[0]?.note).toBe("Branch A day one");
    expect(exactRows[0]?.occurredAt.startsWith("2026-03-10")).toBe(true);

    const range = await request(app)
      .get(
        `/v0/inventory/journal?branchId=${setup.branchAId}&stockItemId=${stockItemId}&from=2026-03-11&to=2026-03-12`
      )
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(range.status).toBe(200);

    const rangeRows = range.body.data.items as Array<{ branchId: string; note: string }>;
    expect(rangeRows).toHaveLength(1);
    expect(rangeRows[0]?.branchId).toBe(setup.branchAId);
    expect(rangeRows[0]?.note).toBe("Branch A day three");

    const tenantExactDate = await request(app)
      .get(`/v0/inventory/journal/all?stockItemId=${stockItemId}&date=2026-03-12`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(tenantExactDate.status).toBe(200);

    const tenantRows = tenantExactDate.body.data.items as Array<{ branchId: string }>;
    expect(tenantRows).toHaveLength(2);
    expect(tenantRows.map((row) => row.branchId).sort()).toEqual(
      [setup.branchAId, setup.branchBId].sort()
    );

    const invalidMixedFilter = await request(app)
      .get(
        `/v0/inventory/journal?branchId=${setup.branchAId}&stockItemId=${stockItemId}&date=2026-03-10&from=2026-03-10`
      )
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(invalidMixedFilter.status).toBe(422);
    expect(invalidMixedFilter.body.code).toBe("INVENTORY_INVALID_FILTER");
  });

  it("rolls back business writes when outbox insert fails (atomic command contract)", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Inventory Tenant ${uniqueSuffix()}`,
    });

    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "inventory.items.create";

    const idemKey = `idem-fail-${uniqueSuffix()}`;
    const attempted = await request(app)
      .post("/v0/inventory/items")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", idemKey)
      .send({
        name: `Should Fail ${uniqueSuffix()}`,
        baseUnit: "pc",
        categoryId: null,
        imageUrl: null,
        lowStockThreshold: null,
      });

    expect(attempted.status).toBe(500);
    expect(attempted.body.success).toBe(false);

    const items = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_inventory_stock_items
       WHERE tenant_id = $1`,
      [setup.tenantId]
    );
    expect(Number(items.rows[0]?.count ?? "0")).toBe(0);

    const audits = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'inventory.items.create'`,
      [setup.tenantId]
    );
    expect(Number(audits.rows[0]?.count ?? "0")).toBe(0);
  });
});

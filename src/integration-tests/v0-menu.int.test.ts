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
import { bootstrapV0MenuModule } from "../modules/v0/menu/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";
import { startV0CommandOutboxDispatcher } from "../platform/outbox/dispatcher.js";
import { eventBus } from "../platform/events/index.js";

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
    firstName: "Menu",
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
    branchName: `Menu Branch A ${uniqueSuffix()}`,
  });
  const branchBId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: `Menu Branch B ${uniqueSuffix()}`,
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

  const branchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${ownerTenantToken}`)
    .send({ branchId: branchAId });
  expect(branchSelected.status).toBe(200);
  const ownerBranchAToken = branchSelected.body.data.accessToken as string;

  return {
    ownerToken,
    ownerTenantToken,
    ownerBranchAToken,
    tenantId,
    branchAId,
    branchBId,
  };
}

async function seedMenuItem(input: {
  pool: Pool;
  tenantId: string;
  name: string;
  branchIds: string[];
}): Promise<string> {
  const inserted = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_menu_items (tenant_id, name, base_price, status)
     VALUES ($1, $2, 2.50, 'ACTIVE')
     RETURNING id`,
    [input.tenantId, input.name]
  );
  const menuItemId = inserted.rows[0].id;

  for (const branchId of input.branchIds) {
    await input.pool.query(
      `INSERT INTO v0_menu_item_branch_visibility (tenant_id, menu_item_id, branch_id)
       VALUES ($1, $2, $3)`,
      [input.tenantId, menuItemId, branchId]
    );
  }
  return menuItemId;
}

async function inviteAcceptAndSelectTenant(input: {
  app: express.Express;
  ownerToken: string;
  tenantId: string;
  roleKey: "MANAGER" | "CASHIER";
}): Promise<string> {
  const phone = uniquePhone();
  const invite = await request(input.app)
    .post("/v0/org/memberships/invite")
    .set("Authorization", `Bearer ${input.ownerToken}`)
    .send({
      tenantId: input.tenantId,
      phone,
      roleKey: input.roleKey,
    });
  expect(invite.status).toBe(201);
  const membershipId = invite.body.data.membershipId as string;

  const inviteeToken = await registerAndLogin(input.app, phone);
  const accepted = await request(input.app)
    .post(`/v0/org/memberships/invitations/${membershipId}/accept`)
    .set("Authorization", `Bearer ${inviteeToken}`)
    .send({});
  expect(accepted.status).toBe(200);

  const selected = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${inviteeToken}`)
    .send({ tenantId: input.tenantId });
  expect(selected.status).toBe(200);
  return selected.body.data.accessToken as string;
}

describe("v0 menu integration", () => {
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
    app.use("/v0/menu", bootstrapV0MenuModule(pool).router);
  });

  afterAll(async () => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
    await pool.end();
  });

  afterEach(() => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
  });

  it("lists all tenant menu items with branch visibility metadata", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Tenant ${uniqueSuffix()}`,
    });

    const itemA = `Americano ${uniqueSuffix()}`;
    const itemB = `Latte ${uniqueSuffix()}`;
    const itemC = `Mocha ${uniqueSuffix()}`;
    await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: itemA,
      branchIds: [setup.branchAId],
    });
    await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: itemB,
      branchIds: [setup.branchBId],
    });
    await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: itemC,
      branchIds: [setup.branchAId, setup.branchBId],
    });

    const listed = await request(app)
      .get("/v0/menu/items/all")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(listed.status).toBe(200);

    const items = listed.body.data as Array<{
      name: string;
      visibleBranchIds: string[];
    }>;
    const byName = new Map(items.map((item) => [item.name, item]));
    expect(byName.has(itemA)).toBe(true);
    expect(byName.has(itemB)).toBe(true);
    expect(byName.has(itemC)).toBe(true);
    expect(byName.get(itemA)?.visibleBranchIds.sort()).toEqual([setup.branchAId].sort());
    expect(byName.get(itemB)?.visibleBranchIds.sort()).toEqual([setup.branchBId].sort());
    expect(byName.get(itemC)?.visibleBranchIds.sort()).toEqual(
      [setup.branchAId, setup.branchBId].sort()
    );
  });

  it("filters tenant-wide list by branchId", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Branch Filter ${uniqueSuffix()}`,
    });

    const itemA = `Espresso ${uniqueSuffix()}`;
    const itemB = `Flat White ${uniqueSuffix()}`;
    const itemC = `Cappuccino ${uniqueSuffix()}`;
    await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: itemA,
      branchIds: [setup.branchAId],
    });
    await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: itemB,
      branchIds: [setup.branchBId],
    });
    await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: itemC,
      branchIds: [setup.branchAId, setup.branchBId],
    });

    const listed = await request(app)
      .get(`/v0/menu/items/all?branchId=${setup.branchAId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(listed.status).toBe(200);
    const names = (listed.body.data as Array<{ name: string }>).map((item) => item.name);
    expect(names).toContain(itemA);
    expect(names).toContain(itemC);
    expect(names).not.toContain(itemB);
  });

  it("allows manager and denies cashier for tenant-wide listing", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Role Guard ${uniqueSuffix()}`,
    });

    const managerTenantToken = await inviteAcceptAndSelectTenant({
      app,
      ownerToken: setup.ownerToken,
      tenantId: setup.tenantId,
      roleKey: "MANAGER",
    });
    const managerListed = await request(app)
      .get("/v0/menu/items/all")
      .set("Authorization", `Bearer ${managerTenantToken}`);
    expect(managerListed.status).toBe(200);

    const cashierTenantToken = await inviteAcceptAndSelectTenant({
      app,
      ownerToken: setup.ownerToken,
      tenantId: setup.tenantId,
      roleKey: "CASHIER",
    });
    const cashierDenied = await request(app)
      .get("/v0/menu/items/all")
      .set("Authorization", `Bearer ${cashierTenantToken}`);
    expect(cashierDenied.status).toBe(403);
    expect(cashierDenied.body.code).toBe("PERMISSION_DENIED");
  });

  it("supports create menu item idempotency replay and conflict safeguards", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Idempotency ${uniqueSuffix()}`,
    });

    const payload = {
      name: `Iced Tea ${uniqueSuffix()}`,
      basePrice: 2.75,
      categoryId: null,
      modifierGroupIds: [],
      visibleBranchIds: [setup.branchAId],
      imageUrl: null,
    };

    const first = await request(app)
      .post("/v0/menu/items")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .set("Idempotency-Key", "menu-item-create-1")
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.data.name).toBe(payload.name);

    const replay = await request(app)
      .post("/v0/menu/items")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .set("Idempotency-Key", "menu-item-create-1")
      .send(payload);
    expect(replay.status).toBe(200);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.body.data.id).toBe(first.body.data.id);

    const conflict = await request(app)
      .post("/v0/menu/items")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .set("Idempotency-Key", "menu-item-create-1")
      .send({
        ...payload,
        name: `Changed ${uniqueSuffix()}`,
      });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'menu.items.create'`,
      [setup.tenantId, setup.branchAId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(1);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'menu.items.create'
         AND event_type = 'MENU_ITEM_CREATED'`,
      [setup.tenantId, setup.branchAId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(1);
  });

  it("rolls back menu item create when outbox insert fails and allows retry with same key", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Atomicity ${uniqueSuffix()}`,
    });

    const name = `Atomic Menu Item ${uniqueSuffix()}`;
    const payload = {
      name,
      basePrice: 3.25,
      categoryId: null,
      modifierGroupIds: [],
      visibleBranchIds: [setup.branchAId],
      imageUrl: null,
    };

    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "menu.items.create";
    const failed = await request(app)
      .post("/v0/menu/items")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .set("Idempotency-Key", "menu-item-atomicity-1")
      .send(payload);
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";

    expect(failed.status).toBe(500);

    const itemCountAfterFailure = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_menu_items
       WHERE tenant_id = $1
         AND name = $2`,
      [setup.tenantId, name]
    );
    expect(Number(itemCountAfterFailure.rows[0]?.count ?? "0")).toBe(0);

    const retry = await request(app)
      .post("/v0/menu/items")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .set("Idempotency-Key", "menu-item-atomicity-1")
      .send(payload);
    expect(retry.status).toBe(200);

    const itemCountAfterRetry = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_menu_items
       WHERE tenant_id = $1
         AND name = $2`,
      [setup.tenantId, name]
    );
    expect(Number(itemCountAfterRetry.rows[0]?.count ?? "0")).toBe(1);
  });

  it("publishes menu outbox event through dispatcher after item create", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Outbox Publish ${uniqueSuffix()}`,
    });

    const payload = {
      name: `Dispatch Item ${uniqueSuffix()}`,
      basePrice: 4.5,
      categoryId: null,
      modifierGroupIds: [],
      visibleBranchIds: [setup.branchAId],
      imageUrl: null,
    };

    const created = await request(app)
      .post("/v0/menu/items")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .set("Idempotency-Key", "menu-item-dispatch-1")
      .send(payload);
    expect(created.status).toBe(200);

    const outbox = await pool.query<{ id: string }>(
      `SELECT id
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'menu.items.create'
         AND event_type = 'MENU_ITEM_CREATED'
       ORDER BY created_at DESC
       LIMIT 1`,
      [setup.tenantId, setup.branchAId]
    );
    const outboxId = outbox.rows[0]?.id;
    expect(outboxId).toBeTruthy();

    const published = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("menu outbox event was not dispatched in time"));
      }, 4000);

      eventBus.subscribe("MENU_ITEM_CREATED", async (event: any) => {
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

      const row = await pool.query<{ published_at: Date | null }>(
        `SELECT published_at
         FROM v0_command_outbox
         WHERE id = $1`,
        [outboxId]
      );
      expect(row.rows[0]?.published_at).not.toBeNull();
    } finally {
      dispatcher.stop();
    }
  });
});

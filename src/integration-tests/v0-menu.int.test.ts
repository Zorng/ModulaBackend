import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "crypto";
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
import { bootstrapV0MenuModule } from "../modules/v0/posOperation/menu/index.js";
import { V0MenuRepository } from "../modules/v0/posOperation/menu/infra/repository.js";
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

async function seedModifierGroupWithOption(input: {
  pool: Pool;
  tenantId: string;
  name: string;
  optionLabel: string;
  defaultPriceDelta?: number;
}): Promise<{ groupId: string; optionId: string }> {
  const groupInserted = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_menu_modifier_groups (
       tenant_id,
       name,
       selection_mode,
       min_selections,
       max_selections,
       is_required,
       status
     )
     VALUES ($1, $2, 'SINGLE', 0, 1, false, 'ACTIVE')
     RETURNING id`,
    [input.tenantId, input.name]
  );
  const groupId = groupInserted.rows[0]?.id;
  expect(groupId).toBeTruthy();

  const optionInserted = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_menu_modifier_options (
       tenant_id,
       modifier_group_id,
       label,
       price_delta,
       status
     )
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     RETURNING id`,
    [input.tenantId, groupId, input.optionLabel, input.defaultPriceDelta ?? 0]
  );
  const optionId = optionInserted.rows[0]?.id;
  expect(optionId).toBeTruthy();

  return {
    groupId: groupId!,
    optionId: optionId!,
  };
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
     VALUES ($1, $2, $3, 1)`,
    [input.tenantId, input.menuItemId, input.groupId]
  );
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

    const items = listed.body.data.items as Array<{
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
    const names = (listed.body.data.items as Array<{ name: string }>).map((item) => item.name);
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

  it("supports menu item CRUD with tenant context token (no branch required)", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Tenant CRUD ${uniqueSuffix()}`,
    });

    const created = await request(app)
      .post("/v0/menu/items")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", "menu-item-tenant-scope-create-1")
      .send({
        name: `Tenant Scoped Item ${uniqueSuffix()}`,
        basePrice: 3.15,
        categoryId: null,
        modifierGroupIds: [],
        visibleBranchIds: [setup.branchAId],
        imageUrl: null,
      });
    expect(created.status).toBe(200);
    const menuItemId = created.body.data.id as string;
    expect(created.body.data.visibleBranchIds).toEqual([setup.branchAId]);

    const read = await request(app)
      .get(`/v0/menu/items/${menuItemId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(read.status).toBe(200);
    expect(read.body.data.id).toBe(menuItemId);

    const updated = await request(app)
      .patch(`/v0/menu/items/${menuItemId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", "menu-item-tenant-scope-update-1")
      .send({
        name: `Updated Tenant Scoped Item ${uniqueSuffix()}`,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.id).toBe(menuItemId);

    const archived = await request(app)
      .post(`/v0/menu/items/${menuItemId}/archive`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", "menu-item-tenant-scope-archive-1")
      .send({});
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe("ARCHIVED");

    const restored = await request(app)
      .post(`/v0/menu/items/${menuItemId}/restore`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", "menu-item-tenant-scope-restore-1")
      .send({});
    expect(restored.status).toBe(200);
    expect(restored.body.data.status).toBe("ACTIVE");
  });

  it("returns deterministic duplicate code when creating modifier group with same name", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Duplicate Group ${uniqueSuffix()}`,
    });
    const groupName = `Size ${uniqueSuffix()}`;

    const first = await request(app)
      .post("/v0/menu/modifier-groups")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", "menu-modifier-group-duplicate-1")
      .send({
        name: groupName,
        selectionMode: "SINGLE",
        minSelections: 0,
        maxSelections: 1,
        isRequired: false,
      });
    expect(first.status).toBe(200);

    const duplicate = await request(app)
      .post("/v0/menu/modifier-groups")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", "menu-modifier-group-duplicate-2")
      .send({
        name: groupName,
        selectionMode: "SINGLE",
        minSelections: 0,
        maxSelections: 1,
        isRequired: false,
      });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("MODIFIER_GROUP_DUPLICATE_NAME");
  });

  it("stores modifier option pricing and composition effects per menu item", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Item Option Effects ${uniqueSuffix()}`,
    });
    const repo = new V0MenuRepository(pool);

    const latteItemId = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: `Iced Latte ${uniqueSuffix()}`,
      branchIds: [setup.branchAId],
    });
    const juiceItemId = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: `Orange Juice ${uniqueSuffix()}`,
      branchIds: [setup.branchAId],
    });
    const modifier = await seedModifierGroupWithOption({
      pool,
      tenantId: setup.tenantId,
      name: `Size ${uniqueSuffix()}`,
      optionLabel: "Large",
    });

    await attachModifierGroupToMenuItem({
      pool,
      tenantId: setup.tenantId,
      menuItemId: latteItemId,
      groupId: modifier.groupId,
    });
    await attachModifierGroupToMenuItem({
      pool,
      tenantId: setup.tenantId,
      menuItemId: juiceItemId,
      groupId: modifier.groupId,
    });

    const coffeeStockItemId = randomUUID();
    const orangeStockItemId = randomUUID();

    await repo.replaceModifierOptionEffectsForMenuItem({
      tenantId: setup.tenantId,
      menuItemId: latteItemId,
      effects: [
        {
          modifierOptionId: modifier.optionId,
          priceDelta: 0.5,
          componentDeltas: [
            {
              stockItemId: coffeeStockItemId,
              quantityDeltaInBaseUnit: 8,
              trackingMode: "TRACKED",
            },
          ],
        },
      ],
    });
    await repo.replaceModifierOptionEffectsForMenuItem({
      tenantId: setup.tenantId,
      menuItemId: juiceItemId,
      effects: [
        {
          modifierOptionId: modifier.optionId,
          priceDelta: 1.25,
          componentDeltas: [
            {
              stockItemId: orangeStockItemId,
              quantityDeltaInBaseUnit: 120,
              trackingMode: "TRACKED",
            },
          ],
        },
      ],
    });

    const latteEffects = await repo.listModifierOptionEffectsForMenuItem({
      tenantId: setup.tenantId,
      menuItemId: latteItemId,
      modifierOptionIds: [modifier.optionId],
    });
    const juiceEffects = await repo.listModifierOptionEffectsForMenuItem({
      tenantId: setup.tenantId,
      menuItemId: juiceItemId,
      modifierOptionIds: [modifier.optionId],
    });
    expect(latteEffects).toHaveLength(1);
    expect(juiceEffects).toHaveLength(1);
    expect(latteEffects[0]?.price_delta).toBe(0.5);
    expect(juiceEffects[0]?.price_delta).toBe(1.25);

    const latteDeltas = await repo.listComponentDeltasByMenuItemModifierOptionIds({
      tenantId: setup.tenantId,
      menuItemId: latteItemId,
      modifierOptionIds: [modifier.optionId],
    });
    const juiceDeltas = await repo.listComponentDeltasByMenuItemModifierOptionIds({
      tenantId: setup.tenantId,
      menuItemId: juiceItemId,
      modifierOptionIds: [modifier.optionId],
    });
    expect(latteDeltas).toHaveLength(1);
    expect(juiceDeltas).toHaveLength(1);
    expect(latteDeltas[0]?.modifier_option_id).toBe(modifier.optionId);
    expect(juiceDeltas[0]?.modifier_option_id).toBe(modifier.optionId);
    expect(latteDeltas[0]?.stock_item_id).toBe(coffeeStockItemId);
    expect(juiceDeltas[0]?.stock_item_id).toBe(orangeStockItemId);
    expect(latteDeltas[0]?.quantity_delta_in_base_unit).toBe(8);
    expect(juiceDeltas[0]?.quantity_delta_in_base_unit).toBe(120);

    const globalOption = await pool.query<{ price_delta: number }>(
      `SELECT price_delta::FLOAT8 AS price_delta
       FROM v0_menu_modifier_options
       WHERE tenant_id = $1
         AND id = $2`,
      [setup.tenantId, modifier.optionId]
    );
    expect(globalOption.rows[0]?.price_delta).toBe(0);
  });

  it("applies item-owned modifier effects in menu item detail and composition evaluation", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Item Option Runtime ${uniqueSuffix()}`,
    });

    const latteItemId = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: `Iced Latte ${uniqueSuffix()}`,
      branchIds: [setup.branchAId],
    });
    const juiceItemId = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: `Orange Juice ${uniqueSuffix()}`,
      branchIds: [setup.branchAId],
    });
    const modifier = await seedModifierGroupWithOption({
      pool,
      tenantId: setup.tenantId,
      name: `Size ${uniqueSuffix()}`,
      optionLabel: "Large",
    });

    await attachModifierGroupToMenuItem({
      pool,
      tenantId: setup.tenantId,
      menuItemId: latteItemId,
      groupId: modifier.groupId,
    });
    await attachModifierGroupToMenuItem({
      pool,
      tenantId: setup.tenantId,
      menuItemId: juiceItemId,
      groupId: modifier.groupId,
    });

    const coffeeStockItemId = randomUUID();
    const orangeStockItemId = randomUUID();

    const latteEffects = await request(app)
      .put(`/v0/menu/items/${latteItemId}/modifier-option-effects`)
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .set("Idempotency-Key", `menu-item-option-effects-latte-${uniqueSuffix()}`)
      .send({
        effects: [
          {
            modifierOptionId: modifier.optionId,
            priceDelta: 0.5,
            componentDeltas: [
              {
                stockItemId: coffeeStockItemId,
                quantityDeltaInBaseUnit: 8,
                trackingMode: "TRACKED",
              },
            ],
          },
        ],
      });
    expect(latteEffects.status).toBe(200);

    const juiceEffects = await request(app)
      .put(`/v0/menu/items/${juiceItemId}/modifier-option-effects`)
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .set("Idempotency-Key", `menu-item-option-effects-juice-${uniqueSuffix()}`)
      .send({
        effects: [
          {
            modifierOptionId: modifier.optionId,
            priceDelta: 1.25,
            componentDeltas: [
              {
                stockItemId: orangeStockItemId,
                quantityDeltaInBaseUnit: 120,
                trackingMode: "TRACKED",
              },
            ],
          },
        ],
      });
    expect(juiceEffects.status).toBe(200);

    const latteDetail = await request(app)
      .get(`/v0/menu/items/${latteItemId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(latteDetail.status).toBe(200);
    expect(latteDetail.body.data.modifierGroups[0]?.options[0]?.modifierOptionId).toBe(
      modifier.optionId
    );
    expect(latteDetail.body.data.modifierGroups[0]?.options[0]?.priceDelta).toBe(0.5);
    expect(latteDetail.body.data.modifierGroups[0]?.options[0]?.componentDeltas).toEqual([
      {
        stockItemId: coffeeStockItemId,
        quantityDeltaInBaseUnit: 8,
        trackingMode: "TRACKED",
      },
    ]);
    expect(latteDetail.body.data.modifierOptionEffects).toEqual([
      {
        modifierOptionId: modifier.optionId,
        priceDelta: 0.5,
        componentDeltas: [
          {
            stockItemId: coffeeStockItemId,
            quantityDeltaInBaseUnit: 8,
            trackingMode: "TRACKED",
          },
        ],
      },
    ]);

    const juiceDetail = await request(app)
      .get(`/v0/menu/items/${juiceItemId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(juiceDetail.status).toBe(200);
    expect(juiceDetail.body.data.modifierGroups[0]?.options[0]?.modifierOptionId).toBe(
      modifier.optionId
    );
    expect(juiceDetail.body.data.modifierGroups[0]?.options[0]?.priceDelta).toBe(1.25);
    expect(juiceDetail.body.data.modifierGroups[0]?.options[0]?.componentDeltas).toEqual([
      {
        stockItemId: orangeStockItemId,
        quantityDeltaInBaseUnit: 120,
        trackingMode: "TRACKED",
      },
    ]);
    expect(juiceDetail.body.data.modifierOptionEffects).toEqual([
      {
        modifierOptionId: modifier.optionId,
        priceDelta: 1.25,
        componentDeltas: [
          {
            stockItemId: orangeStockItemId,
            quantityDeltaInBaseUnit: 120,
            trackingMode: "TRACKED",
          },
        ],
      },
    ]);

    const latteComposition = await request(app)
      .post(`/v0/menu/items/${latteItemId}/composition/evaluate`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .send({
        selectedModifierOptionIds: [modifier.optionId],
      });
    expect(latteComposition.status).toBe(200);
    expect(latteComposition.body.data.components).toEqual([
      {
        stockItemId: coffeeStockItemId,
        quantityInBaseUnit: 8,
        trackingMode: "TRACKED",
      },
    ]);

    const juiceComposition = await request(app)
      .post(`/v0/menu/items/${juiceItemId}/composition/evaluate`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .send({
        selectedModifierOptionIds: [modifier.optionId],
      });
    expect(juiceComposition.status).toBe(200);
    expect(juiceComposition.body.data.components).toEqual([
      {
        stockItemId: orangeStockItemId,
        quantityInBaseUnit: 120,
        trackingMode: "TRACKED",
      },
    ]);
  });

  it("accepts inline item-scoped modifier option effects on menu item create and update", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Inline Item Effects ${uniqueSuffix()}`,
    });
    const modifier = await seedModifierGroupWithOption({
      pool,
      tenantId: setup.tenantId,
      name: `Milk ${uniqueSuffix()}`,
      optionLabel: "Oat",
    });

    const initialStockItemId = randomUUID();
    const created = await request(app)
      .post("/v0/menu/items")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `menu-item-inline-effects-create-${uniqueSuffix()}`)
      .send({
        name: `Flat White ${uniqueSuffix()}`,
        basePrice: 4.25,
        categoryId: null,
        modifierGroupIds: [modifier.groupId],
        modifierOptionEffects: [
          {
            modifierOptionId: modifier.optionId,
            priceDelta: 0.75,
            componentDeltas: [
              {
                stockItemId: initialStockItemId,
                quantityDeltaInBaseUnit: 1,
                trackingMode: "NOT_TRACKED",
              },
            ],
          },
        ],
        visibleBranchIds: [setup.branchAId],
        imageUrl: null,
      });
    expect(created.status).toBe(200);
    const menuItemId = created.body.data.id as string;

    const createdDetail = await request(app)
      .get(`/v0/menu/items/${menuItemId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(createdDetail.status).toBe(200);
    expect(createdDetail.body.data.modifierGroups[0]?.options[0]).toMatchObject({
      id: modifier.optionId,
      modifierOptionId: modifier.optionId,
      priceDelta: 0.75,
      componentDeltas: [
        {
          stockItemId: initialStockItemId,
          quantityDeltaInBaseUnit: 1,
          trackingMode: "NOT_TRACKED",
        },
      ],
    });
    expect(createdDetail.body.data.modifierOptionEffects).toEqual([
      {
        modifierOptionId: modifier.optionId,
        priceDelta: 0.75,
        componentDeltas: [
          {
            stockItemId: initialStockItemId,
            quantityDeltaInBaseUnit: 1,
            trackingMode: "NOT_TRACKED",
          },
        ],
      },
    ]);

    const updatedStockItemId = randomUUID();
    const updated = await request(app)
      .patch(`/v0/menu/items/${menuItemId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `menu-item-inline-effects-update-${uniqueSuffix()}`)
      .send({
        modifierOptionEffects: [
          {
            modifierOptionId: modifier.optionId,
            priceDelta: 1.1,
            componentDeltas: [
              {
                stockItemId: updatedStockItemId,
                quantityDeltaInBaseUnit: 2,
                trackingMode: "NOT_TRACKED",
              },
            ],
          },
        ],
      });
    expect(updated.status).toBe(200);

    const updatedDetail = await request(app)
      .get(`/v0/menu/items/${menuItemId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(updatedDetail.status).toBe(200);
    expect(updatedDetail.body.data.modifierGroups[0]?.options[0]).toMatchObject({
      id: modifier.optionId,
      modifierOptionId: modifier.optionId,
      priceDelta: 1.1,
      componentDeltas: [
        {
          stockItemId: updatedStockItemId,
          quantityDeltaInBaseUnit: 2,
          trackingMode: "NOT_TRACKED",
        },
      ],
    });
    expect(updatedDetail.body.data.modifierOptionEffects).toEqual([
      {
        modifierOptionId: modifier.optionId,
        priceDelta: 1.1,
        componentDeltas: [
          {
            stockItemId: updatedStockItemId,
            quantityDeltaInBaseUnit: 2,
            trackingMode: "NOT_TRACKED",
          },
        ],
      },
    ]);
  });

  it("returns null priceDelta for attached modifier options without item-level pricing", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Strict Item Price ${uniqueSuffix()}`,
    });

    const menuItemId = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: `Americano ${uniqueSuffix()}`,
      branchIds: [setup.branchAId],
    });
    const modifier = await seedModifierGroupWithOption({
      pool,
      tenantId: setup.tenantId,
      name: `Size ${uniqueSuffix()}`,
      optionLabel: "Large",
      defaultPriceDelta: 1.25,
    });

    await attachModifierGroupToMenuItem({
      pool,
      tenantId: setup.tenantId,
      menuItemId,
      groupId: modifier.groupId,
    });

    const detail = await request(app)
      .get(`/v0/menu/items/${menuItemId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.modifierGroups[0]?.options[0]?.modifierOptionId).toBe(modifier.optionId);
    expect(detail.body.data.modifierGroups[0]?.options[0]?.priceDelta).toBeNull();
    expect(detail.body.data.modifierOptionEffects).toEqual([]);
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

  it("links pending media upload when menu item is saved with uploaded imageUrl", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Menu Media Link ${uniqueSuffix()}`,
    });

    const filename = `uploaded-${uniqueSuffix()}.jpg`;
    const imageUrl = `/images/${setup.tenantId}/menu/${filename}`;
    const objectKey = `menu-item-images/${setup.tenantId}/${filename}`;
    await pool.query(
      `INSERT INTO v0_media_uploads (
         tenant_id,
         area,
         object_key,
         image_url,
         mime_type,
         size_bytes,
         status
       ) VALUES ($1, 'menu', $2, $3, 'image/jpeg', 1024, 'PENDING')`,
      [setup.tenantId, objectKey, imageUrl]
    );

    const created = await request(app)
      .post("/v0/menu/items")
      .set("Authorization", `Bearer ${setup.ownerBranchAToken}`)
      .set("Idempotency-Key", "menu-item-media-link-1")
      .send({
        name: `Media Linked Item ${uniqueSuffix()}`,
        basePrice: 2.0,
        categoryId: null,
        modifierGroupIds: [],
        visibleBranchIds: [setup.branchAId],
        imageUrl,
      });
    expect(created.status).toBe(200);
    const menuItemId = created.body.data.id as string;

    const upload = await pool.query<{
      status: string;
      linked_entity_type: string | null;
      linked_entity_id: string | null;
    }>(
      `SELECT status, linked_entity_type, linked_entity_id
       FROM v0_media_uploads
       WHERE tenant_id = $1
         AND object_key = $2`,
      [setup.tenantId, objectKey]
    );

    expect(upload.rows[0]?.status).toBe("LINKED");
    expect(upload.rows[0]?.linked_entity_type).toBe("menu_item");
    expect(upload.rows[0]?.linked_entity_id).toBe(menuItemId);
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

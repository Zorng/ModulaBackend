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
import { bootstrapV0DiscountModule } from "../modules/v0/posOperation/discount/index.js";
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
    firstName: "Discount",
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
    branchName: `Discount Branch A ${uniqueSuffix()}`,
  });
  const branchBId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: `Discount Branch B ${uniqueSuffix()}`,
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

async function seedMenuItem(input: {
  pool: Pool;
  tenantId: string;
  name: string;
  branchIds: string[];
}): Promise<string> {
  const inserted = await input.pool.query<{ id: string }>(
    `INSERT INTO v0_menu_items (tenant_id, name, base_price, status)
     VALUES ($1, $2, 3.50, 'ACTIVE')
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

describe("v0 discount integration", () => {
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
    app.use("/v0/discount", bootstrapV0DiscountModule(pool).router);
  });

  afterAll(async () => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
    await pool.end();
  });

  afterEach(() => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
  });

  it("creates branch-owned item rule from preflight and resolves branch eligibility under tenant context", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Discount Eligibility ${uniqueSuffix()}`,
    });

    const itemA = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: `Coffee A ${uniqueSuffix()}`,
      branchIds: [setup.branchAId, setup.branchBId],
    });
    const itemB = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: `Coffee B ${uniqueSuffix()}`,
      branchIds: [setup.branchAId, setup.branchBId],
    });

    const preflight = await request(app)
      .post("/v0/discount/preflight/eligible-items")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .send({
        branchId: setup.branchAId,
        itemIds: [itemA, itemB],
      });
    expect(preflight.status).toBe(200);
    expect(preflight.body.data).toMatchObject({
      branchId: setup.branchAId,
      allEligible: true,
    });
    expect(preflight.body.data.eligibleItemIds.sort()).toEqual([itemA, itemB].sort());
    expect(preflight.body.data.invalidItemIds).toEqual([]);

    const createRes = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-create-${uniqueSuffix()}`)
      .send({
        name: `Coffee Promo ${uniqueSuffix()}`,
        percentage: 10,
        scope: "ITEM",
        branchId: setup.branchAId,
        itemIds: [itemA, itemB],
      });
    expect(createRes.status).toBe(200);
    expect(createRes.body.data).toMatchObject({
      scope: "ITEM",
      status: "INACTIVE",
      branchId: setup.branchAId,
      itemIds: [itemA, itemB],
    });
    const ruleId = createRes.body.data.id as string;

    const activated = await request(app)
      .post(`/v0/discount/rules/${ruleId}/activate`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-activate-${uniqueSuffix()}`)
      .send({});
    expect(activated.status).toBe(200);
    expect(activated.body.data.status).toBe("ACTIVE");

    const persistedRule = await pool.query<{ status: string }>(
      `SELECT status
       FROM v0_discount_rules
       WHERE id = $1`,
      [ruleId]
    );
    expect(persistedRule.rows[0]?.status).toBe("ACTIVE");

    const fetchedRule = await request(app)
      .get(`/v0/discount/rules/${ruleId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`);
    expect(fetchedRule.status).toBe(200);
    expect(fetchedRule.body.data.status).toBe("ACTIVE");

    const eligibleBranchA = await request(app)
      .post("/v0/discount/eligibility/resolve")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .send({
        branchId: setup.branchAId,
        occurredAt: new Date().toISOString(),
        lines: [{ menuItemId: itemA, quantity: 1 }],
      });
    expect(eligibleBranchA.status).toBe(200);
    expect(eligibleBranchA.body.data.rules).toHaveLength(1);
    expect(eligibleBranchA.body.data.rules[0]).toMatchObject({
      ruleId,
      scope: "ITEM",
      percentage: 10,
      stackingPolicy: "MULTIPLICATIVE",
    });
    expect(eligibleBranchA.body.data.rules[0].itemIds.sort()).toEqual([itemA, itemB].sort());

    const eligibleBranchB = await request(app)
      .post("/v0/discount/eligibility/resolve")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .send({
        branchId: setup.branchBId,
        occurredAt: new Date().toISOString(),
        lines: [{ menuItemId: itemA, quantity: 1 }],
      });
    expect(eligibleBranchB.status).toBe(200);
    expect(eligibleBranchB.body.data.rules).toEqual([]);
  });

  it("supports idempotency replay/conflict for rule creation", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Discount Idempotency ${uniqueSuffix()}`,
    });

    const idem = `discount-create-idem-${uniqueSuffix()}`;
    const payload = {
      name: `Branch Promo ${uniqueSuffix()}`,
      percentage: 15,
      scope: "BRANCH_WIDE",
      branchId: setup.branchAId,
    };

    const first = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", idem)
      .send(payload);
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", idem)
      .send(payload);
    expect(replay.status).toBe(200);
    expect(replay.headers["idempotency-replayed"]).toBe("true");

    const conflict = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", idem)
      .send({
        ...payload,
        percentage: 20,
      });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'discount.rules.create'`,
      [setup.tenantId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(1);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND action_key = 'discount.rules.create'
         AND event_type = 'DISCOUNT_RULE_CREATED'`,
      [setup.tenantId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(1);
  });

  it("rejects stale lifecycle status writes using expectedUpdatedAt", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Discount Status Conflict ${uniqueSuffix()}`,
    });

    const created = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-status-conflict-create-${uniqueSuffix()}`)
      .send({
        name: `Stale Toggle ${uniqueSuffix()}`,
        percentage: 12,
        scope: "BRANCH_WIDE",
        branchId: setup.branchAId,
      });
    expect(created.status).toBe(200);
    const ruleId = created.body.data.id as string;
    const originalUpdatedAt = created.body.data.updatedAt as string;

    const activated = await request(app)
      .post(`/v0/discount/rules/${ruleId}/activate`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-status-conflict-activate-${uniqueSuffix()}`)
      .send({
        expectedUpdatedAt: originalUpdatedAt,
      });
    expect(activated.status).toBe(200);
    expect(activated.body.data.status).toBe("ACTIVE");

    const staleDeactivate = await request(app)
      .post(`/v0/discount/rules/${ruleId}/deactivate`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-status-conflict-deactivate-${uniqueSuffix()}`)
      .send({
        expectedUpdatedAt: originalUpdatedAt,
      });
    expect(staleDeactivate.status).toBe(409);
    expect(staleDeactivate.body.code).toBe("DISCOUNT_RULE_STATE_CONFLICT");
    expect(staleDeactivate.body.details).toMatchObject({
      currentStatus: "ACTIVE",
    });

    const persistedRule = await pool.query<{ status: string }>(
      `SELECT status
       FROM v0_discount_rules
       WHERE id = $1`,
      [ruleId]
    );
    expect(persistedRule.rows[0]?.status).toBe("ACTIVE");
  });

  it("denies cashier from creating a discount rule", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Discount Role Guard ${uniqueSuffix()}`,
    });

    const cashierTenantToken = await inviteAcceptAndSelectTenant({
      app,
      ownerToken: setup.ownerToken,
      tenantId: setup.tenantId,
      roleKey: "CASHIER",
    });

    const denied = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${cashierTenantToken}`)
      .set("Idempotency-Key", `discount-cashier-denied-${uniqueSuffix()}`)
      .send({
        name: `Cashier Denied Promo ${uniqueSuffix()}`,
        percentage: 10,
        scope: "BRANCH_WIDE",
        branchId: setup.branchAId,
      });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("PERMISSION_DENIED");
  });

  it("rolls back create rule when outbox insert fails", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Discount Atomicity ${uniqueSuffix()}`,
    });

    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "discount.rules.create";
    const failed = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-atomicity-${uniqueSuffix()}`)
      .send({
        name: `Atomicity Promo ${uniqueSuffix()}`,
        percentage: 10,
        scope: "BRANCH_WIDE",
        branchId: setup.branchAId,
      });
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";

    expect(failed.status).toBe(500);

    const rulesCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_discount_rules
       WHERE tenant_id = $1`,
      [setup.tenantId]
    );
    expect(Number(rulesCount.rows[0]?.count ?? "0")).toBe(0);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'discount.rules.create'`,
      [setup.tenantId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(0);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND action_key = 'discount.rules.create'`,
      [setup.tenantId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(0);
  });

  it("returns overlap warning and requires explicit confirm", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Discount Overlap ${uniqueSuffix()}`,
    });

    const itemA = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: `Overlap A ${uniqueSuffix()}`,
      branchIds: [setup.branchAId],
    });
    const itemB = await seedMenuItem({
      pool,
      tenantId: setup.tenantId,
      name: `Overlap B ${uniqueSuffix()}`,
      branchIds: [setup.branchAId],
    });

    const baseRule = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-overlap-base-${uniqueSuffix()}`)
      .send({
        name: `Base Overlap ${uniqueSuffix()}`,
        percentage: 10,
        scope: "ITEM",
        branchId: setup.branchAId,
        itemIds: [itemA],
      });
    expect(baseRule.status).toBe(200);
    const baseRuleId = baseRule.body.data.id as string;

    const activated = await request(app)
      .post(`/v0/discount/rules/${baseRuleId}/activate`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-overlap-activate-${uniqueSuffix()}`)
      .send({});
    expect(activated.status).toBe(200);

    const warned = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-overlap-warn-${uniqueSuffix()}`)
      .send({
        name: `Overlap Candidate ${uniqueSuffix()}`,
        percentage: 15,
        scope: "ITEM",
        branchId: setup.branchAId,
        itemIds: [itemA, itemB],
      });
    expect(warned.status).toBe(409);
    expect(warned.body.code).toBe("DISCOUNT_RULE_OVERLAP_WARNING");
    expect(warned.body.details?.conflictingRuleIds).toContain(baseRuleId);

    const confirmed = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-overlap-confirm-${uniqueSuffix()}`)
      .send({
        name: `Overlap Confirmed ${uniqueSuffix()}`,
        percentage: 15,
        scope: "ITEM",
        branchId: setup.branchAId,
        itemIds: [itemA, itemB],
        confirmOverlap: true,
      });
    expect(confirmed.status).toBe(200);
  });

  it("denies update when rule is currently eligible", async () => {
    const setup = await setupOwnerTenantContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Discount Effective Inactive ${uniqueSuffix()}`,
    });

    const created = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-update-lock-create-${uniqueSuffix()}`)
      .send({
        name: `Update Lock ${uniqueSuffix()}`,
        percentage: 8,
        scope: "BRANCH_WIDE",
        branchId: setup.branchAId,
      });
    expect(created.status).toBe(200);
    const ruleId = created.body.data.id as string;

    const activated = await request(app)
      .post(`/v0/discount/rules/${ruleId}/activate`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-update-lock-activate-${uniqueSuffix()}`)
      .send({});
    expect(activated.status).toBe(200);

    const denied = await request(app)
      .patch(`/v0/discount/rules/${ruleId}`)
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .set("Idempotency-Key", `discount-update-lock-patch-${uniqueSuffix()}`)
      .send({ name: `Updated Name ${uniqueSuffix()}` });
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe("DISCOUNT_RULE_UPDATE_REQUIRES_EFFECTIVE_INACTIVE");
  });
});

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
import { bootstrapV0PolicyModule } from "../modules/v0/businessSystem/policy/index.js";
import { bootstrapV0CashSessionModule } from "../modules/v0/posOperation/cashSession/index.js";
import { bootstrapV0MenuModule } from "../modules/v0/posOperation/menu/index.js";
import { bootstrapV0DiscountModule } from "../modules/v0/posOperation/discount/index.js";
import { bootstrapV0AttendanceModule } from "../modules/v0/hr/attendance/index.js";
import { bootstrapV0OperationalNotificationModule } from "../modules/v0/platformSystem/operationalNotification/index.js";
import { bootstrapV0PullSyncModule } from "../modules/v0/platformSystem/pullSync/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";

type BranchContext = {
  tenantToken: string;
  branchToken: string;
  tenantId: string;
  branchId: string;
  accountId: string;
};

type MemberBranchContext = {
  accountId: string;
  branchToken: string;
};

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
    firstName: "Sync",
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

async function setupOwnerBranchContext(input: {
  app: express.Express;
  pool: Pool;
}): Promise<BranchContext> {
  const ownerPhone = uniquePhone();
  const ownerToken = await registerAndLogin(input.app, ownerPhone);

  const createdTenant = await request(input.app)
    .post("/v0/auth/tenants")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantName: `Sync Tenant ${uniqueSuffix()}` });
  expect(createdTenant.status).toBe(201);
  const tenantId = createdTenant.body.data.tenant.id as string;

  const ownerAccount = await input.pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE phone = $1`,
    [ownerPhone]
  );
  const accountId = ownerAccount.rows[0]?.id;
  expect(accountId).toBeTruthy();

  const ownerMembershipId = await findActiveOwnerMembershipId({
    pool: input.pool,
    tenantId,
    accountId: accountId!,
  });

  const branchId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: `Sync Branch ${uniqueSuffix()}`,
  });

  await assignActiveBranch({
    pool: input.pool,
    tenantId,
    branchId,
    accountId: accountId!,
    membershipId: ownerMembershipId,
  });
  await seedDefaultBranchEntitlements({ pool: input.pool, tenantId, branchId });

  const tenantSelected = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantId });
  expect(tenantSelected.status).toBe(200);
  const tenantToken = tenantSelected.body.data.accessToken as string;

  const branchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${tenantToken}`)
    .send({ branchId });
  expect(branchSelected.status).toBe(200);

  return {
    tenantToken,
    branchToken: branchSelected.body.data.accessToken as string,
    tenantId,
    branchId,
    accountId: accountId!,
  };
}

async function setupMemberBranchContext(input: {
  app: express.Express;
  pool: Pool;
  tenantId: string;
  branchId: string;
  roleKey: "ADMIN" | "MANAGER" | "CASHIER";
}): Promise<MemberBranchContext> {
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

describe("v0 sync integration", () => {
  let pool: Pool;
  let app: express.Express;
  let syncModule: ReturnType<typeof bootstrapV0PullSyncModule>;
  let operationalNotificationModule: ReturnType<
    typeof bootstrapV0OperationalNotificationModule
  >;

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
    app.use("/v0/attendance", bootstrapV0AttendanceModule(pool).router);
    app.use("/v0/policy", bootstrapV0PolicyModule(pool).router);
    app.use("/v0/cash", bootstrapV0CashSessionModule(pool).router);
    app.use("/v0/menu", bootstrapV0MenuModule(pool).router);
    app.use("/v0/discount", bootstrapV0DiscountModule(pool).router);
    operationalNotificationModule = bootstrapV0OperationalNotificationModule(pool);
    app.use("/v0/notifications", operationalNotificationModule.router);
    syncModule = bootstrapV0PullSyncModule(pool);
    app.use("/v0/sync", syncModule.router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("pulls paginated changes with cursor progression and checkpoint upsert", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });

    await syncModule.repo.appendChange({
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      moduleKey: "menu",
      entityType: "menu_item",
      entityId: "menu-1",
      operation: "UPSERT",
      revision: "rv-1",
      data: { name: "A" },
      changedAt: new Date(),
    });
    await syncModule.repo.appendChange({
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      moduleKey: "menu",
      entityType: "menu_item",
      entityId: "menu-2",
      operation: "UPSERT",
      revision: "rv-2",
      data: { name: "B" },
      changedAt: new Date(),
    });
    await syncModule.repo.appendChange({
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      moduleKey: "menu",
      entityType: "menu_item",
      entityId: "menu-3",
      operation: "TOMBSTONE",
      revision: "rv-3",
      data: null,
      changedAt: new Date(),
    });

    const first = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        deviceId: "tablet-front-counter-01",
        cursor: null,
        limit: 2,
        moduleScopes: ["menu"],
      });

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data.hasMore).toBe(true);
    expect(first.body.data.changes).toHaveLength(2);
    expect(typeof first.body.data.cursor).toBe("string");

    const checkpoint = await syncModule.service.getCheckpoint({
      accountId: setup.accountId,
      deviceId: "tablet-front-counter-01",
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      moduleScopes: ["menu"],
    });
    expect(checkpoint).toBeTruthy();
    expect(checkpoint?.last_sequence).toBe(first.body.data.changes[1].sequence);

    const second = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        deviceId: "tablet-front-counter-01",
        cursor: first.body.data.cursor,
        limit: 2,
        moduleScopes: ["menu"],
      });

    expect(second.status).toBe(200);
    expect(second.body.data.hasMore).toBe(false);
    expect(second.body.data.changes).toHaveLength(1);
    expect(second.body.data.changes[0].operation).toBe("TOMBSTONE");
  });

  it("rejects cursor when module scope no longer matches", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });

    await syncModule.repo.appendChange({
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      moduleKey: "menu",
      entityType: "menu_item",
      entityId: "menu-x",
      operation: "UPSERT",
      revision: "rv-x",
      data: { name: "X" },
      changedAt: new Date(),
    });

    const first = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        cursor: null,
        limit: 50,
        moduleScopes: ["menu"],
      });

    expect(first.status).toBe(200);
    const cursor = first.body.data.cursor as string;

    const mismatch = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        cursor,
        limit: 50,
        moduleScopes: ["policy"],
      });

    expect(mismatch.status).toBe(422);
    expect(mismatch.body.code).toBe("SYNC_CURSOR_INVALID");
  });

  it("produces sync changes from policy and cash-session writes", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });

    const policyRes = await request(app)
      .patch("/v0/policy/current-branch")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .set("Idempotency-Key", `sync-policy-${uniqueSuffix()}`)
      .send({
        saleVatEnabled: true,
        saleVatRatePercent: 10,
      });
    expect(policyRes.status).toBe(200);

    const cashOpenRes = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .set("Idempotency-Key", `sync-cash-open-${uniqueSuffix()}`)
      .send({
        openingFloatUsd: 15,
        openingFloatKhr: 20000,
        note: "sync producer test",
      });
    expect(cashOpenRes.status).toBe(200);

    const pulled = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        cursor: null,
        limit: 200,
        moduleScopes: ["policy", "cashSession"],
      });
    expect(pulled.status).toBe(200);

    const changes = pulled.body.data.changes as Array<{
      moduleKey: string;
      entityType: string;
      operation: string;
    }>;
    const hasPolicy = changes.some(
      (change) => change.moduleKey === "policy" && change.entityType === "branch_policy"
    );
    const hasCashSession = changes.some(
      (change) =>
        change.moduleKey === "cashSession" &&
        change.entityType === "cash_session" &&
        change.operation === "UPSERT"
    );

    expect(hasPolicy).toBe(true);
    expect(hasCashSession).toBe(true);
  });

  it("produces sync changes from menu and discount writes", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });

    const categoryRes = await request(app)
      .post("/v0/menu/categories")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .set("Idempotency-Key", `sync-menu-category-${uniqueSuffix()}`)
      .send({
        name: `Sync Category ${uniqueSuffix()}`,
      });
    expect(categoryRes.status).toBe(200);

    const discountRes = await request(app)
      .post("/v0/discount/rules")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .set("Idempotency-Key", `sync-discount-create-${uniqueSuffix()}`)
      .send({
        name: `Sync Rule ${uniqueSuffix()}`,
        branchId: setup.branchId,
        percentage: 10,
        scope: "BRANCH_WIDE",
        schedule: {
          startAt: null,
          endAt: null,
        },
      });
    expect(discountRes.status).toBe(200);

    const pulled = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        cursor: null,
        limit: 200,
        moduleScopes: ["menu", "discount"],
      });
    expect(pulled.status).toBe(200);

    const changes = pulled.body.data.changes as Array<{
      moduleKey: string;
      entityType: string;
      operation: string;
    }>;

    const hasMenuCategory = changes.some(
      (change) => change.moduleKey === "menu" && change.entityType === "menu_category"
    );
    const hasDiscountRule = changes.some(
      (change) =>
        change.moduleKey === "discount" &&
        change.entityType === "discount_rule" &&
        change.operation === "UPSERT"
    );

    expect(hasMenuCategory).toBe(true);
    expect(hasDiscountRule).toBe(true);
  });

  it("fans out tenant-wide menu changes to other active branches", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const secondBranchId = await createActiveBranch({
      pool,
      tenantId: setup.tenantId,
      branchName: `Sync Branch 2 ${uniqueSuffix()}`,
    });
    const ownerMembershipId = await findActiveOwnerMembershipId({
      pool,
      tenantId: setup.tenantId,
      accountId: setup.accountId,
    });
    await assignActiveBranch({
      pool,
      tenantId: setup.tenantId,
      branchId: secondBranchId,
      accountId: setup.accountId,
      membershipId: ownerMembershipId,
    });
    await seedDefaultBranchEntitlements({
      pool,
      tenantId: setup.tenantId,
      branchId: secondBranchId,
    });

    const secondBranchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${setup.tenantToken}`)
      .send({ branchId: secondBranchId });
    expect(secondBranchSelected.status).toBe(200);
    const secondBranchToken = secondBranchSelected.body.data.accessToken as string;

    const categoryName = `Fanout Category ${uniqueSuffix()}`;
    const categoryRes = await request(app)
      .post("/v0/menu/categories")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .set("Idempotency-Key", `sync-menu-fanout-${uniqueSuffix()}`)
      .send({ name: categoryName });
    expect(categoryRes.status).toBe(200);

    const pullSecondBranch = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${secondBranchToken}`)
      .send({
        cursor: null,
        limit: 200,
        moduleScopes: ["menu"],
      });
    expect(pullSecondBranch.status).toBe(200);

    const changes = pullSecondBranch.body.data.changes as Array<{
      moduleKey: string;
      entityType: string;
      data: Record<string, unknown> | null;
    }>;
    const hasCategory = changes.some(
      (change) =>
        change.moduleKey === "menu" &&
        change.entityType === "menu_category" &&
        change.data !== null &&
        String(change.data.name ?? "") === categoryName
    );
    expect(hasCategory).toBe(true);
  });

  it("scopes attendance sync changes to the actor account", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const cashier = await setupMemberBranchContext({
      app,
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "CASHIER",
    });

    const checkIn = await request(app)
      .post("/v0/attendance/check-in")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .set("Idempotency-Key", `sync-attendance-check-in-${uniqueSuffix()}`)
      .send({});
    expect(checkIn.status).toBe(201);
    const attendanceId = checkIn.body.data.id as string;

    const ownerPull = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        cursor: null,
        limit: 200,
        moduleScopes: ["attendance"],
      });
    expect(ownerPull.status).toBe(200);
    const ownerHasRecord = (ownerPull.body.data.changes as Array<{ entityId: string }>).some(
      (change) => change.entityId === attendanceId
    );
    expect(ownerHasRecord).toBe(true);

    const cashierPull = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${cashier.branchToken}`)
      .send({
        cursor: null,
        limit: 200,
        moduleScopes: ["attendance"],
      });
    expect(cashierPull.status).toBe(200);
    const cashierHasRecord = (
      cashierPull.body.data.changes as Array<{ entityId: string }>
    ).some((change) => change.entityId === attendanceId);
    expect(cashierHasRecord).toBe(false);
  });

  it("scopes operational notification sync changes by recipient account", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const cashier = await setupMemberBranchContext({
      app,
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      roleKey: "CASHIER",
    });

    const emitted = await operationalNotificationModule.service.emit({
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      type: "CASH_SESSION_CLOSED",
      subjectType: "CASH_SESSION",
      subjectId: `session-${uniqueSuffix()}`,
      title: "Cash session closed",
      body: "Variance USD 0.00, KHR 0.00",
      payload: { varianceUsd: 0, varianceKhr: 0 },
      dedupeKey: `sync-notification-${uniqueSuffix()}`,
      recipientAccountIds: [setup.accountId],
    });

    const ownerPull = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .send({
        cursor: null,
        limit: 200,
        moduleScopes: ["operationalNotification"],
      });
    expect(ownerPull.status).toBe(200);
    const ownerHasNotification = (
      ownerPull.body.data.changes as Array<{ entityId: string }>
    ).some((change) => change.entityId === emitted.id);
    expect(ownerHasNotification).toBe(true);

    const cashierPull = await request(app)
      .post("/v0/sync/pull")
      .set("Authorization", `Bearer ${cashier.branchToken}`)
      .send({
        cursor: null,
        limit: 200,
        moduleScopes: ["operationalNotification"],
      });
    expect(cashierPull.status).toBe(200);
    const cashierHasNotification = (
      cashierPull.body.data.changes as Array<{ entityId: string }>
    ).some((change) => change.entityId === emitted.id);
    expect(cashierHasNotification).toBe(false);
  });
});

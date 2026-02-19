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
import { bootstrapV0StaffManagementModule } from "../modules/v0/hr/staffManagement/index.js";
import { bootstrapV0CashSessionModule } from "../modules/v0/posOperation/cashSession/index.js";
import { bootstrapV0OperationalNotificationModule } from "../modules/v0/platformSystem/operationalNotification/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";
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
    firstName: "Ops",
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

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 4_000
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("waitFor timeout");
}

describe("v0 operational notification integration", () => {
  let pool: Pool;
  let app: express.Express;
  let dispatcher: { stop: () => void } | null = null;

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
    app.use("/v0/hr", bootstrapV0StaffManagementModule(pool).router);
    app.use("/v0/cash", bootstrapV0CashSessionModule(pool).router);
    app.use(
      "/v0/notifications",
      bootstrapV0OperationalNotificationModule(pool).router
    );
    dispatcher = startV0CommandOutboxDispatcher({
      db: pool,
      pollIntervalMs: 30,
      batchSize: 50,
    });
  });

  afterAll(async () => {
    dispatcher?.stop();
    await pool.end();
  });

  it("emits CASH_SESSION_CLOSED notification to managerial recipients and supports read flow", async () => {
    const ownerPhone = uniquePhone();
    const managerPhone = uniquePhone();
    const cashierPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);

    const createdTenant = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantName: `Ops Notify ${uniqueSuffix()}` });
    expect(createdTenant.status).toBe(201);
    const tenantId = createdTenant.body.data.tenant.id as string;

    const ownerAccount = await pool.query<{ id: string }>(
      `SELECT id FROM accounts WHERE phone = $1`,
      [ownerPhone]
    );
    const ownerAccountId = ownerAccount.rows[0]?.id;
    expect(ownerAccountId).toBeTruthy();

    const ownerMembershipId = await findActiveOwnerMembershipId({
      pool,
      tenantId,
      accountId: ownerAccountId!,
    });

    const branchId = await createActiveBranch({
      pool,
      tenantId,
      branchName: `Ops Branch ${uniqueSuffix()}`,
    });
    await assignActiveBranch({
      pool,
      tenantId,
      branchId,
      accountId: ownerAccountId!,
      membershipId: ownerMembershipId,
    });
    await seedDefaultBranchEntitlements({ pool, tenantId, branchId });

    const invite = await request(app)
      .post("/v0/org/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: managerPhone,
        roleKey: "MANAGER",
      });
    expect(invite.status).toBe(201);
    const managerMembershipId = invite.body.data.membershipId as string;
    const cashierInvite = await request(app)
      .post("/v0/org/memberships/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        tenantId,
        phone: cashierPhone,
        roleKey: "CASHIER",
      });
    expect(cashierInvite.status).toBe(201);
    const cashierMembershipId = cashierInvite.body.data.membershipId as string;

    const managerToken = await registerAndLogin(app, managerPhone);
    const cashierToken = await registerAndLogin(app, cashierPhone);
    const accepted = await request(app)
      .post(`/v0/org/memberships/invitations/${managerMembershipId}/accept`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({});
    expect(accepted.status).toBe(200);
    const cashierAccepted = await request(app)
      .post(`/v0/org/memberships/invitations/${cashierMembershipId}/accept`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({});
    expect(cashierAccepted.status).toBe(200);

    const assigned = await request(app)
      .post(`/v0/hr/staff/memberships/${managerMembershipId}/branches`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchIds: [branchId] });
    expect(assigned.status).toBe(200);
    const cashierAssigned = await request(app)
      .post(`/v0/hr/staff/memberships/${cashierMembershipId}/branches`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branchIds: [branchId] });
    expect(cashierAssigned.status).toBe(200);

    const ownerTenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    const ownerTenantToken = ownerTenantSelected.body.data.accessToken as string;
    const ownerBranchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${ownerTenantToken}`)
      .send({ branchId });
    const ownerBranchToken = ownerBranchSelected.body.data.accessToken as string;

    const managerTenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ tenantId });
    const managerTenantToken = managerTenantSelected.body.data.accessToken as string;
    const managerBranchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${managerTenantToken}`)
      .send({ branchId });
    const managerBranchToken = managerBranchSelected.body.data.accessToken as string;
    const cashierTenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ tenantId });
    const cashierTenantToken = cashierTenantSelected.body.data.accessToken as string;
    const cashierBranchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${cashierTenantToken}`)
      .send({ branchId });
    const cashierBranchToken = cashierBranchSelected.body.data.accessToken as string;

    const opened = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${ownerBranchToken}`)
      .set("Idempotency-Key", `cash-open-${uniqueSuffix()}`)
      .send({ openingFloatUsd: 20, openingFloatKhr: 50000, note: "start" });
    expect(opened.status).toBe(200);
    const sessionId = opened.body.data.id as string;

    const closed = await request(app)
      .post(`/v0/cash/sessions/${sessionId}/close`)
      .set("Authorization", `Bearer ${ownerBranchToken}`)
      .set("Idempotency-Key", `cash-close-${uniqueSuffix()}`)
      .send({ countedCashUsd: 21, countedCashKhr: 50000, note: "close" });
    expect(closed.status).toBe(200);

    await waitFor(async () => {
      const row = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM v0_operational_notifications
         WHERE tenant_id = $1
           AND branch_id = $2
           AND type = 'CASH_SESSION_CLOSED'
           AND subject_id = $3`,
        [tenantId, branchId, sessionId]
      );
      return Number(row.rows[0]?.count ?? "0") >= 1;
    });

    const unread = await request(app)
      .get("/v0/notifications/unread-count")
      .set("Authorization", `Bearer ${managerBranchToken}`);
    expect(unread.status).toBe(200);
    expect(unread.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    const cashierUnread = await request(app)
      .get("/v0/notifications/unread-count")
      .set("Authorization", `Bearer ${cashierBranchToken}`);
    expect(cashierUnread.status).toBe(200);
    expect(cashierUnread.body.data.unreadCount).toBe(0);

    const inbox = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${managerBranchToken}`);
    expect(inbox.status).toBe(200);
    const item = inbox.body.data.items.find(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "CASH_SESSION_CLOSED" && entry.subjectId === sessionId
    );
    expect(item).toBeTruthy();
    expect(item.payload.varianceUsd).toBeDefined();
    expect(item.payload.varianceKhr).toBeDefined();
    const cashierInbox = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${cashierBranchToken}`);
    expect(cashierInbox.status).toBe(200);
    const leaked = cashierInbox.body.data.items.find(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "CASH_SESSION_CLOSED" && entry.subjectId === sessionId
    );
    expect(leaked).toBeUndefined();

    const markRead = await request(app)
      .post(`/v0/notifications/${item.id}/read`)
      .set("Authorization", `Bearer ${managerBranchToken}`)
      .send({});
    expect(markRead.status).toBe(200);
    expect(markRead.body.data.isRead).toBe(true);

    const unreadAfter = await request(app)
      .get("/v0/notifications/unread-count")
      .set("Authorization", `Bearer ${managerBranchToken}`);
    expect(unreadAfter.status).toBe(200);
    expect(unreadAfter.body.data.unreadCount).toBeLessThan(unread.body.data.unreadCount);
  });
});

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
import { bootstrapV0SaleOrderModule } from "../modules/v0/posOperation/saleOrder/index.js";
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

async function getAccountIdByPhone(input: {
  pool: Pool;
  phone: string;
}): Promise<string> {
  const result = await input.pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE phone = $1 LIMIT 1`,
    [input.phone]
  );
  const accountId = result.rows[0]?.id;
  expect(accountId).toBeTruthy();
  return accountId!;
}

async function selectBranchToken(input: {
  app: express.Express;
  accessToken: string;
  tenantId: string;
  branchId: string;
}): Promise<string> {
  const tenantSelected = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${input.accessToken}`)
    .send({ tenantId: input.tenantId });
  expect(tenantSelected.status).toBe(200);

  const tenantToken = tenantSelected.body.data.accessToken as string;
  const branchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${tenantToken}`)
    .send({ branchId: input.branchId });
  expect(branchSelected.status).toBe(200);

  return branchSelected.body.data.accessToken as string;
}

async function setupTeamBranchContext(input: {
  app: express.Express;
  pool: Pool;
}): Promise<{
  tenantId: string;
  branchId: string;
  ownerAccountId: string;
  ownerBranchToken: string;
  managerAccountId: string;
  managerBranchToken: string;
  cashierAccountId: string;
  cashierBranchToken: string;
}> {
  const ownerPhone = uniquePhone();
  const managerPhone = uniquePhone();
  const cashierPhone = uniquePhone();
  const ownerToken = await registerAndLogin(input.app, ownerPhone);

  const createdTenant = await request(input.app)
    .post("/v0/auth/tenants")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantName: `Ops Notify ${uniqueSuffix()}` });
  expect(createdTenant.status).toBe(201);
  const tenantId = createdTenant.body.data.tenant.id as string;

  const ownerAccountId = await getAccountIdByPhone({
    pool: input.pool,
    phone: ownerPhone,
  });
  const ownerMembershipId = await findActiveOwnerMembershipId({
    pool: input.pool,
    tenantId,
    accountId: ownerAccountId,
  });

  const branchId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: `Ops Branch ${uniqueSuffix()}`,
  });
  await assignActiveBranch({
    pool: input.pool,
    tenantId,
    branchId,
    accountId: ownerAccountId,
    membershipId: ownerMembershipId,
  });
  await seedDefaultBranchEntitlements({
    pool: input.pool,
    tenantId,
    branchId,
  });

  const managerInvite = await request(input.app)
    .post("/v0/org/memberships/invite")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      tenantId,
      phone: managerPhone,
      roleKey: "MANAGER",
    });
  expect(managerInvite.status).toBe(201);
  const managerMembershipId = managerInvite.body.data.membershipId as string;

  const cashierInvite = await request(input.app)
    .post("/v0/org/memberships/invite")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({
      tenantId,
      phone: cashierPhone,
      roleKey: "CASHIER",
    });
  expect(cashierInvite.status).toBe(201);
  const cashierMembershipId = cashierInvite.body.data.membershipId as string;

  const managerToken = await registerAndLogin(input.app, managerPhone);
  const cashierToken = await registerAndLogin(input.app, cashierPhone);

  const managerAccepted = await request(input.app)
    .post(`/v0/org/memberships/invitations/${managerMembershipId}/accept`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({});
  expect(managerAccepted.status).toBe(200);

  const cashierAccepted = await request(input.app)
    .post(`/v0/org/memberships/invitations/${cashierMembershipId}/accept`)
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({});
  expect(cashierAccepted.status).toBe(200);

  await request(input.app)
    .post(`/v0/hr/staff/memberships/${managerMembershipId}/branches`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ branchIds: [branchId] })
    .expect(200);
  await request(input.app)
    .post(`/v0/hr/staff/memberships/${cashierMembershipId}/branches`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ branchIds: [branchId] })
    .expect(200);

  const managerAccountId = await getAccountIdByPhone({
    pool: input.pool,
    phone: managerPhone,
  });
  const cashierAccountId = await getAccountIdByPhone({
    pool: input.pool,
    phone: cashierPhone,
  });

  const ownerBranchToken = await selectBranchToken({
    app: input.app,
    accessToken: ownerToken,
    tenantId,
    branchId,
  });
  const managerBranchToken = await selectBranchToken({
    app: input.app,
    accessToken: managerToken,
    tenantId,
    branchId,
  });
  const cashierBranchToken = await selectBranchToken({
    app: input.app,
    accessToken: cashierToken,
    tenantId,
    branchId,
  });

  return {
    tenantId,
    branchId,
    ownerAccountId,
    ownerBranchToken,
    managerAccountId,
    managerBranchToken,
    cashierAccountId,
    cashierBranchToken,
  };
}

async function insertFinalizedCashSale(input: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  finalizedByAccountId: string;
  grandTotalUsd?: number;
  grandTotalKhr?: number;
}): Promise<string> {
  const grandTotalUsd = input.grandTotalUsd ?? 8;
  const grandTotalKhr = input.grandTotalKhr ?? grandTotalUsd * 4100;
  const finalizedAt = new Date();

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
       sale_type
     )
     VALUES (
       $1,
       $2,
       'FINALIZED',
       'CASH',
       'USD',
       $3::NUMERIC(14,2),
       $3::NUMERIC(14,2),
       0,
       $3::NUMERIC(14,2),
       $4::NUMERIC(14,2),
       0,
       0,
       0,
       0,
       $3::NUMERIC(14,2),
       $4::NUMERIC(14,2),
       4100,
       TRUE,
       'NEAREST',
       100,
       $3::NUMERIC(14,2),
       0,
       0,
       $3::NUMERIC(14,2),
       $3::NUMERIC(14,2),
       $5,
       $6,
       'DINE_IN'
     )
     RETURNING id`,
    [
      input.tenantId,
      input.branchId,
      grandTotalUsd,
      grandTotalKhr,
      finalizedAt,
      input.finalizedByAccountId,
    ]
  );
  return result.rows[0].id;
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
    app.use("/v0", bootstrapV0SaleOrderModule(pool).router);
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

  it("emits VOID_APPROVAL_NEEDED to managerial recipients and VOID_APPROVED to the requester", async () => {
    const setup = await setupTeamBranchContext({ app, pool });
    const saleId = await insertFinalizedCashSale({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      finalizedByAccountId: setup.ownerAccountId,
    });

    const requested = await request(app)
      .post(`/v0/sales/${saleId}/void/request`)
      .set("Authorization", `Bearer ${setup.cashierBranchToken}`)
      .set("Idempotency-Key", `void-request-${uniqueSuffix()}`)
      .send({ reason: "Wrong item prepared" });
    expect(requested.status).toBe(200);
    const voidRequestId = requested.body.data.id as string;

    await waitFor(async () => {
      const row = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM v0_operational_notifications
         WHERE tenant_id = $1
           AND branch_id = $2
           AND type = 'VOID_APPROVAL_NEEDED'
           AND subject_id = $3`,
        [setup.tenantId, setup.branchId, saleId]
      );
      return Number(row.rows[0]?.count ?? "0") >= 1;
    });

    const managerInbox = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${setup.managerBranchToken}`);
    expect(managerInbox.status).toBe(200);
    const approvalNeeded = managerInbox.body.data.items.find(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "VOID_APPROVAL_NEEDED" && entry.subjectId === saleId
    );
    expect(approvalNeeded).toBeTruthy();
    expect(approvalNeeded.payload.voidRequestId).toBe(voidRequestId);
    expect(approvalNeeded.payload.reason).toBe("Wrong item prepared");

    const cashierInboxBefore = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${setup.cashierBranchToken}`);
    expect(cashierInboxBefore.status).toBe(200);
    const leakedRequestNotification = cashierInboxBefore.body.data.items.find(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "VOID_APPROVAL_NEEDED" && entry.subjectId === saleId
    );
    expect(leakedRequestNotification).toBeUndefined();

    const approved = await request(app)
      .post(`/v0/sales/${saleId}/void/approve`)
      .set("Authorization", `Bearer ${setup.managerBranchToken}`)
      .set("Idempotency-Key", `void-approve-${uniqueSuffix()}`)
      .send({ note: "Approved by manager" });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("APPROVED");

    await waitFor(async () => {
      const row = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM v0_operational_notifications
         WHERE tenant_id = $1
           AND branch_id = $2
           AND type = 'VOID_APPROVED'
           AND subject_id = $3`,
        [setup.tenantId, setup.branchId, saleId]
      );
      return Number(row.rows[0]?.count ?? "0") >= 1;
    });

    const cashierInboxAfter = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${setup.cashierBranchToken}`);
    expect(cashierInboxAfter.status).toBe(200);
    const approvedItem = cashierInboxAfter.body.data.items.find(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "VOID_APPROVED" && entry.subjectId === saleId
    );
    expect(approvedItem).toBeTruthy();
    expect(approvedItem.payload.voidRequestId).toBe(voidRequestId);
    expect(approvedItem.payload.status).toBe("APPROVED");
    expect(approvedItem.payload.reviewNote).toBe("Approved by manager");
    expect(approvedItem.payload.requestedByAccountId).toBe(setup.cashierAccountId);
    expect(approvedItem.payload.reviewedByAccountId).toBe(setup.managerAccountId);

    const managerInboxAfter = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${setup.managerBranchToken}`);
    expect(managerInboxAfter.status).toBe(200);
    const managerApprovedItem = managerInboxAfter.body.data.items.find(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "VOID_APPROVED" && entry.subjectId === saleId
    );
    expect(managerApprovedItem).toBeUndefined();
  });

  it("emits VOID_REJECTED to the original requester", async () => {
    const setup = await setupTeamBranchContext({ app, pool });
    const saleId = await insertFinalizedCashSale({
      pool,
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      finalizedByAccountId: setup.ownerAccountId,
    });

    const requested = await request(app)
      .post(`/v0/sales/${saleId}/void/request`)
      .set("Authorization", `Bearer ${setup.cashierBranchToken}`)
      .set("Idempotency-Key", `void-request-reject-${uniqueSuffix()}`)
      .send({ reason: "Customer changed mind" });
    expect(requested.status).toBe(200);
    const voidRequestId = requested.body.data.id as string;

    await waitFor(async () => {
      const row = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM v0_operational_notifications
         WHERE tenant_id = $1
           AND branch_id = $2
           AND type = 'VOID_APPROVAL_NEEDED'
           AND subject_id = $3`,
        [setup.tenantId, setup.branchId, saleId]
      );
      return Number(row.rows[0]?.count ?? "0") >= 1;
    });

    const rejected = await request(app)
      .post(`/v0/sales/${saleId}/void/reject`)
      .set("Authorization", `Bearer ${setup.managerBranchToken}`)
      .set("Idempotency-Key", `void-reject-${uniqueSuffix()}`)
      .send({ note: "Keep sale record" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe("REJECTED");

    await waitFor(async () => {
      const row = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM v0_operational_notifications
         WHERE tenant_id = $1
           AND branch_id = $2
           AND type = 'VOID_REJECTED'
           AND subject_id = $3`,
        [setup.tenantId, setup.branchId, saleId]
      );
      return Number(row.rows[0]?.count ?? "0") >= 1;
    });

    const cashierInbox = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${setup.cashierBranchToken}`);
    expect(cashierInbox.status).toBe(200);
    const rejectedItem = cashierInbox.body.data.items.find(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "VOID_REJECTED" && entry.subjectId === saleId
    );
    expect(rejectedItem).toBeTruthy();
    expect(rejectedItem.payload.voidRequestId).toBe(voidRequestId);
    expect(rejectedItem.payload.status).toBe("REJECTED");
    expect(rejectedItem.payload.reviewNote).toBe("Keep sale record");
    expect(rejectedItem.payload.requestedByAccountId).toBe(setup.cashierAccountId);
    expect(rejectedItem.payload.reviewedByAccountId).toBe(setup.managerAccountId);
  });
});

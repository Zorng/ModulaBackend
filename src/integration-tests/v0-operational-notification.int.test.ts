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

async function selectTenantToken(input: {
  app: express.Express;
  accessToken: string;
  tenantId: string;
}): Promise<string> {
  const tenantSelected = await request(input.app)
    .post("/v0/auth/context/tenant/select")
    .set("Authorization", `Bearer ${input.accessToken}`)
    .send({ tenantId: input.tenantId });
  expect(tenantSelected.status).toBe(200);
  return tenantSelected.body.data.accessToken as string;
}

async function setupTeamBranchContext(input: {
  app: express.Express;
  pool: Pool;
}): Promise<{
  tenantId: string;
  branchId: string;
  ownerAccountId: string;
  ownerAccessToken: string;
  ownerTenantToken: string;
  ownerBranchToken: string;
  managerAccountId: string;
  managerAccessToken: string;
  managerTenantToken: string;
  managerBranchToken: string;
  cashierAccountId: string;
  cashierAccessToken: string;
  cashierTenantToken: string;
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

  const ownerTenantToken = await selectTenantToken({
    app: input.app,
    accessToken: ownerToken,
    tenantId,
  });
  const ownerBranchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${ownerTenantToken}`)
    .send({ branchId });
  expect(ownerBranchSelected.status).toBe(200);
  const ownerBranchToken = ownerBranchSelected.body.data.accessToken as string;

  const managerTenantToken = await selectTenantToken({
    app: input.app,
    accessToken: managerToken,
    tenantId,
  });
  const managerBranchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${managerTenantToken}`)
    .send({ branchId });
  expect(managerBranchSelected.status).toBe(200);
  const managerBranchToken = managerBranchSelected.body.data.accessToken as string;

  const cashierTenantToken = await selectTenantToken({
    app: input.app,
    accessToken: cashierToken,
    tenantId,
  });
  const cashierBranchSelected = await request(input.app)
    .post("/v0/auth/context/branch/select")
    .set("Authorization", `Bearer ${cashierTenantToken}`)
    .send({ branchId });
  expect(cashierBranchSelected.status).toBe(200);
  const cashierBranchToken = cashierBranchSelected.body.data.accessToken as string;

  return {
    tenantId,
    branchId,
    ownerAccountId,
    ownerAccessToken: ownerToken,
    ownerTenantToken,
    ownerBranchToken,
    managerAccountId,
    managerAccessToken: managerToken,
    managerTenantToken,
    managerBranchToken,
    cashierAccountId,
    cashierAccessToken: cashierToken,
    cashierTenantToken,
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

async function createTenantBranchForOwner(input: {
  app: express.Express;
  pool: Pool;
  ownerAccessToken: string;
  ownerAccountId: string;
  tenantName: string;
  branchName: string;
}): Promise<{
  tenantId: string;
  branchId: string;
  ownerTenantToken: string;
  ownerBranchToken: string;
}> {
  const createdTenant = await request(input.app)
    .post("/v0/auth/tenants")
    .set("Authorization", `Bearer ${input.ownerAccessToken}`)
    .send({ tenantName: input.tenantName });
  expect(createdTenant.status).toBe(201);

  const tenantId = createdTenant.body.data.tenant.id as string;
  const ownerMembershipId = await findActiveOwnerMembershipId({
    pool: input.pool,
    tenantId,
    accountId: input.ownerAccountId,
  });

  const branchId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: input.branchName,
  });
  await assignActiveBranch({
    pool: input.pool,
    tenantId,
    branchId,
    accountId: input.ownerAccountId,
    membershipId: ownerMembershipId,
  });
  await seedDefaultBranchEntitlements({
    pool: input.pool,
    tenantId,
    branchId,
  });

  const ownerTenantToken = await selectTenantToken({
    app: input.app,
    accessToken: input.ownerAccessToken,
    tenantId,
  });
  const ownerBranchToken = await selectBranchToken({
    app: input.app,
    accessToken: input.ownerAccessToken,
    tenantId,
    branchId,
  });

  return {
    tenantId,
    branchId,
    ownerTenantToken,
    ownerBranchToken,
  };
}

async function getActiveMembershipId(input: {
  pool: Pool;
  tenantId: string;
  accountId: string;
}): Promise<string> {
  const result = await input.pool.query<{ id: string }>(
    `SELECT id
     FROM v0_tenant_memberships
     WHERE tenant_id = $1
       AND account_id = $2
       AND status = 'ACTIVE'
     LIMIT 1`,
    [input.tenantId, input.accountId]
  );
  const membershipId = result.rows[0]?.id;
  expect(membershipId).toBeTruthy();
  return membershipId!;
}

type SseEvent = {
  event: string;
  data: Record<string, unknown>;
};

async function openNotificationStream(input: {
  app: express.Express;
  accessToken: string;
}): Promise<{
  nextEvent: () => Promise<SseEvent>;
  close: () => Promise<void>;
}> {
  const server = input.app.listen(0);
  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to resolve notification stream server address");
  }

  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${address.port}/v0/notifications/stream`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "text/event-stream",
    },
    signal: controller.signal,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");

  const reader = response.body?.getReader();
  expect(reader).toBeTruthy();
  const decoder = new TextDecoder();
  let buffer = "";

  const nextEvent = async (): Promise<SseEvent> => {
    while (true) {
      const marker = buffer.indexOf("\n\n");
      if (marker >= 0) {
        const rawChunk = buffer.slice(0, marker).replace(/\r\n/g, "\n");
        buffer = buffer.slice(marker + 2);
        const parsed = parseSseChunk(rawChunk);
        if (parsed) {
          return parsed;
        }
      }

      const chunk = await reader!.read();
      if (chunk.done) {
        throw new Error("notification stream ended unexpectedly");
      }
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };

  const close = async (): Promise<void> => {
    try {
      await reader?.cancel();
    } catch {}
    controller.abort();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  return { nextEvent, close };
}

function parseSseChunk(rawChunk: string): SseEvent | null {
  const chunk = rawChunk.trim();
  if (!chunk || chunk.startsWith(":")) {
    return null;
  }

  let event = "message";
  const dataLines: string[] = [];
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: JSON.parse(dataLines.join("\n")) as Record<string, unknown>,
  };
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
      .set("Authorization", `Bearer ${managerTenantToken}`);
    expect(unread.status).toBe(200);
    expect(unread.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    const cashierUnread = await request(app)
      .get("/v0/notifications/unread-count")
      .set("Authorization", `Bearer ${cashierTenantToken}`);
    expect(cashierUnread.status).toBe(200);
    expect(cashierUnread.body.data.unreadCount).toBe(0);

    const inbox = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${managerTenantToken}`);
    expect(inbox.status).toBe(200);
    const item = inbox.body.data.items.find(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "CASH_SESSION_CLOSED" && entry.subjectId === sessionId
    );
    expect(item).toBeTruthy();
    expect(item.branchId).toBe(branchId);
    expect(typeof item.branchName).toBe("string");
    expect(item.payload.varianceUsd).toBeDefined();
    expect(item.payload.varianceKhr).toBeDefined();
    const cashierInbox = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${cashierTenantToken}`);
    expect(cashierInbox.status).toBe(200);
    const leaked = cashierInbox.body.data.items.find(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "CASH_SESSION_CLOSED" && entry.subjectId === sessionId
    );
    expect(leaked).toBeUndefined();

    const markRead = await request(app)
      .post(`/v0/notifications/${item.id}/read`)
      .set("Authorization", `Bearer ${managerTenantToken}`)
      .send({});
    expect(markRead.status).toBe(200);
    expect(markRead.body.data.isRead).toBe(true);

    const unreadAfter = await request(app)
      .get("/v0/notifications/unread-count")
      .set("Authorization", `Bearer ${managerTenantToken}`);
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
      .set("Authorization", `Bearer ${setup.managerTenantToken}`);
    expect(managerInbox.status).toBe(200);
    const approvalNeeded = managerInbox.body.data.items.find(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "VOID_APPROVAL_NEEDED" && entry.subjectId === saleId
    );
    expect(approvalNeeded).toBeTruthy();
    expect(approvalNeeded.branchId).toBe(setup.branchId);
    expect(typeof approvalNeeded.branchName).toBe("string");
    expect(approvalNeeded.payload.voidRequestId).toBe(voidRequestId);
    expect(approvalNeeded.payload.reason).toBe("Wrong item prepared");

    const cashierInboxBefore = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${setup.cashierTenantToken}`);
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
      .set("Authorization", `Bearer ${setup.cashierTenantToken}`);
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
      .set("Authorization", `Bearer ${setup.managerTenantToken}`);
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
      .set("Authorization", `Bearer ${setup.cashierTenantToken}`);
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

  it("supports account-scoped inbox queries across branches within one tenant using a tenant token", async () => {
    const setup = await setupTeamBranchContext({ app, pool });
    const secondBranchName = `Ops Branch ${uniqueSuffix()}`;
    const secondBranchId = await createActiveBranch({
      pool,
      tenantId: setup.tenantId,
      branchName: secondBranchName,
    });
    await seedDefaultBranchEntitlements({
      pool,
      tenantId: setup.tenantId,
      branchId: secondBranchId,
    });

    const ownerMembershipId = await findActiveOwnerMembershipId({
      pool,
      tenantId: setup.tenantId,
      accountId: setup.ownerAccountId,
    });
    await assignActiveBranch({
      pool,
      tenantId: setup.tenantId,
      branchId: secondBranchId,
      accountId: setup.ownerAccountId,
      membershipId: ownerMembershipId,
    });

    const managerMembershipId = await getActiveMembershipId({
      pool,
      tenantId: setup.tenantId,
      accountId: setup.managerAccountId,
    });
    await assignActiveBranch({
      pool,
      tenantId: setup.tenantId,
      branchId: secondBranchId,
      accountId: setup.managerAccountId,
      membershipId: managerMembershipId,
    });

    const ownerSecondBranchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${setup.ownerTenantToken}`)
      .send({ branchId: secondBranchId });
    expect(ownerSecondBranchSelected.status).toBe(200);
    const ownerSecondBranchToken = ownerSecondBranchSelected.body.data.accessToken as string;

    const firstOpened = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `cash-open-a-${uniqueSuffix()}`)
      .send({ openingFloatUsd: 20, openingFloatKhr: 50000, note: "start" });
    expect(firstOpened.status).toBe(200);
    const firstSessionId = firstOpened.body.data.id as string;
    const firstClosed = await request(app)
      .post(`/v0/cash/sessions/${firstSessionId}/close`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `cash-close-a-${uniqueSuffix()}`)
      .send({ countedCashUsd: 20, countedCashKhr: 50000, note: "close" });
    expect(firstClosed.status).toBe(200);

    const secondOpened = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${ownerSecondBranchToken}`)
      .set("Idempotency-Key", `cash-open-b-${uniqueSuffix()}`)
      .send({ openingFloatUsd: 30, openingFloatKhr: 75000, note: "start" });
    expect(secondOpened.status).toBe(200);
    const secondSessionId = secondOpened.body.data.id as string;
    const secondClosed = await request(app)
      .post(`/v0/cash/sessions/${secondSessionId}/close`)
      .set("Authorization", `Bearer ${ownerSecondBranchToken}`)
      .set("Idempotency-Key", `cash-close-b-${uniqueSuffix()}`)
      .send({ countedCashUsd: 31, countedCashKhr: 75000, note: "close" });
    expect(secondClosed.status).toBe(200);

    await waitFor(async () => {
      const row = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM v0_operational_notification_recipients r
         JOIN v0_operational_notifications n
           ON n.id = r.notification_id
         WHERE r.tenant_id = $1
           AND r.recipient_account_id = $2
           AND n.type = 'CASH_SESSION_CLOSED'
           AND n.subject_id = ANY($3::TEXT[])`,
        [setup.tenantId, setup.managerAccountId, [firstSessionId, secondSessionId]]
      );
      return Number(row.rows[0]?.count ?? "0") >= 2;
    });

    const unread = await request(app)
      .get("/v0/notifications/unread-count")
      .set("Authorization", `Bearer ${setup.managerTenantToken}`);
    expect(unread.status).toBe(200);
    expect(unread.body.data.unreadCount).toBe(2);

    const inbox = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${setup.managerTenantToken}`);
    expect(inbox.status).toBe(200);
    const items = inbox.body.data.items.filter(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "CASH_SESSION_CLOSED" &&
        [firstSessionId, secondSessionId].includes(entry.subjectId)
    );
    expect(items).toHaveLength(2);
    expect(items.map((entry: { branchId: string }) => entry.branchId).sort()).toEqual(
      [setup.branchId, secondBranchId].sort()
    );
    const branchNames = items.map((entry: { branchName: string | null }) => entry.branchName);
    expect(branchNames).toContain(secondBranchName);
    expect(branchNames.some((name: string | null) => typeof name === "string")).toBe(true);

    const filteredInbox = await request(app)
      .get(`/v0/notifications/inbox?branchId=${secondBranchId}`)
      .set("Authorization", `Bearer ${setup.managerTenantToken}`);
    expect(filteredInbox.status).toBe(200);
    const filteredItems = filteredInbox.body.data.items.filter(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "CASH_SESSION_CLOSED" &&
        [firstSessionId, secondSessionId].includes(entry.subjectId)
    );
    expect(filteredItems).toHaveLength(1);
    expect(filteredItems[0].branchId).toBe(secondBranchId);
    expect(filteredItems[0].branchName).toBe(secondBranchName);

    const detail = await request(app)
      .get(`/v0/notifications/${filteredItems[0].id}`)
      .set("Authorization", `Bearer ${setup.managerTenantToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.branchId).toBe(secondBranchId);
    expect(detail.body.data.branchName).toBe(secondBranchName);

    const readAll = await request(app)
      .post("/v0/notifications/read-all")
      .set("Authorization", `Bearer ${setup.managerTenantToken}`)
      .send({});
    expect(readAll.status).toBe(200);
    expect(readAll.body.data.updatedCount).toBe(2);

    const unreadAfter = await request(app)
      .get("/v0/notifications/unread-count")
      .set("Authorization", `Bearer ${setup.managerTenantToken}`);
    expect(unreadAfter.status).toBe(200);
    expect(unreadAfter.body.data.unreadCount).toBe(0);
  });

  it("supports account-scoped inbox queries across tenants without tenant selection", async () => {
    const setup = await setupTeamBranchContext({ app, pool });
    const secondTenantName = `Ops Notify ${uniqueSuffix()}`;
    const secondBranchName = `Ops Branch ${uniqueSuffix()}`;
    const secondTenant = await createTenantBranchForOwner({
      app,
      pool,
      ownerAccessToken: setup.ownerAccessToken,
      ownerAccountId: setup.ownerAccountId,
      tenantName: secondTenantName,
      branchName: secondBranchName,
    });

    const firstOpened = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `cash-open-account-a-${uniqueSuffix()}`)
      .send({ openingFloatUsd: 20, openingFloatKhr: 50000, note: "start" });
    expect(firstOpened.status).toBe(200);
    const firstSessionId = firstOpened.body.data.id as string;
    const firstClosed = await request(app)
      .post(`/v0/cash/sessions/${firstSessionId}/close`)
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", `cash-close-account-a-${uniqueSuffix()}`)
      .send({ countedCashUsd: 20, countedCashKhr: 50000, note: "close" });
    expect(firstClosed.status).toBe(200);

    const secondOpened = await request(app)
      .post("/v0/cash/sessions")
      .set("Authorization", `Bearer ${secondTenant.ownerBranchToken}`)
      .set("Idempotency-Key", `cash-open-account-b-${uniqueSuffix()}`)
      .send({ openingFloatUsd: 30, openingFloatKhr: 75000, note: "start" });
    expect(secondOpened.status).toBe(200);
    const secondSessionId = secondOpened.body.data.id as string;
    const secondClosed = await request(app)
      .post(`/v0/cash/sessions/${secondSessionId}/close`)
      .set("Authorization", `Bearer ${secondTenant.ownerBranchToken}`)
      .set("Idempotency-Key", `cash-close-account-b-${uniqueSuffix()}`)
      .send({ countedCashUsd: 31, countedCashKhr: 75000, note: "close" });
    expect(secondClosed.status).toBe(200);

    await waitFor(async () => {
      const row = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
         FROM v0_operational_notification_recipients r
         JOIN v0_operational_notifications n
           ON n.id = r.notification_id
         WHERE r.recipient_account_id = $1
           AND n.type = 'CASH_SESSION_CLOSED'
           AND n.subject_id = ANY($2::TEXT[])`,
        [setup.ownerAccountId, [firstSessionId, secondSessionId]]
      );
      return Number(row.rows[0]?.count ?? "0") >= 2;
    });

    const unread = await request(app)
      .get("/v0/notifications/unread-count")
      .set("Authorization", `Bearer ${setup.ownerAccessToken}`);
    expect(unread.status).toBe(200);
    expect(unread.body.data.unreadCount).toBe(2);

    const inbox = await request(app)
      .get("/v0/notifications/inbox")
      .set("Authorization", `Bearer ${setup.ownerAccessToken}`);
    expect(inbox.status).toBe(200);
    const items = inbox.body.data.items.filter(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "CASH_SESSION_CLOSED" &&
        [firstSessionId, secondSessionId].includes(entry.subjectId)
    );
    expect(items).toHaveLength(2);
    expect(items.map((entry: { tenantId: string }) => entry.tenantId).sort()).toEqual(
      [setup.tenantId, secondTenant.tenantId].sort()
    );
    expect(items.map((entry: { branchId: string }) => entry.branchId).sort()).toEqual(
      [setup.branchId, secondTenant.branchId].sort()
    );
    expect(
      items.some(
        (entry: { tenantId: string; tenantName: string; branchName: string | null }) =>
          entry.tenantId === secondTenant.tenantId &&
          entry.tenantName === secondTenantName &&
          entry.branchName === secondBranchName
      )
    ).toBe(true);

    const filteredInbox = await request(app)
      .get(`/v0/notifications/inbox?tenantId=${secondTenant.tenantId}`)
      .set("Authorization", `Bearer ${setup.ownerAccessToken}`);
    expect(filteredInbox.status).toBe(200);
    const filteredItems = filteredInbox.body.data.items.filter(
      (entry: { type: string; subjectId: string }) =>
        entry.type === "CASH_SESSION_CLOSED" &&
        [firstSessionId, secondSessionId].includes(entry.subjectId)
    );
    expect(filteredItems).toHaveLength(1);
    expect(filteredItems[0].tenantId).toBe(secondTenant.tenantId);
    expect(filteredItems[0].tenantName).toBe(secondTenantName);
    expect(filteredItems[0].branchId).toBe(secondTenant.branchId);
    expect(filteredItems[0].branchName).toBe(secondBranchName);

    const detail = await request(app)
      .get(`/v0/notifications/${filteredItems[0].id}`)
      .set("Authorization", `Bearer ${setup.ownerAccessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.tenantId).toBe(secondTenant.tenantId);
    expect(detail.body.data.tenantName).toBe(secondTenantName);
    expect(detail.body.data.branchId).toBe(secondTenant.branchId);
    expect(detail.body.data.branchName).toBe(secondBranchName);

    const markRead = await request(app)
      .post(`/v0/notifications/${filteredItems[0].id}/read`)
      .set("Authorization", `Bearer ${setup.ownerAccessToken}`)
      .send({});
    expect(markRead.status).toBe(200);
    expect(markRead.body.data.isRead).toBe(true);

    const unreadAfterSingle = await request(app)
      .get("/v0/notifications/unread-count")
      .set("Authorization", `Bearer ${setup.ownerAccessToken}`);
    expect(unreadAfterSingle.status).toBe(200);
    expect(unreadAfterSingle.body.data.unreadCount).toBe(1);

    const readAll = await request(app)
      .post("/v0/notifications/read-all")
      .set("Authorization", `Bearer ${setup.ownerAccessToken}`)
      .send({});
    expect(readAll.status).toBe(200);
    expect(readAll.body.data.updatedCount).toBe(1);

    const unreadAfter = await request(app)
      .get("/v0/notifications/unread-count")
      .set("Authorization", `Bearer ${setup.ownerAccessToken}`);
    expect(unreadAfter.status).toBe(200);
    expect(unreadAfter.body.data.unreadCount).toBe(0);
  });

  it("streams account-scoped notifications across tenants with tenant and branch metadata", async () => {
    const setup = await setupTeamBranchContext({ app, pool });
    const secondTenantName = `Ops Notify ${uniqueSuffix()}`;
    const secondBranchName = `Ops Branch ${uniqueSuffix()}`;
    const secondTenant = await createTenantBranchForOwner({
      app,
      pool,
      ownerAccessToken: setup.ownerAccessToken,
      ownerAccountId: setup.ownerAccountId,
      tenantName: secondTenantName,
      branchName: secondBranchName,
    });

    const stream = await openNotificationStream({
      app,
      accessToken: setup.ownerAccessToken,
    });

    try {
      const ready = await stream.nextEvent();
      expect(ready.event).toBe("ready");
      expect(ready.data.unreadCount).toBe(0);
      expect(typeof ready.data.serverTime).toBe("string");

      const opened = await request(app)
        .post("/v0/cash/sessions")
        .set("Authorization", `Bearer ${secondTenant.ownerBranchToken}`)
        .set("Idempotency-Key", `cash-open-stream-${uniqueSuffix()}`)
        .send({ openingFloatUsd: 10, openingFloatKhr: 25000, note: "start" });
      expect(opened.status).toBe(200);
      const sessionId = opened.body.data.id as string;

      const closed = await request(app)
        .post(`/v0/cash/sessions/${sessionId}/close`)
        .set("Authorization", `Bearer ${secondTenant.ownerBranchToken}`)
        .set("Idempotency-Key", `cash-close-stream-${uniqueSuffix()}`)
        .send({ countedCashUsd: 10, countedCashKhr: 25000, note: "close" });
      expect(closed.status).toBe(200);

      const created = await stream.nextEvent();
      expect(created.event).toBe("notification.created");
      expect(created.data.tenantId).toBe(secondTenant.tenantId);
      expect(created.data.tenantName).toBe(secondTenantName);
      expect(created.data.branchId).toBe(secondTenant.branchId);
      expect(created.data.branchName).toBe(secondBranchName);
      expect(created.data.notificationType).toBe("CASH_SESSION_CLOSED");
      expect(created.data.subjectId).toBe(sessionId);
      expect(created.data.unreadCount).toBe(1);
    } finally {
      await stream.close();
    }
  });
});

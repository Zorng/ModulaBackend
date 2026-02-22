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
import {
  bootstrapV0KhqrPaymentModule,
  startV0KhqrReconciliationDispatcher,
} from "../modules/v0/platformSystem/khqrPayment/index.js";
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
    firstName: "KHQR",
    lastName: "Owner",
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
}): Promise<{
  branchToken: string;
  tenantId: string;
  branchId: string;
}> {
  const ownerPhone = uniquePhone();
  const ownerToken = await registerAndLogin(input.app, ownerPhone);

  const createdTenant = await request(input.app)
    .post("/v0/auth/tenants")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tenantName: `KHQR Tenant ${uniqueSuffix()}` });
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
    branchName: `KHQR Branch ${uniqueSuffix()}`,
    khqrReceiverAccountId: "khqr-receiver",
    khqrReceiverName: "Khqr Receiver",
  });

  await assignActiveBranch({
    pool: input.pool,
    tenantId,
    branchId,
    accountId: ownerAccountId!,
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
  const branchToken = branchSelected.body.data.accessToken as string;

  return { branchToken, tenantId, branchId };
}

async function registerAttempt(input: {
  app: express.Express;
  branchToken: string;
  saleId: string;
  md5: string;
  amount?: number;
  currency?: "USD" | "KHR";
  toAccountId?: string;
}): Promise<{ attemptId: string; paymentIntentId: string }> {
  const response = await request(input.app)
    .post("/v0/payments/khqr/attempts")
    .set("Authorization", `Bearer ${input.branchToken}`)
    .set("Idempotency-Key", `test-khqr-${input.md5}`)
    .send({
      saleId: input.saleId,
      md5: input.md5,
      amount: input.amount ?? 2.5,
      currency: input.currency ?? "USD",
      toAccountId: input.toAccountId ?? "khqr-receiver",
    });

  expect(response.status).toBe(201);
  expect(response.body.data.status).toBe("WAITING_FOR_PAYMENT");
  return {
    attemptId: response.body.data.attemptId as string,
    paymentIntentId: response.body.data.paymentIntentId as string,
  };
}

async function waitForAttemptStatus(input: {
  app: express.Express;
  branchToken: string;
  md5: string;
  expectedStatus: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const timeoutMs = input.timeoutMs ?? 3_000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const read = await request(input.app)
      .get(`/v0/payments/khqr/attempts/by-md5/${input.md5}`)
      .set("Authorization", `Bearer ${input.branchToken}`);
    if (read.status === 200 && read.body.data?.status === input.expectedStatus) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return false;
}

describe("v0 khqr payment webhook integration", () => {
  let pool: Pool;
  let app: express.Express;
  const webhookSecret = "khqr-webhook-test-secret";

  beforeAll(() => {
    process.env.V0_AUTH_PROVIDER = "local";
    process.env.AUTH_FIXED_OTP = "123456";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";
    process.env.V0_KHQR_WEBHOOK_SECRET = webhookSecret;

    pool = createTestPool();
    app = express();
    app.use(express.json());
    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    app.use("/v0/auth", bootstrapV0AuthModule(pool).router);
    app.use("/v0/org", bootstrapV0OrgAccountModule(pool).router);
    app.use("/v0/payments/khqr", bootstrapV0KhqrPaymentModule(pool).router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("ingests confirmed webhook and marks attempt as PAID_CONFIRMED", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const saleId = "10000000-0000-4000-8000-000000000a01";
    const md5 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    await registerAttempt({ app, branchToken: setup.branchToken, saleId, md5 });

    const webhook = await request(app)
      .post("/v0/payments/khqr/webhooks/provider")
      .set("x-khqr-webhook-secret", webhookSecret)
      .send({
        tenantId: setup.tenantId,
        branchId: setup.branchId,
        md5,
        providerEventId: `evt-${uniqueSuffix()}`,
        providerTxHash: `tx-${uniqueSuffix()}`,
        providerReference: "bakong-confirmed",
        verificationStatus: "CONFIRMED",
        confirmedAmount: 2.5,
        confirmedCurrency: "USD",
        confirmedToAccountId: "khqr-receiver",
        occurredAt: new Date().toISOString(),
      });

    expect(webhook.status).toBe(200);
    expect(webhook.body.data).toMatchObject({
      status: "APPLIED",
      verificationStatus: "CONFIRMED",
      mismatchReasonCode: null,
      attempt: {
        saleId,
        md5,
        status: "PAID_CONFIRMED",
      },
    });

    const read = await request(app)
      .get(`/v0/payments/khqr/attempts/by-md5/${md5}`)
      .set("Authorization", `Bearer ${setup.branchToken}`);
    expect(read.status).toBe(200);
    expect(read.body.data.status).toBe("PAID_CONFIRMED");
  });

  it("deduplicates webhook by providerEventId", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const saleId = "10000000-0000-4000-8000-000000000a02";
    const md5 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const providerEventId = `evt-${uniqueSuffix()}`;

    await registerAttempt({ app, branchToken: setup.branchToken, saleId, md5 });

    const first = await request(app)
      .post("/v0/payments/khqr/webhooks/provider")
      .set("x-khqr-webhook-secret", webhookSecret)
      .send({
        tenantId: setup.tenantId,
        branchId: setup.branchId,
        md5,
        providerEventId,
        verificationStatus: "CONFIRMED",
        confirmedAmount: 2.5,
        confirmedCurrency: "USD",
        confirmedToAccountId: "khqr-receiver",
      });
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe("APPLIED");

    const duplicate = await request(app)
      .post("/v0/payments/khqr/webhooks/provider")
      .set("x-khqr-webhook-secret", webhookSecret)
      .send({
        tenantId: setup.tenantId,
        branchId: setup.branchId,
        md5,
        providerEventId,
        verificationStatus: "CONFIRMED",
        confirmedAmount: 3.5,
        confirmedCurrency: "USD",
        confirmedToAccountId: "khqr-receiver",
      });

    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.status).toBe("DUPLICATE");

    const evidenceCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_khqr_payment_confirmation_evidences
       WHERE tenant_id = $1
         AND branch_id = $2
         AND provider_event_id = $3`,
      [setup.tenantId, setup.branchId, providerEventId]
    );
    expect(Number(evidenceCount.rows[0]?.count ?? "0")).toBe(1);
  });

  it("marks webhook proof mismatch as PENDING_CONFIRMATION", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const saleId = "10000000-0000-4000-8000-000000000a03";
    const md5 = "cccccccccccccccccccccccccccccccc";

    await registerAttempt({ app, branchToken: setup.branchToken, saleId, md5 });

    const webhook = await request(app)
      .post("/v0/payments/khqr/webhooks/provider")
      .set("x-khqr-webhook-secret", webhookSecret)
      .send({
        tenantId: setup.tenantId,
        branchId: setup.branchId,
        md5,
        providerEventId: `evt-${uniqueSuffix()}`,
        verificationStatus: "CONFIRMED",
        confirmedAmount: 9.99,
        confirmedCurrency: "USD",
        confirmedToAccountId: "khqr-receiver",
      });

    expect(webhook.status).toBe(200);
    expect(webhook.body.data).toMatchObject({
      status: "APPLIED",
      verificationStatus: "MISMATCH",
      mismatchReasonCode: "KHQR_PROOF_MISMATCH",
      attempt: {
        status: "PENDING_CONFIRMATION",
      },
    });
  });

  it("reconciliation scheduler confirms waiting attempts", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const saleId = "10000000-0000-4000-8000-000000000a04";
    const md5 = "33333333333333333333333333333333";
    await registerAttempt({ app, branchToken: setup.branchToken, saleId, md5 });

    const dispatcher = startV0KhqrReconciliationDispatcher({
      db: pool,
      pollIntervalMs: 25,
      batchSize: 10,
      recheckWindowMinutes: 0,
    });

    try {
      const converged = await waitForAttemptStatus({
        app,
        branchToken: setup.branchToken,
        md5,
        expectedStatus: "PAID_CONFIRMED",
      });
      expect(converged).toBe(true);
    } finally {
      dispatcher.stop();
    }
  });

  it("cancels waiting attempts and prevents later sale finalization", async () => {
    const setup = await setupOwnerBranchContext({ app, pool });
    const saleId = "10000000-0000-4000-8000-000000000a05";
    const md5 = "dddddddddddddddddddddddddddddddd";
    const attempt = await registerAttempt({ app, branchToken: setup.branchToken, saleId, md5 });

    const cancelled = await request(app)
      .post(`/v0/payments/khqr/attempts/${attempt.attemptId}/cancel`)
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .set("Idempotency-Key", `test-khqr-cancel-${md5}`)
      .send({
        reasonCode: "KHQR_CANCELLED_BY_CASHIER",
      });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.success).toBe(true);
    expect(cancelled.body.data.cancelled).toBe(true);
    expect(cancelled.body.data.attempt.status).toBe("CANCELLED");
    expect(cancelled.body.data.paymentIntent.status).toBe("CANCELLED");

    const confirmed = await request(app)
      .post("/v0/payments/khqr/confirm")
      .set("Authorization", `Bearer ${setup.branchToken}`)
      .set("Idempotency-Key", `test-khqr-confirm-after-cancel-${md5}`)
      .send({ md5 });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.success).toBe(true);
    expect(confirmed.body.data.verificationStatus).toBe("UNPAID");
    expect(confirmed.body.data.saleFinalized).toBe(false);
    expect(confirmed.body.data.attempt.status).toBe("CANCELLED");

    const read = await request(app)
      .get(`/v0/payments/khqr/attempts/by-md5/${md5}`)
      .set("Authorization", `Bearer ${setup.branchToken}`);
    expect(read.status).toBe(200);
    expect(read.body.data.status).toBe("CANCELLED");
  });

  it("rejects webhook with invalid secret", async () => {
    const response = await request(app)
      .post("/v0/payments/khqr/webhooks/provider")
      .set("x-khqr-webhook-secret", "wrong-secret")
      .send({});

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "KHQR_WEBHOOK_UNAUTHORIZED",
    });
  });
});

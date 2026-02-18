import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { eventBus } from "../platform/events/index.js";
import { startV0CommandOutboxDispatcher } from "../platform/outbox/dispatcher.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { bootstrapV0OrgAccountModule } from "../modules/v0/orgAccount/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

async function registerAndLogin(app: express.Express, phone: string): Promise<string> {
  const register = await request(app).post("/v0/auth/register").send({
    phone,
    password: "Test123!",
    firstName: "Owner",
    lastName: "FirstBranch",
  });
  expect(register.status).toBe(201);

  await request(app).post("/v0/auth/otp/send").send({ phone });
  await request(app).post("/v0/auth/otp/verify").send({
    phone,
    otp: "123456",
  });

  const login = await request(app).post("/v0/auth/login").send({
    phone,
    password: "Test123!",
  });
  expect(login.status).toBe(200);
  return login.body.data.accessToken as string;
}

describe("v0 first branch activation scaffold", () => {
  let pool: Pool;
  let app: express.Express;

  beforeAll(() => {
    process.env.V0_AUTH_PROVIDER = "local";
    process.env.AUTH_FIXED_OTP = "123456";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";
    process.env.V0_FIRST_BRANCH_PAYMENT_STUB_TOKEN = "PAID";

    pool = createTestPool();
    app = express();
    app.use(express.json());
    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    app.use("/v0/auth", bootstrapV0AuthModule(pool).router);
    app.use("/v0/org", bootstrapV0OrgAccountModule(pool).router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("initiates then confirms first branch activation and seeds default entitlements", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);

    const tenantCreated = await request(app)
      .post("/v0/org/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantName: `First Branch Tenant ${Date.now()}` });
    expect(tenantCreated.status).toBe(201);
    const tenantId = tenantCreated.body.data.tenant.id as string;

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    expect(tenantSelected.status).toBe(200);
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const initiated = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchName: "Main Branch" });
    expect(initiated.status).toBe(201);
    expect(initiated.body.data.tenantId).toBe(tenantId);
    expect(initiated.body.data.branchName).toBe("Main Branch");
    expect(initiated.body.data.activationType).toBe("FIRST_BRANCH");
    expect(initiated.body.data.draftStatus).toBe("PENDING_PAYMENT");
    expect(initiated.body.data.invoice.invoiceType).toBe("FIRST_BRANCH_ACTIVATION");
    expect(initiated.body.data.invoice.status).toBe("ISSUED");
    const draftId = initiated.body.data.draftId as string;

    const initiatedAgain = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchName: "Ignored Name" });
    expect(initiatedAgain.status).toBe(200);
    expect(initiatedAgain.body.data.draftId).toBe(draftId);
    expect(initiatedAgain.body.data.branchName).toBe("Main Branch");

    const activated = await request(app)
      .post("/v0/org/branches/activation/confirm")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({
        draftId,
        paymentToken: "PAID",
      });
    expect(activated.status).toBe(201);
    expect(activated.body.data.tenantId).toBe(tenantId);
    expect(activated.body.data.branchName).toBe("Main Branch");
    expect(activated.body.data.activationType).toBe("FIRST_BRANCH");
    expect(activated.body.data.status).toBe("ACTIVE");
    expect(typeof activated.body.data.paymentConfirmationRef).toBe("string");
    const createdBranchId = activated.body.data.branchId as string;

    const accessibleBranches = await request(app)
      .get("/v0/org/branches/accessible")
      .set("Authorization", `Bearer ${tenantToken}`);
    expect(accessibleBranches.status).toBe(200);
    expect(
      (accessibleBranches.body.data as Array<{ branchId: string }>).some(
        (branch) => branch.branchId === createdBranchId
      )
    ).toBe(true);

    const branchCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM branches
       WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(Number(branchCount.rows[0]?.count ?? "0")).toBe(1);

    const entitlementCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_branch_entitlements
       WHERE tenant_id = $1
         AND branch_id = $2`,
      [tenantId, activated.body.data.branchId]
    );
    expect(Number(entitlementCount.rows[0]?.count ?? "0")).toBe(4);

    const billingAnchor = await pool.query<{ billing_anchor_set_at: Date | null }>(
      `SELECT billing_anchor_set_at
       FROM v0_tenant_subscription_states
       WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(billingAnchor.rows[0]?.billing_anchor_set_at).not.toBeNull();

    const auditEvent = await pool.query<{ action_key: string; entity_type: string; outcome: string }>(
      `SELECT action_key, entity_type, outcome
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, activated.body.data.branchId]
    );
    expect(auditEvent.rows[0]).toMatchObject({
      action_key: "org.branch.activation.confirm",
      entity_type: "branch",
      outcome: "SUCCESS",
    });
    const initiateAudit = await pool.query<{ action_key: string; entity_type: string }>(
      `SELECT action_key, entity_type
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, draftId]
    );
    expect(initiateAudit.rows[0]).toMatchObject({
      action_key: "org.branch.activation.initiate",
      entity_type: "branch_activation_draft",
    });

    const outboxEvent = await pool.query<{ event_type: string; action_key: string }>(
      `SELECT event_type, action_key
       FROM v0_command_outbox
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId]
    );
    expect(outboxEvent.rows[0]).toMatchObject({
      event_type: "ORG_BRANCH_ACTIVATED",
      action_key: "org.branch.activation.confirm",
    });
    const initiatedOutboxEvent = await pool.query<{ event_type: string; action_key: string }>(
      `SELECT event_type, action_key
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, draftId]
    );
    expect(initiatedOutboxEvent.rows[0]).toMatchObject({
      event_type: "ORG_BRANCH_ACTIVATION_INITIATED",
      action_key: "org.branch.activation.initiate",
    });

    const duplicate = await request(app)
      .post("/v0/org/branches/activation/confirm")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({
        draftId,
        paymentToken: "PAID",
      });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.branchId).toBe(activated.body.data.branchId);

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });

  it("rejects first branch activation confirmation when payment is not confirmed", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);

    const tenantCreated = await request(app)
      .post("/v0/org/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantName: `Payment Pending Tenant ${Date.now()}` });
    expect(tenantCreated.status).toBe(201);
    const tenantId = tenantCreated.body.data.tenant.id as string;

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    expect(tenantSelected.status).toBe(200);
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const initiated = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchName: "Main Branch" });
    expect(initiated.status).toBe(201);

    const rejected = await request(app)
      .post("/v0/org/branches/activation/confirm")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({
        draftId: initiated.body.data.draftId,
        paymentToken: "UNPAID",
      });
    expect(rejected.status).toBe(402);
    expect(rejected.body.code).toBe("BRANCH_ACTIVATION_PAYMENT_REQUIRED");

    const branchCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM branches
       WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(Number(branchCount.rows[0]?.count ?? "0")).toBe(0);

    const invoiceStatus = await pool.query<{ status: string }>(
      `SELECT i.status
       FROM v0_branch_activation_drafts d
       JOIN v0_subscription_invoices i ON i.id = d.invoice_id
       WHERE d.tenant_id = $1
       ORDER BY d.created_at DESC
       LIMIT 1`,
      [tenantId]
    );
    expect(invoiceStatus.rows[0]?.status).toBe("ISSUED");

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });

  it("allows activating a second branch after first branch activation", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);

    const tenantCreated = await request(app)
      .post("/v0/org/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantName: `Multi Branch Tenant ${Date.now()}` });
    expect(tenantCreated.status).toBe(201);
    const tenantId = tenantCreated.body.data.tenant.id as string;

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    expect(tenantSelected.status).toBe(200);
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const firstDraft = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchName: "Main Branch" });
    expect(firstDraft.status).toBe(201);

    const firstActivated = await request(app)
      .post("/v0/org/branches/activation/confirm")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({
        draftId: firstDraft.body.data.draftId,
        paymentToken: "PAID",
      });
    expect(firstActivated.status).toBe(201);

    const secondDraft = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchName: "Second Branch" });
    expect(secondDraft.status).toBe(201);
    expect(secondDraft.body.data.branchName).toBe("Second Branch");
    expect(secondDraft.body.data.activationType).toBe("ADDITIONAL_BRANCH");
    expect(secondDraft.body.data.invoice.invoiceType).toBe("ADDITIONAL_BRANCH_ACTIVATION");

    const secondActivated = await request(app)
      .post("/v0/org/branches/activation/confirm")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({
        draftId: secondDraft.body.data.draftId,
        paymentToken: "PAID",
      });
    expect(secondActivated.status).toBe(201);
    expect(secondActivated.body.data.branchName).toBe("Second Branch");
    expect(secondActivated.body.data.activationType).toBe("ADDITIONAL_BRANCH");

    const branchCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM branches
       WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(Number(branchCount.rows[0]?.count ?? "0")).toBe(2);

    const invoiceTypes = await pool.query<{ invoice_type: string }>(
      `SELECT invoice_type
       FROM v0_subscription_invoices
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
      [tenantId]
    );
    expect(invoiceTypes.rows.map((row) => row.invoice_type)).toEqual([
      "FIRST_BRANCH_ACTIVATION",
      "ADDITIONAL_BRANCH_ACTIVATION",
    ]);

    const accessible = await request(app)
      .get("/v0/org/branches/accessible")
      .set("Authorization", `Bearer ${tenantToken}`);
    expect(accessible.status).toBe(200);
    expect((accessible.body.data as Array<unknown>).length).toBe(2);

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });

  it("denies additional branch activation when subscription is past due", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);

    const tenantCreated = await request(app)
      .post("/v0/org/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantName: `Past Due Upgrade Block ${Date.now()}` });
    expect(tenantCreated.status).toBe(201);
    const tenantId = tenantCreated.body.data.tenant.id as string;

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    expect(tenantSelected.status).toBe(200);
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const firstDraft = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchName: "Main Branch" });
    expect(firstDraft.status).toBe(201);

    const firstActivated = await request(app)
      .post("/v0/org/branches/activation/confirm")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({
        draftId: firstDraft.body.data.draftId,
        paymentToken: "PAID",
      });
    expect(firstActivated.status).toBe(201);

    await pool.query(
      `UPDATE v0_tenant_subscription_states
       SET state = 'PAST_DUE', updated_at = NOW()
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const blocked = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchName: "Blocked Branch" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("SUBSCRIPTION_UPGRADE_REQUIRED");

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });

  it("enforces fair-use hard limit on branch activation initiate", async () => {
    const previousHardLimit = process.env.V0_FAIRUSE_BRANCH_COUNT_PER_TENANT_HARD;
    process.env.V0_FAIRUSE_BRANCH_COUNT_PER_TENANT_HARD = "1";

    const ownerPhone = uniquePhone();
    try {
      const ownerToken = await registerAndLogin(app, ownerPhone);

      const tenantCreated = await request(app)
        .post("/v0/org/tenants")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ tenantName: `Hard Limit Tenant ${Date.now()}` });
      expect(tenantCreated.status).toBe(201);
      const tenantId = tenantCreated.body.data.tenant.id as string;

      const tenantSelected = await request(app)
        .post("/v0/auth/context/tenant/select")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ tenantId });
      expect(tenantSelected.status).toBe(200);
      const tenantToken = tenantSelected.body.data.accessToken as string;

      const firstDraft = await request(app)
        .post("/v0/org/branches/activation/initiate")
        .set("Authorization", `Bearer ${tenantToken}`)
        .send({ branchName: "Main Branch" });
      expect(firstDraft.status).toBe(201);

      const firstActivated = await request(app)
        .post("/v0/org/branches/activation/confirm")
        .set("Authorization", `Bearer ${tenantToken}`)
        .send({
          draftId: firstDraft.body.data.draftId,
          paymentToken: "PAID",
        });
      expect(firstActivated.status).toBe(201);

      const blockedSecond = await request(app)
        .post("/v0/org/branches/activation/initiate")
        .set("Authorization", `Bearer ${tenantToken}`)
        .send({ branchName: "Second Branch" });
      expect(blockedSecond.status).toBe(409);
      expect(blockedSecond.body.code).toBe("FAIRUSE_HARD_LIMIT_EXCEEDED");
    } finally {
      process.env.V0_FAIRUSE_BRANCH_COUNT_PER_TENANT_HARD = previousHardLimit;
      await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
    }
  });

  it("enforces fair-use rate limit on branch activation initiate", async () => {
    const previousRate = process.env.V0_FAIRUSE_BRANCH_ACTIVATION_RATE_LIMIT;
    const previousWindow = process.env.V0_FAIRUSE_BRANCH_ACTIVATION_WINDOW_SECONDS;
    const previousHard = process.env.V0_FAIRUSE_BRANCH_COUNT_PER_TENANT_HARD;
    process.env.V0_FAIRUSE_BRANCH_ACTIVATION_RATE_LIMIT = "1";
    process.env.V0_FAIRUSE_BRANCH_ACTIVATION_WINDOW_SECONDS = "3600";
    process.env.V0_FAIRUSE_BRANCH_COUNT_PER_TENANT_HARD = "100";

    const ownerPhone = uniquePhone();
    try {
      const ownerToken = await registerAndLogin(app, ownerPhone);

      const tenantCreated = await request(app)
        .post("/v0/org/tenants")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ tenantName: `Rate Limit Tenant ${Date.now()}` });
      expect(tenantCreated.status).toBe(201);
      const tenantId = tenantCreated.body.data.tenant.id as string;

      const tenantSelected = await request(app)
        .post("/v0/auth/context/tenant/select")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ tenantId });
      expect(tenantSelected.status).toBe(200);
      const tenantToken = tenantSelected.body.data.accessToken as string;

      const firstDraft = await request(app)
        .post("/v0/org/branches/activation/initiate")
        .set("Authorization", `Bearer ${tenantToken}`)
        .send({ branchName: "Main Branch" });
      expect(firstDraft.status).toBe(201);

      const firstActivated = await request(app)
        .post("/v0/org/branches/activation/confirm")
        .set("Authorization", `Bearer ${tenantToken}`)
        .send({
          draftId: firstDraft.body.data.draftId,
          paymentToken: "PAID",
        });
      expect(firstActivated.status).toBe(201);

      const blockedSecond = await request(app)
        .post("/v0/org/branches/activation/initiate")
        .set("Authorization", `Bearer ${tenantToken}`)
        .send({ branchName: "Second Branch" });
      expect(blockedSecond.status).toBe(429);
      expect(blockedSecond.body.code).toBe("FAIRUSE_RATE_LIMITED");
    } finally {
      process.env.V0_FAIRUSE_BRANCH_ACTIVATION_RATE_LIMIT = previousRate;
      process.env.V0_FAIRUSE_BRANCH_ACTIVATION_WINDOW_SECONDS = previousWindow;
      process.env.V0_FAIRUSE_BRANCH_COUNT_PER_TENANT_HARD = previousHard;
      await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
    }
  });

  it("supports idempotency replay and conflict for activation initiate", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);

    const tenantCreated = await request(app)
      .post("/v0/org/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantName: `Initiate Idempotency ${Date.now()}` });
    expect(tenantCreated.status).toBe(201);
    const tenantId = tenantCreated.body.data.tenant.id as string;

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    expect(tenantSelected.status).toBe(200);
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const first = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .set("Idempotency-Key", "branch-initiate-idem-1")
      .send({ branchName: "Main Branch" });
    expect(first.status).toBe(201);

    const replay = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .set("Idempotency-Key", "branch-initiate-idem-1")
      .send({ branchName: "Main Branch" });
    expect(replay.status).toBe(201);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.body.data.draftId).toBe(first.body.data.draftId);

    const conflict = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .set("Idempotency-Key", "branch-initiate-idem-1")
      .send({ branchName: "Different Name" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });

  it("supports idempotency replay and conflict for activation confirm", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);

    const tenantCreated = await request(app)
      .post("/v0/org/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantName: `Confirm Idempotency ${Date.now()}` });
    expect(tenantCreated.status).toBe(201);
    const tenantId = tenantCreated.body.data.tenant.id as string;

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    expect(tenantSelected.status).toBe(200);
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const initiated = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchName: "Main Branch" });
    expect(initiated.status).toBe(201);

    const first = await request(app)
      .post("/v0/org/branches/activation/confirm")
      .set("Authorization", `Bearer ${tenantToken}`)
      .set("Idempotency-Key", "branch-confirm-idem-1")
      .send({
        draftId: initiated.body.data.draftId,
        paymentToken: "PAID",
      });
    expect(first.status).toBe(201);

    const replay = await request(app)
      .post("/v0/org/branches/activation/confirm")
      .set("Authorization", `Bearer ${tenantToken}`)
      .set("Idempotency-Key", "branch-confirm-idem-1")
      .send({
        draftId: initiated.body.data.draftId,
        paymentToken: "PAID",
      });
    expect(replay.status).toBe(201);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.body.data.branchId).toBe(first.body.data.branchId);

    const conflict = await request(app)
      .post("/v0/org/branches/activation/confirm")
      .set("Authorization", `Bearer ${tenantToken}`)
      .set("Idempotency-Key", "branch-confirm-idem-1")
      .send({
        draftId: initiated.body.data.draftId,
        paymentToken: "DIFFERENT",
      });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });

  it("rolls back activation initiate when outbox insert fails and clears idempotency processing state", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);

    const tenantCreated = await request(app)
      .post("/v0/org/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantName: `Initiate Rollback ${Date.now()}` });
    expect(tenantCreated.status).toBe(201);
    const tenantId = tenantCreated.body.data.tenant.id as string;

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    expect(tenantSelected.status).toBe(200);
    const tenantToken = tenantSelected.body.data.accessToken as string;

    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "org.branch.activation.initiate";
    const failed = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .set("Idempotency-Key", "branch-initiate-fail-1")
      .send({ branchName: "Main Branch" });
    expect(failed.status).toBe(500);
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";

    const draftCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_branch_activation_drafts
       WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(Number(draftCount.rows[0]?.count ?? "0")).toBe(0);

    const invoiceCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_subscription_invoices
       WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(Number(invoiceCount.rows[0]?.count ?? "0")).toBe(0);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'org.branch.activation.initiate'`,
      [tenantId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(0);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND action_key = 'org.branch.activation.initiate'`,
      [tenantId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(0);

    const idempotencyCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_idempotency_records
       WHERE tenant_id = $1
         AND action_key = 'org.branch.activation.initiate'
         AND idempotency_key = 'branch-initiate-fail-1'`,
      [tenantId]
    );
    expect(Number(idempotencyCount.rows[0]?.count ?? "0")).toBe(0);

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
  });

  it("dispatcher publishes branch activation outbox events", async () => {
    const ownerPhone = uniquePhone();
    const ownerToken = await registerAndLogin(app, ownerPhone);

    const tenantCreated = await request(app)
      .post("/v0/org/tenants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantName: `Branch Dispatch ${Date.now()}` });
    expect(tenantCreated.status).toBe(201);
    const tenantId = tenantCreated.body.data.tenant.id as string;

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tenantId });
    expect(tenantSelected.status).toBe(200);
    const tenantToken = tenantSelected.body.data.accessToken as string;

    const initiated = await request(app)
      .post("/v0/org/branches/activation/initiate")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ branchName: "Main Branch" });
    expect(initiated.status).toBe(201);

    const activated = await request(app)
      .post("/v0/org/branches/activation/confirm")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({
        draftId: initiated.body.data.draftId,
        paymentToken: "PAID",
      });
    expect(activated.status).toBe(201);

    const initiateOutbox = await pool.query<{ id: string }>(
      `SELECT id
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND event_type = 'ORG_BRANCH_ACTIVATION_INITIATED'
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId]
    );
    const activateOutbox = await pool.query<{ id: string }>(
      `SELECT id
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND event_type = 'ORG_BRANCH_ACTIVATED'
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId]
    );
    const initiateOutboxId = initiateOutbox.rows[0]?.id ?? "";
    const activateOutboxId = activateOutbox.rows[0]?.id ?? "";
    expect(initiateOutboxId).not.toBe("");
    expect(activateOutboxId).not.toBe("");

    const seen = new Set<string>();
    const published = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("branch activation outbox events were not dispatched in time"));
      }, 4000);

      eventBus.subscribe("ORG_BRANCH_ACTIVATION_INITIATED", async (event: any) => {
        if (event?.outboxId === initiateOutboxId) {
          seen.add(initiateOutboxId);
          if (seen.has(initiateOutboxId) && seen.has(activateOutboxId)) {
            clearTimeout(timeout);
            resolve();
          }
        }
      });

      eventBus.subscribe("ORG_BRANCH_ACTIVATED", async (event: any) => {
        if (event?.outboxId === activateOutboxId) {
          seen.add(activateOutboxId);
          if (seen.has(initiateOutboxId) && seen.has(activateOutboxId)) {
            clearTimeout(timeout);
            resolve();
          }
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

      const publishedRows = await pool.query<{ event_type: string; published_at: Date | null }>(
        `SELECT event_type, published_at
         FROM v0_command_outbox
         WHERE id = ANY($1::uuid[])`,
        [[initiateOutboxId, activateOutboxId]]
      );
      expect(publishedRows.rows).toHaveLength(2);
      for (const row of publishedRows.rows) {
        expect(row.published_at).not.toBeNull();
      }
    } finally {
      dispatcher.stop();
      await pool.query(`DELETE FROM accounts WHERE phone = $1`, [ownerPhone]);
    }
  });
});

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
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
    expect(initiated.body.data.draftStatus).toBe("PENDING_PAYMENT");
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
    expect(rejected.body.code).toBe("PAYMENT_NOT_CONFIRMED");

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
});

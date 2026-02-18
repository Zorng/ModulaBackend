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
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

async function registerAndLogin(app: express.Express, phone: string): Promise<string> {
  const registerRes = await request(app).post("/v0/auth/register").send({
    phone,
    password: "Test123!",
    firstName: "Policy",
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
  ownerPhone: string;
  tenantName: string;
}): Promise<{
  ownerToken: string;
  ownerBranchToken: string;
  ownerAccountId: string;
  tenantId: string;
  branchId: string;
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

  const branchId = await createActiveBranch({
    pool: input.pool,
    tenantId,
    branchName: "Policy Branch",
  });
  await assignActiveBranch({
    pool: input.pool,
    tenantId,
    branchId,
    accountId: ownerAccountId!,
    membershipId: ownerMembershipId,
  });
  await seedDefaultBranchEntitlements({
    pool: input.pool,
    tenantId,
    branchId,
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
    .send({ branchId });
  expect(branchSelected.status).toBe(200);
  const ownerBranchToken = branchSelected.body.data.accessToken as string;

  return {
    ownerToken,
    ownerBranchToken,
    ownerAccountId: ownerAccountId!,
    tenantId,
    branchId,
  };
}

describe("v0 policy integration", () => {
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
    app.use("/v0/policy", bootstrapV0PolicyModule(pool).router);
  });

  afterAll(async () => {
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";
    await pool.end();
  });

  it("returns branch-scoped default policy for selected context", async () => {
    const setup = await setupOwnerBranchContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Policy Defaults ${Date.now()}`,
    });

    const current = await request(app)
      .get("/v0/policy/current-branch")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);

    expect(current.status).toBe(200);
    expect(current.body.data).toMatchObject({
      tenantId: setup.tenantId,
      branchId: setup.branchId,
      saleVatEnabled: false,
      saleVatRatePercent: 0,
      saleFxRateKhrPerUsd: 4100,
      saleKhrRoundingEnabled: true,
      saleKhrRoundingMode: "NEAREST",
      saleKhrRoundingGranularity: "100",
      saleAllowPayLater: false,
    });
  });

  it("updates policy with idempotency replay and conflict safeguards", async () => {
    const setup = await setupOwnerBranchContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Policy Update ${Date.now()}`,
    });

    const payload = {
      saleVatEnabled: true,
      saleVatRatePercent: 10,
      saleFxRateKhrPerUsd: 4050,
      saleKhrRoundingEnabled: true,
      saleKhrRoundingMode: "UP",
      saleKhrRoundingGranularity: "1000",
      saleAllowPayLater: true,
    };

    const first = await request(app)
      .patch("/v0/policy/current-branch")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", "policy-update-1")
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject(payload);

    const replay = await request(app)
      .patch("/v0/policy/current-branch")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", "policy-update-1")
      .send(payload);
    expect(replay.status).toBe(200);
    expect(replay.headers["idempotency-replayed"]).toBe("true");

    const conflict = await request(app)
      .patch("/v0/policy/current-branch")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", "policy-update-1")
      .send({ saleVatRatePercent: 5 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'policy.currentBranch.update'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(1);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'policy.currentBranch.update'
         AND event_type = 'POLICY_UPDATED'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(1);
  });

  it("denies cashier from updating policy", async () => {
    const ownerPhone = uniquePhone();
    const cashierPhone = uniquePhone();
    const setup = await setupOwnerBranchContext({
      app,
      pool,
      ownerPhone,
      tenantName: `Policy Role Guard ${Date.now()}`,
    });

    const invite = await request(app)
      .post("/v0/auth/memberships/invite")
      .set("Authorization", `Bearer ${setup.ownerToken}`)
      .send({
        tenantId: setup.tenantId,
        phone: cashierPhone,
        roleKey: "CASHIER",
      });
    expect(invite.status).toBe(201);
    const membershipId = invite.body.data.membershipId as string;

    const assign = await request(app)
      .post(`/v0/auth/memberships/${membershipId}/branches`)
      .set("Authorization", `Bearer ${setup.ownerToken}`)
      .send({ branchIds: [setup.branchId] });
    expect(assign.status).toBe(200);

    const cashierToken = await registerAndLogin(app, cashierPhone);
    const accepted = await request(app)
      .post(`/v0/auth/memberships/invitations/${membershipId}/accept`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({});
    expect(accepted.status).toBe(200);

    const tenantSelected = await request(app)
      .post("/v0/auth/context/tenant/select")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ tenantId: setup.tenantId });
    const cashierTenantToken = tenantSelected.body.data.accessToken as string;

    const branchSelected = await request(app)
      .post("/v0/auth/context/branch/select")
      .set("Authorization", `Bearer ${cashierTenantToken}`)
      .send({ branchId: setup.branchId });
    const cashierBranchToken = branchSelected.body.data.accessToken as string;

    const denied = await request(app)
      .patch("/v0/policy/current-branch")
      .set("Authorization", `Bearer ${cashierBranchToken}`)
      .set("Idempotency-Key", "policy-cashier-denied-1")
      .send({ saleAllowPayLater: true });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("PERMISSION_DENIED");
  });

  it("rolls back policy update when outbox insert fails", async () => {
    const setup = await setupOwnerBranchContext({
      app,
      pool,
      ownerPhone: uniquePhone(),
      tenantName: `Policy Atomicity ${Date.now()}`,
    });

    const before = await request(app)
      .get("/v0/policy/current-branch")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(before.status).toBe(200);
    expect(before.body.data.saleAllowPayLater).toBe(false);

    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "policy.currentBranch.update";
    const failed = await request(app)
      .patch("/v0/policy/current-branch")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`)
      .set("Idempotency-Key", "policy-atomicity-1")
      .send({ saleAllowPayLater: true });
    process.env.V0_ATOMIC_COMMAND_TEST_FAIL_ACTION_KEY = "";

    expect(failed.status).toBe(500);

    const after = await request(app)
      .get("/v0/policy/current-branch")
      .set("Authorization", `Bearer ${setup.ownerBranchToken}`);
    expect(after.status).toBe(200);
    expect(after.body.data.saleAllowPayLater).toBe(false);

    const auditCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'policy.currentBranch.update'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBe(0);

    const outboxCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_command_outbox
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_key = 'policy.currentBranch.update'`,
      [setup.tenantId, setup.branchId]
    );
    expect(Number(outboxCount.rows[0]?.count ?? "0")).toBe(0);
  });
});

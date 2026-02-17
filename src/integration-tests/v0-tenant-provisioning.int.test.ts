import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { bootstrapV0OrgAccountModule } from "../modules/v0/orgAccount/index.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

describe("v0 tenant provisioning (phase 3 scaffold)", () => {
  let pool: Pool;
  let app: express.Express;

  beforeAll(() => {
    process.env.V0_AUTH_PROVIDER = "local";
    process.env.AUTH_FIXED_OTP = "123456";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";

    pool = createTestPool();
    app = express();
    app.use(express.json());
    const v0AuthModule = bootstrapV0AuthModule(pool);
    const v0OrgModule = bootstrapV0OrgAccountModule(pool);
    app.use("/v0/auth", v0AuthModule.router);
    app.use("/v0/org", v0OrgModule.router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("allows zero-membership account to create tenant with owner membership only", async () => {
    const phone = uniquePhone();
    const tenantName = `Tenant ${Date.now()}`;

    const registerRes = await request(app).post("/v0/auth/register").send({
      phone,
      password: "Test123!",
      firstName: "Owner",
      lastName: "Zero",
    });
    expect(registerRes.status).toBe(201);

    await request(app).post("/v0/auth/otp/send").send({ phone });
    await request(app).post("/v0/auth/otp/verify").send({
      phone,
      otp: "123456",
    });

    const loginRes = await request(app).post("/v0/auth/login").send({
      phone,
      password: "Test123!",
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.activeMembershipsCount).toBe(0);
    const accessToken = loginRes.body.data.accessToken as string;

    const createTenantRes = await request(app)
      .post("/v0/org/tenants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        tenantName,
      });

    expect(createTenantRes.status).toBe(201);
    expect(createTenantRes.body.success).toBe(true);
    expect(createTenantRes.body.data.tenant.name).toBe(tenantName);
    expect(createTenantRes.body.data.ownerMembership.roleKey).toBe("OWNER");
    expect(createTenantRes.body.data.ownerMembership.status).toBe("ACTIVE");
    expect(createTenantRes.body.data.branch).toBeNull();

    const tenantId = createTenantRes.body.data.tenant.id as string;
    const membershipCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_tenant_memberships
       WHERE tenant_id = $1
         AND status = 'ACTIVE'
         AND role_key = 'OWNER'`,
      [tenantId]
    );
    expect(Number(membershipCount.rows[0]?.count ?? "0")).toBe(1);

    const branchCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM branches
       WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(Number(branchCount.rows[0]?.count ?? "0")).toBe(0);

    const tenantAudit = await pool.query<{
      action_key: string;
      outcome: string;
      entity_type: string | null;
      entity_id: string | null;
      branch_id: string | null;
    }>(
      `SELECT action_key, outcome, entity_type, entity_id, branch_id
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'tenant.provision'
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId]
    );
    expect(tenantAudit.rows).toHaveLength(1);
    expect(tenantAudit.rows[0].outcome).toBe("SUCCESS");
    expect(tenantAudit.rows[0].entity_type).toBe("tenant");
    expect(tenantAudit.rows[0].entity_id).toBe(tenantId);
    expect(tenantAudit.rows[0].branch_id).toBeNull();

    const loginAfterProvisioning = await request(app).post("/v0/auth/login").send({
      phone,
      password: "Test123!",
    });
    expect(loginAfterProvisioning.status).toBe(200);
    expect(loginAfterProvisioning.body.data.activeMembershipsCount).toBe(1);

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [phone]);
  });

  it("allows creating tenant without creating a branch", async () => {
    const phone = uniquePhone();
    const tenantName = `Tenant No Branch ${Date.now()}`;

    const registerRes = await request(app).post("/v0/auth/register").send({
      phone,
      password: "Test123!",
      firstName: "Owner",
      lastName: "NoBranch",
    });
    expect(registerRes.status).toBe(201);

    await request(app).post("/v0/auth/otp/send").send({ phone });
    await request(app).post("/v0/auth/otp/verify").send({
      phone,
      otp: "123456",
    });

    const loginRes = await request(app).post("/v0/auth/login").send({
      phone,
      password: "Test123!",
    });
    expect(loginRes.status).toBe(200);
    const accessToken = loginRes.body.data.accessToken as string;

    const createTenantRes = await request(app)
      .post("/v0/auth/tenants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        tenantName,
      });

    expect(createTenantRes.status).toBe(201);
    expect(createTenantRes.body.success).toBe(true);
    expect(createTenantRes.body.data.tenant.name).toBe(tenantName);
    expect(createTenantRes.body.data.ownerMembership.roleKey).toBe("OWNER");
    expect(createTenantRes.body.data.ownerMembership.status).toBe("ACTIVE");
    expect(createTenantRes.body.data.branch).toBeNull();

    const tenantId = createTenantRes.body.data.tenant.id as string;
    const branchCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM branches
       WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(Number(branchCount.rows[0]?.count ?? "0")).toBe(0);

    const tenantAudit = await pool.query<{
      action_key: string;
      outcome: string;
      entity_type: string | null;
      entity_id: string | null;
      branch_id: string | null;
    }>(
      `SELECT action_key, outcome, entity_type, entity_id, branch_id
       FROM v0_audit_events
       WHERE tenant_id = $1
         AND action_key = 'tenant.provision'
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId]
    );
    expect(tenantAudit.rows).toHaveLength(1);
    expect(tenantAudit.rows[0].outcome).toBe("SUCCESS");
    expect(tenantAudit.rows[0].entity_type).toBe("tenant");
    expect(tenantAudit.rows[0].entity_id).toBe(tenantId);
    expect(tenantAudit.rows[0].branch_id).toBeNull();

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [phone]);
  });
});

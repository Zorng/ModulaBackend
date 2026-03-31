import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import crypto from "crypto";
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

describe("v0 tenant memberships (phase 2 scaffold)", () => {
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

  it("supports invite -> inbox -> accept -> role change -> revoke", async () => {
    const ownerPhone = uniquePhone();
    const inviteePhone = uniquePhone();
    const tenantId = crypto.randomUUID();

    const ownerRegister = await request(app).post("/v0/auth/register").send({
      phone: ownerPhone,
      password: "Test123!",
      firstName: "Owner",
      lastName: "One",
    });
    expect(ownerRegister.status).toBe(201);
    const ownerAccountId = ownerRegister.body.data.accountId as string;

    await request(app).post("/v0/auth/otp/send").send({ phone: ownerPhone });
    await request(app).post("/v0/auth/otp/verify").send({
      phone: ownerPhone,
      otp: "123456",
    });

    const ownerLogin = await request(app).post("/v0/auth/login").send({
      phone: ownerPhone,
      password: "Test123!",
    });
    expect(ownerLogin.status).toBe(200);
    const ownerAccessToken = ownerLogin.body.data.accessToken as string;

    const inviteeRegister = await request(app).post("/v0/auth/register").send({
      phone: inviteePhone,
      password: "Test123!",
      firstName: "Invitee",
      lastName: "One",
    });
    expect(inviteeRegister.status).toBe(201);

    await request(app).post("/v0/auth/otp/send").send({ phone: inviteePhone });
    await request(app).post("/v0/auth/otp/verify").send({
      phone: inviteePhone,
      otp: "123456",
    });

    const inviteeLogin = await request(app).post("/v0/auth/login").send({
      phone: inviteePhone,
      password: "Test123!",
    });
    expect(inviteeLogin.status).toBe(200);
    expect(inviteeLogin.body.data.activeMembershipsCount).toBe(0);
    const inviteeAccessToken = inviteeLogin.body.data.accessToken as string;

    await pool.query(
      `INSERT INTO tenants (id, name, status)
       VALUES ($1, 'Phase 2 Tenant', 'ACTIVE')`,
      [tenantId]
    );
    await pool.query(
      `INSERT INTO v0_tenant_memberships (
         tenant_id,
         account_id,
         role_key,
         status,
         invited_at,
         accepted_at
       ) VALUES ($1, $2, 'OWNER', 'ACTIVE', NOW(), NOW())`,
      [tenantId, ownerAccountId]
    );

    const inviteRes = await request(app)
      .post("/v0/org/memberships/invite")
      .set("Authorization", `Bearer ${ownerAccessToken}`)
      .send({
        tenantId,
        phone: inviteePhone,
        roleKey: "CASHIER",
      });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.data.status).toBe("INVITED");
    const inviteMembershipId = inviteRes.body.data.membershipId as string;

    const inboxBefore = await request(app)
      .get("/v0/org/memberships/invitations")
      .set("Authorization", `Bearer ${inviteeAccessToken}`);
    expect(inboxBefore.status).toBe(200);
    expect(inboxBefore.body.data.invitations).toHaveLength(1);
    expect(inboxBefore.body.data.invitations[0].membershipId).toBe(
      inviteMembershipId
    );

    const acceptRes = await request(app)
      .post(`/v0/org/memberships/invitations/${inviteMembershipId}/accept`)
      .set("Authorization", `Bearer ${inviteeAccessToken}`)
      .send({});
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe("ACTIVE");

    const inviteeLoginAfterAccept = await request(app).post("/v0/auth/login").send({
      phone: inviteePhone,
      password: "Test123!",
    });
    expect(inviteeLoginAfterAccept.status).toBe(200);
    expect(inviteeLoginAfterAccept.body.data.activeMembershipsCount).toBe(1);

    const roleChangeRes = await request(app)
      .post(`/v0/org/memberships/${inviteMembershipId}/role`)
      .set("Authorization", `Bearer ${ownerAccessToken}`)
      .send({ roleKey: "MANAGER" });
    expect(roleChangeRes.status).toBe(200);
    expect(roleChangeRes.body.data.roleKey).toBe("MANAGER");

    const revokeRes = await request(app)
      .post(`/v0/org/memberships/${inviteMembershipId}/revoke`)
      .set("Authorization", `Bearer ${ownerAccessToken}`)
      .send({});
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.status).toBe("REVOKED");

    const auditRows = await pool.query<{
      action_key: string;
      outcome: string;
      entity_type: string | null;
      entity_id: string | null;
    }>(
      `SELECT action_key, outcome, entity_type, entity_id
       FROM v0_audit_events
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
      [tenantId]
    );
    expect(auditRows.rows.map((row) => row.action_key)).toEqual([
      "org.membership.invite",
      "org.membership.invitation.accept",
      "org.membership.role.change",
      "org.membership.revoke",
    ]);
    for (const row of auditRows.rows) {
      expect(row.outcome).toBe("SUCCESS");
      expect(row.entity_type).toBe("membership");
      expect(row.entity_id).toBeTruthy();
    }

    const inviteeLoginAfterRevoke = await request(app).post("/v0/auth/login").send({
      phone: inviteePhone,
      password: "Test123!",
    });
    expect(inviteeLoginAfterRevoke.status).toBe(200);
    expect(inviteeLoginAfterRevoke.body.data.activeMembershipsCount).toBe(0);

    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await pool.query(`DELETE FROM accounts WHERE phone IN ($1, $2)`, [
      ownerPhone,
      inviteePhone,
    ]);
  });
});

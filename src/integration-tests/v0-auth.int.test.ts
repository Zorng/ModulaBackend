import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { bootstrapV0AuthModule } from "../modules/v0/auth/index.js";
import { createAccessControlHook } from "../platform/http/middleware/access-control-hook.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

describe("v0 auth (phase 1 scaffold)", () => {
  let pool: Pool;
  let app: express.Express;

  beforeAll(() => {
    process.env.V0_AUTH_PROVIDER = "local";
    process.env.AUTH_FIXED_OTP = "123456";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";

    pool = createTestPool();

    app = express();
    app.use(express.json());
    app.use("/v0", createAccessControlHook({ db: pool, jwtSecret: process.env.JWT_SECRET }));
    const v0AuthModule = bootstrapV0AuthModule(pool);
    app.use("/v0/auth", v0AuthModule.router);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("supports self-registration with zero memberships", async () => {
    const phone = uniquePhone();

    const registerRes = await request(app).post("/v0/auth/register").send({
      phone,
      password: "Test123!",
      firstName: "Zero",
      lastName: "Member",
      gender: "MALE",
      dateOfBirth: "2000-01-01",
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.success).toBe(true);
    expect(registerRes.body.data.phoneVerified).toBe(false);

    const loginBeforeVerify = await request(app).post("/v0/auth/login").send({
      phone,
      password: "Test123!",
    });
    expect(loginBeforeVerify.status).toBe(403);

    const sendOtpRes = await request(app).post("/v0/auth/otp/send").send({
      phone,
    });
    expect(sendOtpRes.status).toBe(200);
    expect(sendOtpRes.body.success).toBe(true);
    expect(sendOtpRes.body.data.debugOtp).toBe("123456");

    const verifyRes = await request(app).post("/v0/auth/otp/verify").send({
      phone,
      otp: "123456",
    });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.verified).toBe(true);

    const loginRes = await request(app).post("/v0/auth/login").send({
      phone,
      password: "Test123!",
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.account.phone).toBe(phone);
    expect(loginRes.body.data.activeMembershipsCount).toBe(0);
    expect(loginRes.body.data.context).toEqual({
      tenantId: null,
      branchId: null,
    });
    expect(typeof loginRes.body.data.accessToken).toBe("string");
    expect(typeof loginRes.body.data.refreshToken).toBe("string");

    const oldRefreshToken = loginRes.body.data.refreshToken as string;

    const refreshRes = await request(app).post("/v0/auth/refresh").send({
      refreshToken: oldRefreshToken,
    });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(typeof refreshRes.body.data.accessToken).toBe("string");
    expect(typeof refreshRes.body.data.refreshToken).toBe("string");

    const rotatedRefreshToken = refreshRes.body.data.refreshToken as string;
    const rotatedAccessToken = refreshRes.body.data.accessToken as string;
    expect(rotatedRefreshToken).not.toBe(oldRefreshToken);

    const oldRefreshReplay = await request(app).post("/v0/auth/refresh").send({
      refreshToken: oldRefreshToken,
    });
    expect(oldRefreshReplay.status).toBe(401);

    const logoutRes = await request(app).post("/v0/auth/logout").send({
      refreshToken: rotatedRefreshToken,
    });
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    const refreshAfterLogout = await request(app).post("/v0/auth/refresh").send({
      refreshToken: rotatedRefreshToken,
    });
    expect(refreshAfterLogout.status).toBe(401);

    const contextAfterLogout = await request(app)
      .get("/v0/auth/context/tenants")
      .set("Authorization", `Bearer ${rotatedAccessToken}`);
    expect(contextAfterLogout.status).toBe(401);
    expect(contextAfterLogout.body.code).toBe("INVALID_ACCESS_TOKEN");

    const auditRows = await pool.query<{ event_key: string; outcome: string }>(
      `SELECT event_key, outcome
       FROM v0_auth_audit_events
       WHERE phone = $1`,
      [phone]
    );
    const eventKeys = auditRows.rows.map((r) => r.event_key);
    expect(eventKeys).toEqual(
      expect.arrayContaining([
        "AUTH_REGISTER",
        "AUTH_OTP_SEND",
        "AUTH_OTP_VERIFY",
        "AUTH_LOGIN",
        "AUTH_REFRESH",
        "AUTH_LOGOUT",
      ])
    );

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [phone]);
  });

  it("enforces OTP resend cooldown and records rate-limit audit", async () => {
    const phone = uniquePhone();

    const registerRes = await request(app).post("/v0/auth/register").send({
      phone,
      password: "Test123!",
      firstName: "Cooldown",
      lastName: "Case",
    });
    expect(registerRes.status).toBe(201);

    const firstSend = await request(app).post("/v0/auth/otp/send").send({
      phone,
    });
    expect(firstSend.status).toBe(200);

    const immediateResend = await request(app).post("/v0/auth/otp/send").send({
      phone,
    });
    expect(immediateResend.status).toBe(429);
    expect(String(immediateResend.body.error)).toContain("otp recently sent");

    const failedOtpSendAudit = await pool.query<{ reason_code: string }>(
      `SELECT reason_code
       FROM v0_auth_audit_events
       WHERE phone = $1
         AND event_key = 'AUTH_OTP_SEND'
         AND outcome = 'FAILED'`,
      [phone]
    );
    expect(failedOtpSendAudit.rows.map((r) => r.reason_code)).toContain(
      "OTP_COOLDOWN"
    );

    await pool.query(`DELETE FROM accounts WHERE phone = $1`, [phone]);
  });

  it("returns 422 when registration password is missing", async () => {
    const phone = uniquePhone();

    const registerRes = await request(app).post("/v0/auth/register").send({
      phone,
      firstName: "No",
      lastName: "Password",
    });

    expect(registerRes.status).toBe(422);
    expect(registerRes.body.success).toBe(false);
    expect(String(registerRes.body.error)).toContain("password must be at least 8 characters");
  });
});

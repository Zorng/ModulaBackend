import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool } from "pg";
import { bootstrapAuditModule } from "../modules/audit/index.js";
import { setupAuthModule } from "../modules/auth/index.js";
import { createTestPool } from "../test-utils/db.js";
import { cleanupSeededTenant, seedTenantSingleBranch } from "../test-utils/seed.js";

function hasSensitiveKeys(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasSensitiveKeys);

  const record = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(record)) {
    if (/password|otp|token|secret/i.test(key)) {
      return true;
    }
    if (v && typeof v === "object" && hasSensitiveKeys(v)) {
      return true;
    }
  }
  return false;
}

describe("Auth audit logging (DB-backed)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("logs LOGIN_SUCCESS and LOGIN_FAILED without sensitive details", async () => {
    const seeded = await seedTenantSingleBranch(pool);

    const auditModule = bootstrapAuditModule(pool);
    const authModule = setupAuthModule(pool, {
      invitationPort: {
        peekValidInvite: async () => {
          throw new Error("not implemented in this test");
        },
        acceptInvite: async () => {
          throw new Error("not implemented in this test");
        },
      } as any,
      tenantProvisioningPort: {
        provisionTenant: async () => {
          throw new Error("not implemented in this test");
        },
      } as any,
      auditWriterPort: auditModule.auditWriterPort,
    });

    const loginOk = await authModule.authService.login({
      phone: seeded.admin.phone,
      password: seeded.admin.password,
    });
    expect(loginOk.kind).toBe("single");

    await expect(
      authModule.authService.login({
        phone: seeded.admin.phone,
        password: "WrongPassword123!",
      })
    ).rejects.toThrow(/invalid credentials/i);

    const successRow = await pool.query(
      `SELECT action_type, outcome, denial_reason, details
       FROM activity_log
       WHERE tenant_id = $1
         AND employee_id = $2
         AND action_type = 'LOGIN_SUCCESS'
       ORDER BY occurred_at DESC, id DESC
       LIMIT 1`,
      [seeded.tenantId, seeded.employeeId]
    );
    expect(successRow.rows.length).toBe(1);
    expect(successRow.rows[0].outcome).toBe("SUCCESS");
    expect(successRow.rows[0].denial_reason).toBeNull();
    expect(successRow.rows[0].details).toBeNull();

    const failedRow = await pool.query(
      `SELECT action_type, outcome, denial_reason, details
       FROM activity_log
       WHERE tenant_id = $1
         AND employee_id = $2
         AND action_type = 'LOGIN_FAILED'
       ORDER BY occurred_at DESC, id DESC
       LIMIT 1`,
      [seeded.tenantId, seeded.employeeId]
    );
    expect(failedRow.rows.length).toBe(1);
    expect(failedRow.rows[0].outcome).toBe("FAILED");
    expect(failedRow.rows[0].denial_reason).toBeNull();
    expect(failedRow.rows[0].details).toEqual({ reason: "INVALID_CREDENTIALS" });

    const allDetails = await pool.query(
      `SELECT details
       FROM activity_log
       WHERE tenant_id = $1`,
      [seeded.tenantId]
    );
    for (const row of allDetails.rows) {
      if (row.details == null) continue;
      expect(hasSensitiveKeys(row.details)).toBe(false);
    }

    await cleanupSeededTenant(pool, seeded);
  });
});


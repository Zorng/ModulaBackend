import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import type { Pool } from "pg";
import { requireActiveBranch } from "../platform/http/middlewares/branch-guard.middleware.js";
import { bootstrapAuditModule } from "../modules/audit/index.js";
import { bootstrapBranchModule } from "../modules/branch/index.js";
import { createTestPool } from "../test-utils/db.js";
import {
  cleanupSeededTenant,
  seedTenantMultiBranch,
  setBranchStatus,
} from "../test-utils/seed.js";

describe("Branch lifecycle + guard (DB-backed)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("freeze/unfreeze persists and writes audit log entries", async () => {
    const seeded = await seedTenantMultiBranch(pool);
    const auditModule = bootstrapAuditModule(pool);
    const branchModule = bootstrapBranchModule(pool, {
      auditWriterPort: auditModule.auditWriterPort,
    });

    await branchModule.service.freezeBranch({
      tenantId: seeded.tenantId,
      branchId: seeded.branchBId,
      actorEmployeeId: seeded.employeeId,
    });

    const branchRow = await pool.query(
      `SELECT status FROM branches WHERE tenant_id = $1 AND id = $2`,
      [seeded.tenantId, seeded.branchBId]
    );
    expect(branchRow.rows[0]?.status).toBe("FROZEN");

    const frozenAudit = await pool.query(
      `SELECT COUNT(*)::INT AS count
       FROM activity_log
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_type = 'BRANCH_FROZEN'`,
      [seeded.tenantId, seeded.branchBId]
    );
    expect(frozenAudit.rows[0].count).toBeGreaterThan(0);

    await branchModule.service.unfreezeBranch({
      tenantId: seeded.tenantId,
      branchId: seeded.branchBId,
      actorEmployeeId: seeded.employeeId,
    });

    const branchRow2 = await pool.query(
      `SELECT status FROM branches WHERE tenant_id = $1 AND id = $2`,
      [seeded.tenantId, seeded.branchBId]
    );
    expect(branchRow2.rows[0]?.status).toBe("ACTIVE");

    const unfrozenAudit = await pool.query(
      `SELECT COUNT(*)::INT AS count
       FROM activity_log
       WHERE tenant_id = $1
         AND branch_id = $2
         AND action_type = 'BRANCH_UNFROZEN'`,
      [seeded.tenantId, seeded.branchBId]
    );
    expect(unfrozenAudit.rows[0].count).toBeGreaterThan(0);

    await cleanupSeededTenant(pool, seeded);
  });

  it("branch guard rejects frozen-branch writes and appends denial audit (effective branchId)", async () => {
    const seeded = await seedTenantMultiBranch(pool);
    const auditModule = bootstrapAuditModule(pool);
    const branchModule = bootstrapBranchModule(pool, {
      auditWriterPort: auditModule.auditWriterPort,
    });

    // Ensure the target branch is frozen for denial scenarios.
    await setBranchStatus({
      pool,
      tenantId: seeded.tenantId,
      branchId: seeded.branchBId,
      status: "FROZEN",
    });

    const makeReqBase = () =>
      ({
        app: { locals: { branchGuardPort: branchModule.branchGuardPort, auditDb: pool } },
        user: {
          tenantId: seeded.tenantId,
          employeeId: seeded.employeeId,
          branchId: seeded.branchId,
          role: "ADMIN",
        },
      }) as any;

    const cases: Array<{
      name: string;
      operation: string;
      req: any;
      options: Parameters<typeof requireActiveBranch>[0];
      expectedBranchId: string;
    }> = [
      {
        name: "inventory receive uses body.branchId",
        operation: "inventory.receive_stock",
        req: {
          ...makeReqBase(),
          method: "POST",
          originalUrl: "/v1/inventory/journal/receive",
          body: { branchId: seeded.branchBId },
        },
        options: {
          operation: "inventory.receive_stock",
          resolveBranchId: (req) =>
            typeof req.body?.branchId === "string" ? req.body.branchId : undefined,
        },
        expectedBranchId: seeded.branchBId,
      },
      {
        name: "cash open session uses body.branchId",
        operation: "cash.open_session",
        req: {
          ...makeReqBase(),
          method: "POST",
          originalUrl: "/v1/cash/sessions",
          body: { branchId: seeded.branchBId },
        },
        options: {
          operation: "cash.open_session",
          resolveBranchId: (req) =>
            typeof req.body?.branchId === "string" ? req.body.branchId : undefined,
        },
        expectedBranchId: seeded.branchBId,
      },
      {
        name: "sales create draft uses user.branchId",
        operation: "sales.create_draft",
        req: {
          ...makeReqBase(),
          method: "POST",
          originalUrl: "/v1/sales/drafts",
          body: { clientUuid: "00000000-0000-0000-0000-000000000000", saleType: "dine_in" },
          user: {
            tenantId: seeded.tenantId,
            employeeId: seeded.employeeId,
            branchId: seeded.branchBId,
            role: "ADMIN",
          },
        },
        options: { operation: "sales.create_draft" },
        expectedBranchId: seeded.branchBId,
      },
    ];

    for (const c of cases) {
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.body = payload;
          return this;
        },
      };
      const next = jest.fn();

      await requireActiveBranch(c.options)(c.req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: "Branch is frozen", code: "BRANCH_FROZEN" });
      expect(next).not.toHaveBeenCalled();

      const denialCount = await pool.query(
        `SELECT COUNT(*)::INT AS count
         FROM activity_log
         WHERE tenant_id = $1
           AND branch_id = $2
           AND employee_id = $3
           AND action_type = 'ACTION_REJECTED_BRANCH_FROZEN'
           AND details->>'operation' = $4`,
        [seeded.tenantId, c.expectedBranchId, seeded.employeeId, c.operation]
      );
      expect(denialCount.rows[0].count).toBeGreaterThan(0);

      const denialRow = await pool.query(
        `SELECT outcome, denial_reason
         FROM activity_log
         WHERE tenant_id = $1
           AND branch_id = $2
           AND employee_id = $3
           AND action_type = 'ACTION_REJECTED_BRANCH_FROZEN'
           AND details->>'operation' = $4
         ORDER BY occurred_at DESC, id DESC
         LIMIT 1`,
        [seeded.tenantId, c.expectedBranchId, seeded.employeeId, c.operation]
      );
      expect(denialRow.rows[0]?.outcome).toBe("REJECTED");
      expect(denialRow.rows[0]?.denial_reason).toBe("BRANCH_FROZEN");
    }

    await cleanupSeededTenant(pool, seeded);
  });
});

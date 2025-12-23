import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool } from "pg";
import express from "express";
import request from "supertest";
import { bootstrapAuditModule } from "../modules/audit/index.js";
import { setupAuthModule } from "../modules/auth/index.js";
import { bootstrapStaffManagementModule } from "../modules/staffManagement/index.js";
import { PasswordService } from "../modules/auth/app/password.service.js";
import { createTestPool } from "../test-utils/db.js";
import {
  cleanupSeededTenant,
  seedTenantMultiBranch,
  seedTenantSingleBranch,
} from "../test-utils/seed.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

async function ensureTenantLimits(pool: Pool, tenantId: string) {
  await pool.query(
    `INSERT INTO tenant_limits (tenant_id)
     VALUES ($1)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
}

async function createEmployeeWithAccount(params: {
  pool: Pool;
  tenantId: string;
  branchId: string;
  role: "ADMIN" | "MANAGER" | "CASHIER" | "CLERK";
  status: "ACTIVE" | "DISABLED" | "ARCHIVED";
  activeAssignment?: boolean;
}): Promise<{
  accountId: string;
  employeeId: string;
  phone: string;
  password: string;
}> {
  const phone = uniquePhone();
  const password = "Test123!";
  const passwordHash = await PasswordService.hashPassword(password);

  const accountRes = await params.pool.query(
    `INSERT INTO accounts (phone, password_hash, status)
     VALUES ($1,$2,'ACTIVE')
     RETURNING id`,
    [phone, passwordHash]
  );
  const accountId = accountRes.rows[0].id as string;

  const employeeRes = await params.pool.query(
    `INSERT INTO employees (
      tenant_id,
      account_id,
      phone,
      email,
      password_hash,
      first_name,
      last_name,
      status,
      default_branch_id,
      last_branch_id
    ) VALUES ($1,$2,$3,NULL,$4,'Test','User',$5,$6,$6)
    RETURNING id`,
    [params.tenantId, accountId, phone, passwordHash, params.status, params.branchId]
  );
  const employeeId = employeeRes.rows[0].id as string;

  await params.pool.query(
    `INSERT INTO employee_branch_assignments (employee_id, branch_id, role, active)
     VALUES ($1,$2,$3,$4)`,
    [
      employeeId,
      params.branchId,
      params.role,
      params.activeAssignment ?? true,
    ]
  );

  return { accountId, employeeId, phone, password };
}

function createApp(pool: Pool) {
  const auditModule = bootstrapAuditModule(pool);
  const staffModule = bootstrapStaffManagementModule(pool, {
    auditWriterPort: auditModule.auditWriterPort,
  });
  const authModule = setupAuthModule(pool, {
    invitationPort: staffModule.invitationPort,
    tenantProvisioningPort: {
      provisionTenant: async () => {
        throw new Error("not implemented in this test");
      },
    } as any,
    auditWriterPort: auditModule.auditWriterPort,
  });

  const app = express();
  app.use(express.json());
  app.use("/v1/auth", staffModule.createRouter(authModule.authMiddleware));

  return { app, authModule };
}

describe("Staff management API (DB-backed)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("admin lists staff including pending invites", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    await ensureTenantLimits(pool, seeded.tenantId);
    const extraAccountIds: string[] = [];

    const { app, authModule } = createApp(pool);
    const login = await authModule.authService.login({
      phone: seeded.admin.phone,
      password: seeded.admin.password,
    });
    expect(login.kind).toBe("single");
    const token = login.kind === "single" ? login.tokens.accessToken : "";

    const inviteRes = await request(app)
      .post("/v1/auth/invites")
      .set("Authorization", `Bearer ${token}`)
      .send({
        first_name: "Jane",
        last_name: "Doe",
        phone: uniquePhone(),
        role: "CASHIER",
        branch_id: seeded.branchId,
      })
      .expect(201);
    expect(inviteRes.body.invite?.id).toBeTruthy();

    const res = await request(app)
      .get("/v1/auth/staff")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.staff)).toBe(true);
    expect(res.body.staff.length).toBeGreaterThan(0);
    const hasInvite = res.body.staff.some(
      (item: any) => item.record_type === "INVITE"
    );
    expect(hasInvite).toBe(true);

    await cleanupSeededTenant(pool, seeded);
    if (extraAccountIds.length > 0) {
      await pool.query(
        `DELETE FROM accounts WHERE id = ANY($1::uuid[])`,
        [extraAccountIds]
      );
    }
  });

  it("manager list is scoped to own branch", async () => {
    const seeded = await seedTenantMultiBranch(pool, {
      assignAdminToBranchB: false,
    });
    await ensureTenantLimits(pool, seeded.tenantId);
    const extraAccountIds: string[] = [];

    const manager = await createEmployeeWithAccount({
      pool,
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      role: "MANAGER",
      status: "ACTIVE",
    });
    extraAccountIds.push(manager.accountId);

    const { app, authModule } = createApp(pool);
    const login = await authModule.authService.login({
      phone: manager.phone,
      password: manager.password,
    });
    expect(login.kind).toBe("single");
    const token = login.kind === "single" ? login.tokens.accessToken : "";

    await request(app)
      .get(`/v1/auth/staff?branch_id=${seeded.branchBId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    await pool.query(
      `INSERT INTO invites (tenant_id, branch_id, role, phone, token_hash, first_name, last_name, expires_at)
       VALUES ($1,$2,'CASHIER',$3,'hash','BranchB','Invite',NOW() + INTERVAL '1 day')`,
      [seeded.tenantId, seeded.branchBId, uniquePhone()]
    );

    const res = await request(app)
      .get("/v1/auth/staff")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const allBranchA = res.body.staff.every(
      (item: any) => item.branch_id === seeded.branchId
    );
    expect(allBranchA).toBe(true);

    await cleanupSeededTenant(pool, seeded);
    if (extraAccountIds.length > 0) {
      await pool.query(
        `DELETE FROM accounts WHERE id = ANY($1::uuid[])`,
        [extraAccountIds]
      );
    }
  });

  it("reactivate and archive endpoints update employee status", async () => {
    const seeded = await seedTenantSingleBranch(pool);
    await ensureTenantLimits(pool, seeded.tenantId);
    const extraAccountIds: string[] = [];

    const disabled = await createEmployeeWithAccount({
      pool,
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      role: "CASHIER",
      status: "DISABLED",
      activeAssignment: false,
    });
    extraAccountIds.push(disabled.accountId);

    const active = await createEmployeeWithAccount({
      pool,
      tenantId: seeded.tenantId,
      branchId: seeded.branchId,
      role: "CASHIER",
      status: "ACTIVE",
    });
    extraAccountIds.push(active.accountId);

    const { app, authModule } = createApp(pool);
    const login = await authModule.authService.login({
      phone: seeded.admin.phone,
      password: seeded.admin.password,
    });
    expect(login.kind).toBe("single");
    const token = login.kind === "single" ? login.tokens.accessToken : "";

    const reactivateRes = await request(app)
      .post(`/v1/auth/users/${disabled.employeeId}/reactivate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(reactivateRes.body.employee.status).toBe("ACTIVE");

    const assignmentRes = await pool.query(
      `SELECT active FROM employee_branch_assignments
       WHERE employee_id = $1 AND branch_id = $2`,
      [disabled.employeeId, seeded.branchId]
    );
    expect(assignmentRes.rows[0]?.active).toBe(true);

    const archiveRes = await request(app)
      .post(`/v1/auth/users/${active.employeeId}/archive`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(archiveRes.body.employee.status).toBe("ARCHIVED");

    const archivedAssignment = await pool.query(
      `SELECT active FROM employee_branch_assignments
       WHERE employee_id = $1 AND branch_id = $2`,
      [active.employeeId, seeded.branchId]
    );
    expect(archivedAssignment.rows[0]?.active).toBe(false);

    await cleanupSeededTenant(pool, seeded);
    if (extraAccountIds.length > 0) {
      await pool.query(
        `DELETE FROM accounts WHERE id = ANY($1::uuid[])`,
        [extraAccountIds]
      );
    }
  });
});

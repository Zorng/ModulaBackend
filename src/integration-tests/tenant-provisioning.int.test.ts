import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool } from "pg";
import { PgPolicyRepository } from "../modules/policy/infra/repository.js";
import { bootstrapBranchModule } from "../modules/branch/index.js";
import { bootstrapTenantModule } from "../modules/tenant/index.js";
import { createMembershipProvisioningPort } from "../modules/auth/app/membership-provisioning.port.js";
import { PasswordService } from "../modules/auth/app/password.service.js";
import { createTestPool } from "../test-utils/db.js";
import { cleanupSeededTenant } from "../test-utils/seed.js";

function uniquePhone(): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `+1${now}${rand}`;
}

function uniqueTenantName(prefix = "Integration Tenant"): string {
  const now = Date.now().toString().slice(-9);
  const rand = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");
  return `${prefix} ${now}${rand}`;
}

async function createAccount(pool: Pool, params?: { phone?: string; password?: string }) {
  const phone = params?.phone ?? uniquePhone();
  const password = params?.password ?? "Test123!";
  const passwordHash = await PasswordService.hashPassword(password);
  const res = await pool.query(
    `INSERT INTO accounts (phone, password_hash, status)
     VALUES ($1,$2,'ACTIVE')
     RETURNING id`,
    [phone, passwordHash]
  );
  return { accountId: res.rows[0].id as string, phone, password, passwordHash };
}

describe("Tenant provisioning (DB-backed)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("provisions a usable tenant (tenant + initial branch + admin membership + default policies)", async () => {
    const account = await createAccount(pool);
    const tenantName = uniqueTenantName();

    const branchModule = bootstrapBranchModule(pool);
    const policyRepo = new PgPolicyRepository(pool);

    const tenantModule = bootstrapTenantModule(pool, {
      membershipProvisioningPort: createMembershipProvisioningPort(),
      branchProvisioningPort: branchModule.branchProvisioningPort,
      policyDefaultsPort: {
        ensureDefaultPolicies: async (tenantId) => {
          await policyRepo.ensureDefaultPolicies(tenantId);
        },
      },
    });

    const provisioned = await tenantModule.tenantProvisioningPort.provisionTenant({
      name: tenantName,
      business_type: "RETAIL",
      accountId: account.accountId,
      phone: account.phone,
      firstName: "Admin",
      lastName: "User",
      passwordHash: account.passwordHash,
    });

    const tenantId = provisioned.tenant.id;
    const branchId = provisioned.branch.id;

    const tenantRow = await pool.query(`SELECT id, name FROM tenants WHERE id = $1`, [
      tenantId,
    ]);
    expect(tenantRow.rows[0]?.id).toBe(tenantId);
    expect(tenantRow.rows[0]?.name).toBe(tenantName);

    const branchRow = await pool.query(
      `SELECT id, tenant_id, status FROM branches WHERE id = $1`,
      [branchId]
    );
    expect(branchRow.rows[0]?.tenant_id).toBe(tenantId);
    expect(branchRow.rows[0]?.status).toBe("ACTIVE");

    const employeeRow = await pool.query(
      `SELECT id, status
       FROM employees
       WHERE tenant_id = $1 AND account_id = $2`,
      [tenantId, account.accountId]
    );
    expect(employeeRow.rows.length).toBe(1);
    expect(employeeRow.rows[0].status).toBe("ACTIVE");

    const employeeId = employeeRow.rows[0].id as string;
    const assignmentRow = await pool.query(
      `SELECT role, active
       FROM employee_branch_assignments
       WHERE employee_id = $1 AND branch_id = $2`,
      [employeeId, branchId]
    );
    expect(assignmentRow.rows.length).toBe(1);
    expect(assignmentRow.rows[0].role).toBe("ADMIN");
    expect(assignmentRow.rows[0].active).toBe(true);

    const [salesPolicies, inventoryPolicies, cashPolicies, attendancePolicies] =
      await Promise.all([
        pool.query(`SELECT 1 FROM sales_policies WHERE tenant_id = $1`, [tenantId]),
        pool.query(
          `SELECT
             auto_subtract_on_sale,
             expiry_tracking_enabled,
             branch_overrides,
             exclude_menu_item_ids
           FROM inventory_policies
           WHERE tenant_id = $1`,
          [tenantId]
        ),
        pool.query(
          `SELECT 1 FROM cash_session_policies WHERE tenant_id = $1`,
          [tenantId]
        ),
        pool.query(`SELECT 1 FROM attendance_policies WHERE tenant_id = $1`, [tenantId]),
      ]);
    expect(salesPolicies.rows.length).toBe(1);
    expect(inventoryPolicies.rows.length).toBe(1);
    expect(inventoryPolicies.rows[0].auto_subtract_on_sale).toBe(true);
    expect(inventoryPolicies.rows[0].expiry_tracking_enabled).toBe(false);
    expect(inventoryPolicies.rows[0].branch_overrides).toEqual({});
    expect(inventoryPolicies.rows[0].exclude_menu_item_ids).toEqual([]);
    expect(cashPolicies.rows.length).toBe(1);
    expect(attendancePolicies.rows.length).toBe(1);

    const audit = await pool.query(
      `SELECT action_type
       FROM activity_log
       WHERE tenant_id = $1`,
      [tenantId]
    );
    const actionTypes = audit.rows.map((r: any) => r.action_type);
    expect(actionTypes).toEqual(
      expect.arrayContaining(["TENANT_CREATED", "BRANCH_PROVISIONED"])
    );

    await cleanupSeededTenant(pool, { tenantId, accountId: account.accountId });
  });

  it("rolls back the whole provisioning transaction when membership provisioning fails", async () => {
    const account = await createAccount(pool);
    const tenantName = uniqueTenantName("Rollback Tenant");

    const branchModule = bootstrapBranchModule(pool);
    const policyRepo = new PgPolicyRepository(pool);

    const tenantModule = bootstrapTenantModule(pool, {
      membershipProvisioningPort: {
        createInitialAdminMembership: async () => {
          throw new Error("membership provisioning failed");
        },
      },
      branchProvisioningPort: branchModule.branchProvisioningPort,
      policyDefaultsPort: {
        ensureDefaultPolicies: async (tenantId) => {
          await policyRepo.ensureDefaultPolicies(tenantId);
        },
      },
    });

    await expect(
      tenantModule.tenantProvisioningPort.provisionTenant({
        name: tenantName,
        business_type: "RETAIL",
        accountId: account.accountId,
        phone: account.phone,
        firstName: "Admin",
        lastName: "User",
        passwordHash: account.passwordHash,
      })
    ).rejects.toThrow("membership provisioning failed");

    const tenantCount = await pool.query(
      `SELECT COUNT(*)::INT AS count FROM tenants WHERE name = $1`,
      [tenantName]
    );
    expect(tenantCount.rows[0].count).toBe(0);

    await pool.query(`DELETE FROM accounts WHERE id = $1`, [account.accountId]);
  });

  it("cleans up the tenant if default policy seeding fails after commit", async () => {
    const account = await createAccount(pool);
    const tenantName = uniqueTenantName("Policy Failure Tenant");

    const branchModule = bootstrapBranchModule(pool);

    const tenantModule = bootstrapTenantModule(pool, {
      membershipProvisioningPort: createMembershipProvisioningPort(),
      branchProvisioningPort: branchModule.branchProvisioningPort,
      policyDefaultsPort: {
        ensureDefaultPolicies: async () => {
          throw new Error("policy seeding failed");
        },
      },
    });

    await expect(
      tenantModule.tenantProvisioningPort.provisionTenant({
        name: tenantName,
        business_type: "RETAIL",
        accountId: account.accountId,
        phone: account.phone,
        firstName: "Admin",
        lastName: "User",
        passwordHash: account.passwordHash,
      })
    ).rejects.toThrow("policy seeding failed");

    const tenantCount = await pool.query(
      `SELECT COUNT(*)::INT AS count FROM tenants WHERE name = $1`,
      [tenantName]
    );
    expect(tenantCount.rows[0].count).toBe(0);

    const employeesForAccount = await pool.query(
      `SELECT COUNT(*)::INT AS count FROM employees WHERE account_id = $1`,
      [account.accountId]
    );
    expect(employeesForAccount.rows[0].count).toBe(0);

    await pool.query(`DELETE FROM accounts WHERE id = $1`, [account.accountId]);
  });

  it("creates tenant limits during provisioning (menu + inventory + staff seats)", async () => {
    const account = await createAccount(pool);
    const tenantName = uniqueTenantName("Limits Tenant");

    const branchModule = bootstrapBranchModule(pool);
    const policyRepo = new PgPolicyRepository(pool);

    const tenantModule = bootstrapTenantModule(pool, {
      membershipProvisioningPort: createMembershipProvisioningPort(),
      branchProvisioningPort: branchModule.branchProvisioningPort,
      policyDefaultsPort: {
        ensureDefaultPolicies: async (tenantId) => {
          await policyRepo.ensureDefaultPolicies(tenantId);
        },
      },
    });

    const provisioned = await tenantModule.tenantProvisioningPort.provisionTenant({
      name: tenantName,
      business_type: "RETAIL",
      accountId: account.accountId,
      phone: account.phone,
      firstName: "Admin",
      lastName: "User",
      passwordHash: account.passwordHash,
    });

    const limits = await pool.query(
      `SELECT
         max_categories_soft,
         max_categories_hard,
         max_items_soft,
         max_items_hard,
         max_modifier_groups_per_item,
         max_modifier_options_per_group,
         max_total_modifier_options_per_item,
         max_media_quota_mb,
         max_stock_items_soft,
         max_stock_items_hard,
         max_staff_seats_soft,
         max_staff_seats_hard
       FROM tenant_limits
       WHERE tenant_id = $1`,
      [provisioned.tenant.id]
    );

    expect(limits.rows.length).toBe(1);
    const row = limits.rows[0] as any;

    expect(Number(row.max_categories_soft)).toBe(8);
    expect(Number(row.max_categories_hard)).toBe(12);
    expect(Number(row.max_items_soft)).toBe(75);
    expect(Number(row.max_items_hard)).toBe(120);
    expect(Number(row.max_modifier_groups_per_item)).toBe(5);
    expect(Number(row.max_modifier_options_per_group)).toBe(12);
    expect(Number(row.max_total_modifier_options_per_item)).toBe(30);
    expect(Number(row.max_media_quota_mb)).toBe(10);

    expect(Number(row.max_stock_items_soft)).toBe(50);
    expect(Number(row.max_stock_items_hard)).toBe(75);

    expect(Number(row.max_staff_seats_soft)).toBe(5);
    expect(Number(row.max_staff_seats_hard)).toBe(10);

    await cleanupSeededTenant(pool, {
      tenantId: provisioned.tenant.id,
      accountId: account.accountId,
    });
  });
});

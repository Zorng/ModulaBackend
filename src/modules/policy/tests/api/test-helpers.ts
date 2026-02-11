import { Express } from "express";
import request from "supertest";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { pool as dbPool } from "../../../../platform/db/index.js";
import { createTestApp } from "./test-app.js";

export interface TestContext {
  app: Express;
  pool: Pool;
  tenantId: string;
  branchId: string;
  userId: string;
  token: string;
}

/**
 * Creates test context with authenticated user and default policies
 */
export async function setupTestContext(): Promise<TestContext> {
  const pool = dbPool;
  const app = createTestApp(pool);

  const tenantId = randomUUID();
  const branchId = randomUUID();
  const employeeId = randomUUID();

  // Create test tenant
  await pool.query(
    `INSERT INTO tenants (id, name, created_at, updated_at) 
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [tenantId, "Test Tenant Policy API"]
  );

  // Create test branch
  await pool.query(
    `INSERT INTO branches (id, tenant_id, name, created_at, updated_at) 
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [branchId, tenantId, "Test Branch Policy API"]
  );

  // Create test employee (required for auth middleware)
  await pool.query(
    `INSERT INTO employees (id, tenant_id, phone, email, password_hash, first_name, last_name, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (tenant_id, phone) DO NOTHING`,
    [
      employeeId,
      tenantId,
      `+${randomUUID().substring(0, 10)}`, // Unique phone
      `test-${randomUUID().substring(0, 8)}@api.com`, // Unique email
      "hash",
      "Test",
      "User",
      "ACTIVE",
    ]
  );

  // Assign employee to branch with ADMIN role
  await pool.query(
    `INSERT INTO employee_branch_assignments (employee_id, branch_id, role, active, assigned_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (employee_id, branch_id) DO NOTHING`,
    [employeeId, branchId, "ADMIN", true]
  );

  // Create default policies for the tenant
  await pool.query(
    `INSERT INTO auth_policies (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
  await pool.query(
    `INSERT INTO multi_branch_policies (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
  await pool.query(
    `INSERT INTO sales_policies (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
  await pool.query(
    `INSERT INTO inventory_policies (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
  await pool.query(
    `INSERT INTO receipt_policies (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
  await pool.query(
    `INSERT INTO cash_session_policies (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
  await pool.query(
    `INSERT INTO attendance_policies (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );

  // Generate JWT token with correct claims
  const jwtSecret = process.env.JWT_SECRET || "test-secret";
  const token = jwt.sign(
    { employeeId, tenantId, branchId, role: "ADMIN" },
    jwtSecret,
    { expiresIn: "1h" }
  );

  return { app, pool, tenantId, branchId, userId: employeeId, token };
}

/**
 * Cleanup test data
 */
export async function cleanupTestContext(ctx: TestContext): Promise<void> {
  // Clean up in reverse order of dependencies
  try {
    // Delete policy tables
    await ctx.pool.query(`DELETE FROM auth_policies WHERE tenant_id = $1`, [
      ctx.tenantId,
    ]);
    await ctx.pool.query(
      `DELETE FROM multi_branch_policies WHERE tenant_id = $1`,
      [ctx.tenantId]
    );
    await ctx.pool.query(`DELETE FROM sales_policies WHERE tenant_id = $1`, [
      ctx.tenantId,
    ]);
    await ctx.pool.query(
      `DELETE FROM inventory_policies WHERE tenant_id = $1`,
      [ctx.tenantId]
    );
    await ctx.pool.query(`DELETE FROM receipt_policies WHERE tenant_id = $1`, [
      ctx.tenantId,
    ]);
    await ctx.pool.query(
      `DELETE FROM cash_session_policies WHERE tenant_id = $1`,
      [ctx.tenantId]
    );
    await ctx.pool.query(
      `DELETE FROM attendance_policies WHERE tenant_id = $1`,
      [ctx.tenantId]
    );

    // Delete employees and tenants
    await ctx.pool.query(
      `DELETE FROM employee_branch_assignments WHERE employee_id = $1`,
      [ctx.userId]
    );
    await ctx.pool.query(`DELETE FROM employees WHERE tenant_id = $1`, [
      ctx.tenantId,
    ]);
    await ctx.pool.query(`DELETE FROM branches WHERE tenant_id = $1`, [
      ctx.tenantId,
    ]);
    await ctx.pool.query(`DELETE FROM tenants WHERE id = $1`, [ctx.tenantId]);
  } catch (error) {
    console.error("Cleanup error:", error);
  }
}

/**
 * Make authenticated request
 */
export function authRequest(app: Express, token: string) {
  return {
    get: (url: string) =>
      request(app).get(url).set("Authorization", `Bearer ${token}`),
    post: (url: string) =>
      request(app).post(url).set("Authorization", `Bearer ${token}`),
    put: (url: string) =>
      request(app).put(url).set("Authorization", `Bearer ${token}`),
    patch: (url: string) =>
      request(app).patch(url).set("Authorization", `Bearer ${token}`),
    delete: (url: string) =>
      request(app).delete(url).set("Authorization", `Bearer ${token}`),
  };
}


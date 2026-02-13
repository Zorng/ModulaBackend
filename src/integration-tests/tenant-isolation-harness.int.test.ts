import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import crypto from "crypto";

type ScopedRow = { id: string; tenant_id: string; name: string };

async function findBranchWithinTenant(
  pool: Pool,
  tenantId: string,
  branchId: string
): Promise<ScopedRow | null> {
  const result = await pool.query<ScopedRow>(
    `SELECT id, tenant_id, name
     FROM branches
     WHERE id = $1
       AND tenant_id = $2`,
    [branchId, tenantId]
  );
  return result.rows[0] ?? null;
}

async function renameBranchWithinTenant(
  pool: Pool,
  tenantId: string,
  branchId: string,
  name: string
): Promise<number> {
  const result = await pool.query(
    `UPDATE branches
     SET name = $3, updated_at = NOW()
     WHERE id = $1
       AND tenant_id = $2`,
    [branchId, tenantId, name]
  );
  return result.rowCount ?? 0;
}

describe("Cross-tenant safety harness", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("denies ID-guessing reads and writes when tenant guard is applied", async () => {
    const tenantAId = crypto.randomUUID();
    const tenantBId = crypto.randomUUID();
    const branchAId = crypto.randomUUID();
    const branchBId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO tenants (id, name, status) VALUES
       ($1, 'Isolation Harness A', 'ACTIVE'),
       ($2, 'Isolation Harness B', 'ACTIVE')`,
      [tenantAId, tenantBId]
    );
    await pool.query(
      `INSERT INTO branches (id, tenant_id, name, status) VALUES
       ($1, $2, 'A Branch', 'ACTIVE'),
       ($3, $4, 'B Branch', 'ACTIVE')`,
      [branchAId, tenantAId, branchBId, tenantBId]
    );

    const ownRead = await findBranchWithinTenant(pool, tenantAId, branchAId);
    expect(ownRead?.id).toBe(branchAId);

    const guessedRead = await findBranchWithinTenant(pool, tenantAId, branchBId);
    expect(guessedRead).toBeNull();

    const crossTenantWriteCount = await renameBranchWithinTenant(
      pool,
      tenantAId,
      branchBId,
      "Compromised"
    );
    expect(crossTenantWriteCount).toBe(0);

    const stillOriginal = await pool.query<{ name: string }>(
      `SELECT name FROM branches WHERE id = $1`,
      [branchBId]
    );
    expect(stillOriginal.rows[0]?.name).toBe("B Branch");

    await pool.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [
      tenantAId,
      tenantBId,
    ]);
  });
});

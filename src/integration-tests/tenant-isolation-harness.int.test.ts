import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Pool } from "pg";
import { createTestPool } from "../test-utils/db.js";
import { cleanupSeededTenant, seedTenantSingleBranch } from "../test-utils/seed.js";

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
    const tenantA = await seedTenantSingleBranch(pool, {
      tenant: { name: "Isolation Harness A" },
      branch: { name: "A Branch" },
    });
    const tenantB = await seedTenantSingleBranch(pool, {
      tenant: { name: "Isolation Harness B" },
      branch: { name: "B Branch" },
    });

    const ownRead = await findBranchWithinTenant(
      pool,
      tenantA.tenantId,
      tenantA.branchId
    );
    expect(ownRead?.id).toBe(tenantA.branchId);

    const guessedRead = await findBranchWithinTenant(
      pool,
      tenantA.tenantId,
      tenantB.branchId
    );
    expect(guessedRead).toBeNull();

    const crossTenantWriteCount = await renameBranchWithinTenant(
      pool,
      tenantA.tenantId,
      tenantB.branchId,
      "Compromised"
    );
    expect(crossTenantWriteCount).toBe(0);

    const stillOriginal = await pool.query<{ name: string }>(
      `SELECT name FROM branches WHERE id = $1`,
      [tenantB.branchId]
    );
    expect(stillOriginal.rows[0]?.name).toBe("B Branch");

    await cleanupSeededTenant(pool, tenantA);
    await cleanupSeededTenant(pool, tenantB);
  });
});

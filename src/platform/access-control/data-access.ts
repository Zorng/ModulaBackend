import type { Queryable } from "./types.js";

export async function getTenantStatus(
  db: Queryable,
  tenantId: string
): Promise<string | null> {
  const result = await db.query<{ status: string }>(
    `SELECT status
     FROM tenants
     WHERE id = $1`,
    [tenantId]
  );
  return result.rows[0]?.status ?? null;
}

export async function getActiveMembership(
  db: Queryable,
  accountId: string,
  tenantId: string
): Promise<{ id: string; role_key: string } | null> {
  const result = await db.query<{ id: string; role_key: string }>(
    `SELECT id, role_key
     FROM v0_tenant_memberships
     WHERE account_id = $1
       AND tenant_id = $2
       AND status = 'ACTIVE'
     LIMIT 1`,
    [accountId, tenantId]
  );
  return result.rows[0] ?? null;
}

export async function getBranchStatus(input: {
  db: Queryable;
  tenantId: string;
  branchId: string;
}): Promise<string | null> {
  const result = await input.db.query<{ status: string }>(
    `SELECT status
     FROM branches
     WHERE id = $1
       AND tenant_id = $2`,
    [input.branchId, input.tenantId]
  );
  return result.rows[0]?.status ?? null;
}

export async function hasActiveBranchAccess(input: {
  db: Queryable;
  accountId: string;
  tenantId: string;
  branchId: string;
}): Promise<boolean> {
  const result = await input.db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM v0_branch_assignments ba
       JOIN v0_tenant_memberships m ON m.id = ba.membership_id
       JOIN branches b ON b.id = ba.branch_id
       WHERE ba.account_id = $1
         AND ba.tenant_id = $2
         AND ba.branch_id = $3
         AND ba.status = 'ACTIVE'
         AND m.account_id = $1
         AND m.tenant_id = $2
         AND m.status = 'ACTIVE'
         AND b.tenant_id = $2
     ) AS exists`,
    [input.accountId, input.tenantId, input.branchId]
  );
  return result.rows[0]?.exists === true;
}

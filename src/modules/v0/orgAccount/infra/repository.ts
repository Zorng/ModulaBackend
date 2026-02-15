import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type TenantProfileRow = {
  id: string;
  name: string;
  address: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  status: string;
};

export type BranchProfileRow = {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  contact_phone: string | null;
  status: string;
};

export class V0OrgAccountRepository {
  constructor(private readonly db: Queryable) {}

  async findTenantProfileById(tenantId: string): Promise<TenantProfileRow | null> {
    const result = await this.db.query<TenantProfileRow>(
      `SELECT
         id,
         name,
         address,
         contact_phone,
         logo_url,
         status
       FROM tenants
       WHERE id = $1`,
      [tenantId]
    );
    return result.rows[0] ?? null;
  }

  async findBranchProfile(input: {
    tenantId: string;
    branchId: string;
  }): Promise<BranchProfileRow | null> {
    const result = await this.db.query<BranchProfileRow>(
      `SELECT
         id,
         tenant_id,
         name,
         address,
         contact_phone,
         status
       FROM branches
       WHERE id = $1
         AND tenant_id = $2`,
      [input.branchId, input.tenantId]
    );
    return result.rows[0] ?? null;
  }

  async hasActiveBranchAssignment(input: {
    accountId: string;
    tenantId: string;
    branchId: string;
  }): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM v0_branch_assignments ba
         JOIN v0_tenant_memberships m ON m.id = ba.membership_id
         WHERE ba.account_id = $1
           AND ba.tenant_id = $2
           AND ba.branch_id = $3
           AND ba.status = 'ACTIVE'
           AND m.account_id = $1
           AND m.tenant_id = $2
           AND m.status = 'ACTIVE'
       ) AS exists`,
      [input.accountId, input.tenantId, input.branchId]
    );
    return result.rows[0]?.exists === true;
  }

  async listAccessibleBranches(input: {
    accountId: string;
    tenantId: string;
  }): Promise<BranchProfileRow[]> {
    const result = await this.db.query<BranchProfileRow>(
      `SELECT
         b.id,
         b.tenant_id,
         b.name,
         b.address,
         b.contact_phone,
         b.status
       FROM v0_branch_assignments ba
       JOIN v0_tenant_memberships m ON m.id = ba.membership_id
       JOIN branches b ON b.id = ba.branch_id
       WHERE ba.account_id = $1
         AND ba.tenant_id = $2
         AND ba.status = 'ACTIVE'
         AND m.account_id = $1
         AND m.tenant_id = $2
         AND m.status = 'ACTIVE'
         AND b.tenant_id = $2
       ORDER BY b.name ASC, b.id ASC`,
      [input.accountId, input.tenantId]
    );
    return result.rows;
  }
}

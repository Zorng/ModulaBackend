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

export type V0AccountRow = {
  id: string;
  phone: string;
  status: string;
};

export type V0TenantProvisioningRow = {
  tenant_id: string;
  tenant_name: string;
  tenant_status: string;
  membership_id: string;
  membership_role_key: string;
  membership_status: string;
  branch_id: string | null;
  branch_name: string | null;
  branch_status: string | null;
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

  async findAccountById(accountId: string): Promise<V0AccountRow | null> {
    const result = await this.db.query<V0AccountRow>(
      `SELECT id, phone, status
       FROM accounts
       WHERE id = $1`,
      [accountId]
    );
    return result.rows[0] ?? null;
  }

  async countOwnerTenantMembershipsForAccount(accountId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_tenant_memberships
       WHERE account_id = $1
         AND role_key = 'OWNER'`,
      [accountId]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async recordFairUseEventAndCountRecent(input: {
    accountId: string;
    actionKey: string;
    windowSeconds: number;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `WITH inserted AS (
         INSERT INTO v0_fair_use_events (
           account_id,
           action_key
         )
         VALUES ($1, $2)
         RETURNING created_at
       ),
       recent AS (
         SELECT created_at
         FROM v0_fair_use_events
         WHERE account_id = $1
           AND action_key = $2
           AND created_at >= NOW() - ($3::TEXT || ' seconds')::INTERVAL
         UNION ALL
         SELECT created_at
         FROM inserted
       )
       SELECT COUNT(*)::TEXT AS count
       FROM recent`,
      [input.accountId, input.actionKey, input.windowSeconds]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async createTenantWithOwnerAndOptionalFirstBranch(input: {
    accountId: string;
    tenantName: string;
    firstBranchName: string | null;
  }): Promise<V0TenantProvisioningRow> {
    const result = await this.db.query<V0TenantProvisioningRow>(
      `WITH inserted_tenant AS (
         INSERT INTO tenants (name, status)
         VALUES ($2, 'ACTIVE')
         RETURNING id, name, status
       ),
       inserted_membership AS (
         INSERT INTO v0_tenant_memberships (
           tenant_id,
           account_id,
           role_key,
           status,
           invited_at,
           accepted_at
         )
         SELECT id, $1, 'OWNER', 'ACTIVE', NOW(), NOW()
         FROM inserted_tenant
         RETURNING id, role_key, status
       ),
      inserted_branch AS (
         INSERT INTO branches (tenant_id, name, status)
         SELECT id, NULLIF($3::text, ''), 'ACTIVE'
         FROM inserted_tenant
         WHERE NULLIF($3::text, '') IS NOT NULL
         RETURNING id, name, status
       ),
       inserted_subscription AS (
         INSERT INTO v0_tenant_subscription_states (tenant_id, state)
         SELECT id, 'ACTIVE'
         FROM inserted_tenant
       ),
       inserted_branch_entitlements AS (
         INSERT INTO v0_branch_entitlements (
           tenant_id,
           branch_id,
           entitlement_key,
           enforcement
         )
         SELECT
           t.id,
           b.id,
           seed.entitlement_key,
           seed.enforcement
         FROM inserted_tenant t
         JOIN inserted_branch b ON TRUE
         CROSS JOIN (
           VALUES
             ('core.pos', 'ENABLED'),
             ('module.workforce', 'ENABLED'),
             ('module.inventory', 'ENABLED'),
             ('addon.workforce.gps_verification', 'DISABLED_VISIBLE')
         ) AS seed(entitlement_key, enforcement)
       )
       SELECT
         t.id AS tenant_id,
         t.name AS tenant_name,
         t.status AS tenant_status,
         m.id AS membership_id,
         m.role_key AS membership_role_key,
         m.status AS membership_status,
         b.id AS branch_id,
         b.name AS branch_name,
         b.status AS branch_status
       FROM inserted_tenant t
       CROSS JOIN inserted_membership m
       LEFT JOIN inserted_branch b ON TRUE`,
      [input.accountId, input.tenantName, input.firstBranchName]
    );
    return result.rows[0];
  }

  async ensureStaffProfileForMembership(membershipId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO v0_staff_profiles (
         tenant_id,
         account_id,
         membership_id,
         first_name,
         last_name,
         status
       )
       SELECT
         m.tenant_id,
         m.account_id,
         m.id,
         a.first_name,
         a.last_name,
         'ACTIVE'
       FROM v0_tenant_memberships m
       JOIN accounts a ON a.id = m.account_id
       WHERE m.id = $1
       ON CONFLICT (tenant_id, account_id)
       DO UPDATE SET
         membership_id = EXCLUDED.membership_id,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         status = 'ACTIVE',
         updated_at = NOW()`,
      [membershipId]
    );
  }

  async upsertActiveBranchAssignmentsForMembership(input: {
    membershipId: string;
    tenantId: string;
    accountId: string;
    branchIds: string[];
  }): Promise<void> {
    if (input.branchIds.length === 0) {
      return;
    }

    await this.db.query(
      `INSERT INTO v0_branch_assignments (
         tenant_id,
         branch_id,
         account_id,
         membership_id,
         status,
         assigned_at
       )
       SELECT $1, branch_id, $2, $3, 'ACTIVE', NOW()
       FROM UNNEST($4::uuid[]) AS branch_id
       ON CONFLICT (tenant_id, branch_id, account_id)
       DO UPDATE SET
         membership_id = EXCLUDED.membership_id,
         status = 'ACTIVE',
         revoked_at = NULL,
         updated_at = NOW()`,
      [input.tenantId, input.accountId, input.membershipId, input.branchIds]
    );
  }
}

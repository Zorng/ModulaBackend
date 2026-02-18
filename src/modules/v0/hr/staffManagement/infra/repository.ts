import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0MembershipForRequesterActionRow = {
  target_membership_id: string;
  target_tenant_id: string;
  target_account_id: string;
  target_role_key: string;
  target_status: string;
  requester_membership_id: string;
  requester_role_key: string;
};

export type V0TenantMembershipRow = {
  id: string;
  tenant_id: string;
  account_id: string;
  status: "INVITED" | "ACTIVE" | "REVOKED";
};

export type V0BranchRow = {
  id: string;
  tenant_id: string;
  status: string;
};

export class V0StaffManagementRepository {
  constructor(private readonly db: Queryable) {}

  async findMembershipById(membershipId: string): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `SELECT id, tenant_id, account_id, status
       FROM v0_tenant_memberships
       WHERE id = $1`,
      [membershipId]
    );
    return result.rows[0] ?? null;
  }

  async findMembershipForRequesterAction(input: {
    requesterAccountId: string;
    targetMembershipId: string;
  }): Promise<V0MembershipForRequesterActionRow | null> {
    const result = await this.db.query<V0MembershipForRequesterActionRow>(
      `SELECT
         target.id AS target_membership_id,
         target.tenant_id AS target_tenant_id,
         target.account_id AS target_account_id,
         target.role_key AS target_role_key,
         target.status AS target_status,
         requester.id AS requester_membership_id,
         requester.role_key AS requester_role_key
       FROM v0_tenant_memberships target
       JOIN v0_tenant_memberships requester
         ON requester.tenant_id = target.tenant_id
        AND requester.account_id = $1
        AND requester.status = 'ACTIVE'
       WHERE target.id = $2`,
      [input.requesterAccountId, input.targetMembershipId]
    );
    return result.rows[0] ?? null;
  }

  async findActiveBranchesByIds(tenantId: string, branchIds: string[]): Promise<V0BranchRow[]> {
    if (branchIds.length === 0) {
      return [];
    }

    const result = await this.db.query<V0BranchRow>(
      `SELECT id, tenant_id, status
       FROM branches
       WHERE tenant_id = $1
         AND status = 'ACTIVE'
         AND id = ANY($2::uuid[])`,
      [tenantId, branchIds]
    );
    return result.rows;
  }

  async replacePendingBranchAssignments(input: {
    membershipId: string;
    tenantId: string;
    branchIds: string[];
  }): Promise<void> {
    await this.db.query(
      `DELETE FROM v0_membership_pending_branch_assignments
       WHERE tenant_membership_id = $1`,
      [input.membershipId]
    );

    if (input.branchIds.length === 0) {
      return;
    }

    await this.db.query(
      `INSERT INTO v0_membership_pending_branch_assignments (
         tenant_membership_id,
         tenant_id,
         branch_id
       )
       SELECT $1, $2, branch_id
       FROM UNNEST($3::uuid[]) AS branch_id
       ON CONFLICT (tenant_membership_id, branch_id) DO NOTHING`,
      [input.membershipId, input.tenantId, input.branchIds]
    );
  }

  async listPendingBranchIdsForMembership(membershipId: string): Promise<string[]> {
    const result = await this.db.query<{ branch_id: string }>(
      `SELECT branch_id
       FROM v0_membership_pending_branch_assignments
       WHERE tenant_membership_id = $1
       ORDER BY branch_id ASC`,
      [membershipId]
    );
    return result.rows.map((row) => row.branch_id);
  }

  async clearPendingBranchAssignments(membershipId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM v0_membership_pending_branch_assignments
       WHERE tenant_membership_id = $1`,
      [membershipId]
    );
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

  async listActiveBranchIdsForMembership(membershipId: string): Promise<string[]> {
    const result = await this.db.query<{ branch_id: string }>(
      `SELECT branch_id
       FROM v0_branch_assignments
       WHERE membership_id = $1
         AND status = 'ACTIVE'
       ORDER BY branch_id ASC`,
      [membershipId]
    );
    return result.rows.map((row) => row.branch_id);
  }

  async revokeStaffProjectionForMembership(membershipId: string): Promise<void> {
    await this.db.query(
      `UPDATE v0_staff_profiles
       SET status = 'REVOKED',
           updated_at = NOW()
       WHERE membership_id = $1`,
      [membershipId]
    );

    await this.db.query(
      `UPDATE v0_branch_assignments
       SET status = 'REVOKED',
           revoked_at = COALESCE(revoked_at, NOW()),
           updated_at = NOW()
       WHERE membership_id = $1`,
      [membershipId]
    );
  }
}

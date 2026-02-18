import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0MembershipAccountRow = {
  id: string;
  phone: string;
  status: string;
};

export type V0TenantMembershipRow = {
  id: string;
  tenant_id: string;
  account_id: string;
  role_key: string;
  status: "INVITED" | "ACTIVE" | "REVOKED";
  invited_by_membership_id: string | null;
  invited_at: Date;
  accepted_at: Date | null;
  rejected_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type V0InvitationInboxItem = {
  membership_id: string;
  tenant_id: string;
  tenant_name: string;
  role_key: string;
  invited_at: Date;
  invited_by_membership_id: string | null;
};

export type V0MembershipForRequesterActionRow = {
  target_membership_id: string;
  target_tenant_id: string;
  target_account_id: string;
  target_role_key: string;
  target_status: string;
  requester_membership_id: string;
  requester_role_key: string;
};

export class V0MembershipRepository {
  constructor(private readonly db: Queryable) {}

  async findAccountByPhone(phone: string): Promise<V0MembershipAccountRow | null> {
    const result = await this.db.query<V0MembershipAccountRow>(
      `SELECT id, phone, status
       FROM accounts
       WHERE phone = $1`,
      [phone]
    );
    return result.rows[0] ?? null;
  }

  async createInvitedAccount(input: {
    phone: string;
  }): Promise<V0MembershipAccountRow> {
    const result = await this.db.query<V0MembershipAccountRow>(
      `INSERT INTO accounts (phone, status)
       VALUES ($1,'ACTIVE')
       RETURNING id, phone, status`,
      [input.phone]
    );
    return result.rows[0];
  }

  async findActiveMembership(
    accountId: string,
    tenantId: string
  ): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `SELECT *
       FROM v0_tenant_memberships
       WHERE account_id = $1
         AND tenant_id = $2
         AND status = 'ACTIVE'
       LIMIT 1`,
      [accountId, tenantId]
    );
    return result.rows[0] ?? null;
  }

  async findMembershipByTenantAndAccount(
    tenantId: string,
    accountId: string
  ): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `SELECT *
       FROM v0_tenant_memberships
       WHERE tenant_id = $1
         AND account_id = $2
       LIMIT 1`,
      [tenantId, accountId]
    );
    return result.rows[0] ?? null;
  }

  async upsertInvitedMembership(input: {
    tenantId: string;
    accountId: string;
    roleKey: string;
    invitedByMembershipId: string;
  }): Promise<V0TenantMembershipRow> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `INSERT INTO v0_tenant_memberships (
         tenant_id,
         account_id,
         role_key,
         status,
         invited_by_membership_id,
         invited_at
       ) VALUES ($1, $2, $3, 'INVITED', $4, NOW())
       ON CONFLICT (tenant_id, account_id)
       DO UPDATE SET
         role_key = EXCLUDED.role_key,
         status = 'INVITED',
         invited_by_membership_id = EXCLUDED.invited_by_membership_id,
         invited_at = NOW(),
         accepted_at = NULL,
         rejected_at = NULL,
         revoked_at = NULL,
         updated_at = NOW()
       RETURNING *`,
      [
        input.tenantId,
        input.accountId,
        input.roleKey,
        input.invitedByMembershipId,
      ]
    );
    return result.rows[0];
  }

  async listInvitationInbox(accountId: string): Promise<V0InvitationInboxItem[]> {
    const result = await this.db.query<V0InvitationInboxItem>(
      `SELECT
         m.id AS membership_id,
         m.tenant_id,
         t.name AS tenant_name,
         m.role_key,
         m.invited_at,
         m.invited_by_membership_id
       FROM v0_tenant_memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.account_id = $1
         AND m.status = 'INVITED'
       ORDER BY m.invited_at DESC`,
      [accountId]
    );
    return result.rows;
  }

  async findMembershipById(
    membershipId: string
  ): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `SELECT *
       FROM v0_tenant_memberships
       WHERE id = $1`,
      [membershipId]
    );
    return result.rows[0] ?? null;
  }

  async acceptInvitation(input: {
    membershipId: string;
    accountId: string;
  }): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `UPDATE v0_tenant_memberships
       SET
         status = 'ACTIVE',
         accepted_at = NOW(),
         rejected_at = NULL,
         revoked_at = NULL,
         updated_at = NOW()
       WHERE id = $1
         AND account_id = $2
         AND status = 'INVITED'
       RETURNING *`,
      [input.membershipId, input.accountId]
    );
    return result.rows[0] ?? null;
  }

  async rejectInvitation(input: {
    membershipId: string;
    accountId: string;
  }): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `UPDATE v0_tenant_memberships
       SET
         status = 'REVOKED',
         revoked_at = NOW(),
         rejected_at = NULL,
         updated_at = NOW()
       WHERE id = $1
         AND account_id = $2
         AND status = 'INVITED'
       RETURNING *`,
      [input.membershipId, input.accountId]
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
       WHERE requester.account_id = $1
         AND requester.status = 'ACTIVE'
         AND target.id = $2
       LIMIT 1`,
      [input.requesterAccountId, input.targetMembershipId]
    );
    return result.rows[0] ?? null;
  }

  async updateMembershipRole(input: {
    membershipId: string;
    roleKey: string;
  }): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `UPDATE v0_tenant_memberships
       SET
         role_key = $2,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [input.membershipId, input.roleKey]
    );
    return result.rows[0] ?? null;
  }

  async revokeMembership(
    membershipId: string
  ): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `UPDATE v0_tenant_memberships
       SET
         status = 'REVOKED',
         revoked_at = NOW(),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [membershipId]
    );
    return result.rows[0] ?? null;
  }
}

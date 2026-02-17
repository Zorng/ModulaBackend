import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0AccountRow = {
  id: string;
  supabase_user_id: string | null;
  phone: string;
  password_hash: string | null;
  status: string;
  phone_verified_at: Date | null;
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
  date_of_birth: Date | null;
};

export type V0PhoneOtpRow = {
  id: string;
  phone: string;
  purpose: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  created_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
};

export type V0SessionRow = {
  id: string;
  account_id: string;
  refresh_token_hash: string;
  context_tenant_id: string | null;
  context_branch_id: string | null;
  revoked_at: Date | null;
  expires_at: Date;
};

export type V0TenantMembershipRow = {
  id: string;
  tenant_id: string;
  account_id: string;
  role_key: string;
  status: "INVITED" | "ACTIVE" | "REJECTED" | "DISABLED" | "ARCHIVED";
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

export type V0BranchRow = {
  id: string;
  tenant_id: string;
  status: string;
};

export type V0ActiveMembershipTenantRow = {
  membership_id: string;
  tenant_id: string;
  tenant_name: string;
  role_key: string;
};

export type V0EligibleBranchRow = {
  branch_id: string;
  branch_name: string;
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

export class V0AuthRepository {
  constructor(private readonly db: Queryable) {}

  async findAccountByPhone(phone: string): Promise<V0AccountRow | null> {
    const result = await this.db.query<V0AccountRow>(
      `SELECT
         id,
         supabase_user_id,
         phone,
         password_hash,
         status,
         phone_verified_at,
         first_name,
         last_name,
         gender,
         date_of_birth
       FROM accounts
       WHERE phone = $1`,
      [phone]
    );
    return result.rows[0] ?? null;
  }

  async findAccountById(accountId: string): Promise<V0AccountRow | null> {
    const result = await this.db.query<V0AccountRow>(
      `SELECT
         id,
         supabase_user_id,
         phone,
         password_hash,
         status,
         phone_verified_at,
         first_name,
         last_name,
         gender,
         date_of_birth
       FROM accounts
       WHERE id = $1`,
      [accountId]
    );
    return result.rows[0] ?? null;
  }

  async findAccountBySupabaseUserId(supabaseUserId: string): Promise<V0AccountRow | null> {
    const result = await this.db.query<V0AccountRow>(
      `SELECT
         id,
         supabase_user_id,
         phone,
         password_hash,
         status,
         phone_verified_at,
         first_name,
         last_name,
         gender,
         date_of_birth
       FROM accounts
       WHERE supabase_user_id = $1`,
      [supabaseUserId]
    );
    return result.rows[0] ?? null;
  }

  async createAccount(input: {
    supabaseUserId?: string | null;
    phone: string;
    passwordHash?: string | null;
    firstName: string;
    lastName: string;
    gender?: string | null;
    dateOfBirth?: string | null;
  }): Promise<V0AccountRow> {
    const result = await this.db.query<V0AccountRow>(
      `INSERT INTO accounts (
         supabase_user_id,
         phone,
         password_hash,
         status,
         first_name,
         last_name,
         gender,
         date_of_birth
       ) VALUES ($1,$2,$3,'ACTIVE',$4,$5,$6,$7)
       RETURNING
         id,
         supabase_user_id,
         phone,
         password_hash,
         status,
         phone_verified_at,
         first_name,
         last_name,
         gender,
         date_of_birth`,
      [
        input.supabaseUserId ?? null,
        input.phone,
        input.passwordHash ?? null,
        input.firstName,
        input.lastName,
        input.gender ?? null,
        input.dateOfBirth ?? null,
      ]
    );
    return result.rows[0];
  }

  async updateAccountRegistration(input: {
    accountId: string;
    supabaseUserId?: string | null;
    phone?: string | null;
    passwordHash?: string | null;
    firstName: string;
    lastName: string;
    gender?: string | null;
    dateOfBirth?: string | null;
  }): Promise<V0AccountRow> {
    const result = await this.db.query<V0AccountRow>(
      `UPDATE accounts
       SET
         supabase_user_id = COALESCE($2, supabase_user_id),
         phone = COALESCE($3, phone),
         password_hash = COALESCE($4, password_hash),
         first_name = $5,
         last_name = $6,
         gender = $7,
         date_of_birth = $8,
         updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         supabase_user_id,
         phone,
         password_hash,
         status,
         phone_verified_at,
         first_name,
         last_name,
         gender,
         date_of_birth`,
      [
        input.accountId,
        input.supabaseUserId ?? null,
        input.phone ?? null,
        input.passwordHash ?? null,
        input.firstName,
        input.lastName,
        input.gender ?? null,
        input.dateOfBirth ?? null,
      ]
    );
    return result.rows[0];
  }

  async createInvitedAccount(input: {
    phone: string;
  }): Promise<V0AccountRow> {
    const result = await this.db.query<V0AccountRow>(
      `INSERT INTO accounts (phone, status)
       VALUES ($1,'ACTIVE')
       RETURNING
         id,
         supabase_user_id,
         phone,
         password_hash,
         status,
         phone_verified_at,
         first_name,
         last_name,
         gender,
         date_of_birth`,
      [input.phone]
    );
    return result.rows[0];
  }

  async attachSupabaseUserId(input: {
    accountId: string;
    supabaseUserId: string;
  }): Promise<void> {
    await this.db.query(
      `UPDATE accounts
       SET supabase_user_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [input.accountId, input.supabaseUserId]
    );
  }

  async markPhoneVerified(phone: string): Promise<void> {
    await this.db.query(
      `UPDATE accounts
       SET phone_verified_at = COALESCE(phone_verified_at, NOW()),
           updated_at = NOW()
       WHERE phone = $1`,
      [phone]
    );
  }

  async markPhoneVerifiedByAccountId(accountId: string): Promise<void> {
    await this.db.query(
      `UPDATE accounts
       SET phone_verified_at = COALESCE(phone_verified_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [accountId]
    );
  }

  async createPhoneOtp(input: {
    phone: string;
    purpose: string;
    codeHash: string;
    expiresAt: Date;
    maxAttempts: number;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO auth_phone_otps (phone, purpose, code_hash, expires_at, max_attempts)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.phone,
        input.purpose,
        input.codeHash,
        input.expiresAt,
        input.maxAttempts,
      ]
    );
  }

  async findLatestActivePhoneOtp(
    phone: string,
    purpose: string
  ): Promise<V0PhoneOtpRow | null> {
    const result = await this.db.query<V0PhoneOtpRow>(
      `SELECT
         id,
         phone,
         purpose,
         code_hash,
         attempts,
         max_attempts,
         created_at,
         expires_at,
         consumed_at
       FROM auth_phone_otps
       WHERE phone = $1
         AND purpose = $2
         AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone, purpose]
    );
    return result.rows[0] ?? null;
  }

  async findLatestPhoneOtpByPurpose(
    phone: string,
    purpose: string
  ): Promise<V0PhoneOtpRow | null> {
    const result = await this.db.query<V0PhoneOtpRow>(
      `SELECT
         id,
         phone,
         purpose,
         code_hash,
         attempts,
         max_attempts,
         created_at,
         expires_at,
         consumed_at
       FROM auth_phone_otps
       WHERE phone = $1
         AND purpose = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone, purpose]
    );
    return result.rows[0] ?? null;
  }

  async countPhoneOtpsSince(input: {
    phone: string;
    purpose: string;
    since: Date;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM auth_phone_otps
       WHERE phone = $1
         AND purpose = $2
         AND created_at >= $3`,
      [input.phone, input.purpose, input.since]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async incrementPhoneOtpAttempts(id: string): Promise<void> {
    await this.db.query(
      `UPDATE auth_phone_otps
       SET attempts = attempts + 1
       WHERE id = $1`,
      [id]
    );
  }

  async consumePhoneOtp(id: string): Promise<void> {
    await this.db.query(
      `UPDATE auth_phone_otps
       SET consumed_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  async createSession(input: {
    accountId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    contextTenantId?: string | null;
    contextBranchId?: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO v0_auth_sessions (
         account_id,
         refresh_token_hash,
         context_tenant_id,
         context_branch_id,
         expires_at
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        input.accountId,
        input.refreshTokenHash,
        input.contextTenantId ?? null,
        input.contextBranchId ?? null,
        input.expiresAt,
      ]
    );
  }

  async findActiveSessionByRefreshTokenHash(
    refreshTokenHash: string
  ): Promise<V0SessionRow | null> {
    const result = await this.db.query<V0SessionRow>(
      `SELECT
         id,
         account_id,
         refresh_token_hash,
         context_tenant_id,
         context_branch_id,
         revoked_at,
         expires_at
       FROM v0_auth_sessions
       WHERE refresh_token_hash = $1
         AND revoked_at IS NULL
       LIMIT 1`,
      [refreshTokenHash]
    );
    return result.rows[0] ?? null;
  }

  async revokeSessionById(sessionId: string): Promise<void> {
    await this.db.query(
      `UPDATE v0_auth_sessions
       SET revoked_at = NOW()
       WHERE id = $1
         AND revoked_at IS NULL`,
      [sessionId]
    );
  }

  async revokeSessionByRefreshTokenHash(refreshTokenHash: string): Promise<void> {
    await this.db.query(
      `UPDATE v0_auth_sessions
       SET revoked_at = NOW()
       WHERE refresh_token_hash = $1
         AND revoked_at IS NULL`,
      [refreshTokenHash]
    );
  }

  async countActiveMemberships(accountId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_tenant_memberships
       WHERE account_id = $1
         AND status = 'ACTIVE'`,
      [accountId]
    );
    return Number(result.rows[0]?.count ?? "0");
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

  async acceptInvitation(params: {
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
      [params.membershipId, params.accountId]
    );
    return result.rows[0] ?? null;
  }

  async rejectInvitation(params: {
    membershipId: string;
    accountId: string;
  }): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `UPDATE v0_tenant_memberships
       SET
         status = 'REJECTED',
         rejected_at = NOW(),
         updated_at = NOW()
       WHERE id = $1
         AND account_id = $2
         AND status = 'INVITED'
       RETURNING *`,
      [params.membershipId, params.accountId]
    );
    return result.rows[0] ?? null;
  }

  async updateMembershipRole(params: {
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
      [params.membershipId, params.roleKey]
    );
    return result.rows[0] ?? null;
  }

  async revokeMembership(
    membershipId: string
  ): Promise<V0TenantMembershipRow | null> {
    const result = await this.db.query<V0TenantMembershipRow>(
      `UPDATE v0_tenant_memberships
       SET
         status = 'DISABLED',
         revoked_at = NOW(),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [membershipId]
    );
    return result.rows[0] ?? null;
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

  async findActiveBranchesByIds(
    tenantId: string,
    branchIds: string[]
  ): Promise<V0BranchRow[]> {
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

  async listActiveMembershipTenants(
    accountId: string
  ): Promise<V0ActiveMembershipTenantRow[]> {
    const result = await this.db.query<V0ActiveMembershipTenantRow>(
      `SELECT
         m.id AS membership_id,
         m.tenant_id,
         t.name AS tenant_name,
         m.role_key
       FROM v0_tenant_memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.account_id = $1
         AND m.status = 'ACTIVE'
       ORDER BY t.name ASC`,
      [accountId]
    );
    return result.rows;
  }

  async listEligibleBranchesForAccountInTenant(input: {
    accountId: string;
    tenantId: string;
  }): Promise<V0EligibleBranchRow[]> {
    const result = await this.db.query<V0EligibleBranchRow>(
      `SELECT DISTINCT
         b.id AS branch_id,
         b.name AS branch_name
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
         AND b.status = 'ACTIVE'
       ORDER BY b.name ASC`,
      [input.accountId, input.tenantId]
    );
    return result.rows;
  }

  async createAuditEvent(input: {
    accountId?: string | null;
    phone?: string | null;
    eventKey: string;
    outcome: "SUCCESS" | "FAILED";
    reasonCode?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO v0_auth_audit_events (
         account_id,
         phone,
         event_key,
         outcome,
         reason_code,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.accountId ?? null,
        input.phone ?? null,
        input.eventKey,
        input.outcome,
        input.reasonCode ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
  }
}

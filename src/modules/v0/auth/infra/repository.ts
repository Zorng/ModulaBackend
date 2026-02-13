import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0AccountRow = {
  id: string;
  phone: string;
  password_hash: string;
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

export class V0AuthRepository {
  constructor(private readonly db: Queryable) {}

  async findAccountByPhone(phone: string): Promise<V0AccountRow | null> {
    const result = await this.db.query<V0AccountRow>(
      `SELECT
         id,
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

  async createAccount(input: {
    phone: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    gender?: string | null;
    dateOfBirth?: string | null;
  }): Promise<V0AccountRow> {
    const result = await this.db.query<V0AccountRow>(
      `INSERT INTO accounts (
         phone,
         password_hash,
         status,
         first_name,
         last_name,
         gender,
         date_of_birth
       ) VALUES ($1,$2,'ACTIVE',$3,$4,$5,$6)
       RETURNING
         id,
         phone,
         password_hash,
         status,
         phone_verified_at,
         first_name,
         last_name,
         gender,
         date_of_birth`,
      [
        input.phone,
        input.passwordHash,
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
    passwordHash: string;
    firstName: string;
    lastName: string;
    gender?: string | null;
    dateOfBirth?: string | null;
  }): Promise<V0AccountRow> {
    const result = await this.db.query<V0AccountRow>(
      `UPDATE accounts
       SET
         password_hash = $2,
         first_name = $3,
         last_name = $4,
         gender = $5,
         date_of_birth = $6,
         updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
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
        input.passwordHash,
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
    passwordHash: string;
  }): Promise<V0AccountRow> {
    const result = await this.db.query<V0AccountRow>(
      `INSERT INTO accounts (phone, password_hash, status)
       VALUES ($1,$2,'ACTIVE')
       RETURNING
         id,
         phone,
         password_hash,
         status,
         phone_verified_at,
         first_name,
         last_name,
         gender,
         date_of_birth`,
      [input.phone, input.passwordHash]
    );
    return result.rows[0];
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

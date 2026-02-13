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
}

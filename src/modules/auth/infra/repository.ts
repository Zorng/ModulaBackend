import { pool } from '#db'; // Use your existing pool import
import type { Pool, PoolClient } from "pg";
import { 
  Account,
  Employee, 
  EmployeeStatus, 
  EmployeeRole, 
  Tenant, 
  Invite, 
  Session, 
  EmployeeBranchAssignment,
  PhoneOtp,
  PhoneOtpPurpose
} from '../domain/entities.js';

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export class AuthRepository {
  constructor(private db: Queryable = pool) {} // Use your existing pool

  async createAccount(account: Pick<Account, "phone" | "password_hash" | "status"> & Partial<Pick<Account, "phone_verified_at">>): Promise<Account> {
    const result = await this.db.query(
      `INSERT INTO accounts (phone, password_hash, status, phone_verified_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        account.phone,
        account.password_hash,
        account.status,
        account.phone_verified_at ?? null,
      ]
    );
    return this.mapAccount(result.rows[0]);
  }

  async findAccountById(id: string): Promise<Account | null> {
    const result = await this.db.query("SELECT * FROM accounts WHERE id = $1", [
      id,
    ]);
    return result.rows.length ? this.mapAccount(result.rows[0]) : null;
  }

  async findAccountByPhone(phone: string): Promise<Account | null> {
    const result = await this.db.query(
      "SELECT * FROM accounts WHERE phone = $1",
      [phone]
    );
    return result.rows.length ? this.mapAccount(result.rows[0]) : null;
  }

  async updateAccountPassword(accountId: string, passwordHash: string): Promise<Account> {
    const result = await this.db.query(
      "UPDATE accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [passwordHash, accountId]
    );
    if (result.rows.length === 0) {
      throw new Error("Account not found");
    }
    return this.mapAccount(result.rows[0]);
  }

  async createEmployee(employee: Omit<Employee, 'id' | 'created_at' | 'updated_at'>): Promise<Employee> {
    const query = `
      INSERT INTO employees (account_id, tenant_id, phone, email, password_hash, first_name, last_name, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const values = [
      employee.account_id,
      employee.tenant_id,
      employee.phone,
      employee.email,
      employee.password_hash,
      employee.first_name,
      employee.last_name,
      employee.status
    ];
    const result = await this.db.query(query, values);
    return this.mapEmployee(result.rows[0]);
  }

  async findEmployeeById(id: string): Promise<Employee | null> {
    const result = await this.db.query('SELECT * FROM employees WHERE id = $1', [id]);
    return result.rows.length ? this.mapEmployee(result.rows[0]) : null;
  }

  async findEmployeeByPhone(tenantId: string, phone: string): Promise<Employee | null> {
    const result = await this.db.query(
      'SELECT * FROM employees WHERE tenant_id = $1 AND phone = $2', 
      [tenantId, phone]
    );
    return result.rows.length ? this.mapEmployee(result.rows[0]) : null;
  }

  async findEmployeeByPhoneAnyTenant(phone: string): Promise<Employee | null> {
    const result = await this.db.query(
      'SELECT * FROM employees WHERE phone = $1 LIMIT 1', 
      [phone]
    );
    return result.rows.length ? this.mapEmployee(result.rows[0]) : null;
  }

  async findEmployeesByPhoneAnyTenant(phone: string): Promise<Employee[]> {
    const result = await this.db.query('SELECT * FROM employees WHERE phone = $1', [phone]);
    return result.rows.map((row: any) => this.mapEmployee(row));
  }

  async findEmployeesByAccountId(accountId: string): Promise<Employee[]> {
    const result = await this.db.query(
      "SELECT * FROM employees WHERE account_id = $1",
      [accountId]
    );
    return result.rows.map((row: any) => this.mapEmployee(row));
  }

  async findEmployeeByAccountAndTenant(accountId: string, tenantId: string): Promise<Employee | null> {
    const result = await this.db.query(
      "SELECT * FROM employees WHERE account_id = $1 AND tenant_id = $2 LIMIT 1",
      [accountId, tenantId]
    );
    return result.rows.length ? this.mapEmployee(result.rows[0]) : null;
  }

  async listActiveMembershipTenants(accountId: string): Promise<Array<{ employee: Employee; tenant: Pick<Tenant, "id" | "name"> }>> {
    const result = await this.db.query(
      `SELECT
         e.*,
         t.id AS tenant_pk,
         t.name AS tenant_name
       FROM employees e
       JOIN tenants t ON t.id = e.tenant_id
       WHERE e.account_id = $1 AND e.status = 'ACTIVE'
       ORDER BY t.name ASC`,
      [accountId]
    );

    return result.rows.map((row: any) => ({
      employee: this.mapEmployee(row),
      tenant: { id: row.tenant_pk, name: row.tenant_name },
    }));
  }

  async updateEmployeeStatus(employeeId: string, status: EmployeeStatus): Promise<Employee> {
    const result = await this.db.query(
      'UPDATE employees SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, employeeId]
    );
    if (result.rows.length === 0) {
      throw new Error('Employee not found');
    }
    return this.mapEmployee(result.rows[0]);
  }

  async updateEmployeePassword(employeeId: string, passwordHash: string): Promise<Employee> {
    const result = await this.db.query(
      "UPDATE employees SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [passwordHash, employeeId]
    );
    if (result.rows.length === 0) {
      throw new Error("Employee not found");
    }
    return this.mapEmployee(result.rows[0]);
  }

  async touchEmployeeBranchContext(employeeId: string, branchId: string): Promise<Employee> {
    const result = await this.db.query(
      `UPDATE employees
       SET default_branch_id = COALESCE(default_branch_id, $1),
           last_branch_id = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [branchId, employeeId]
    );
    if (result.rows.length === 0) {
      throw new Error("Employee not found");
    }
    return this.mapEmployee(result.rows[0]);
  }

  async createEmployeeBranchAssignment(
    assignment: Omit<EmployeeBranchAssignment, 'id' | 'assigned_at'>
  ): Promise<EmployeeBranchAssignment> {
    const query = `
      INSERT INTO employee_branch_assignments (employee_id, branch_id, role, active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await this.db.query(query, [
      assignment.employee_id,
      assignment.branch_id,
      assignment.role,
      assignment.active
    ]);
    return this.mapEmployeeBranchAssignment(result.rows[0]);
  }

  async findEmployeeBranchAssignments(employeeId: string): Promise<EmployeeBranchAssignment[]> {
    const result = await this.db.query(
      `SELECT eba.*, b.name as branch_name
       FROM employee_branch_assignments eba
       JOIN branches b ON eba.branch_id = b.id
       JOIN employees e ON e.id = eba.employee_id
       WHERE eba.employee_id = $1 AND eba.active = true
         AND b.tenant_id = e.tenant_id
       ORDER BY eba.assigned_at DESC`,
      [employeeId]
    );
    return result.rows.map(row => this.mapEmployeeBranchAssignment(row));
  }

  async findEmployeeBranchAssignment(employeeId: string, branchId: string): Promise<EmployeeBranchAssignment | null> {
    const result = await this.db.query(
      `SELECT eba.*, b.name as branch_name
       FROM employee_branch_assignments eba
       JOIN branches b ON eba.branch_id = b.id
       JOIN employees e ON e.id = eba.employee_id
       WHERE eba.employee_id = $1 AND eba.branch_id = $2 AND eba.active = true
         AND b.tenant_id = e.tenant_id`,
      [employeeId, branchId]
    );
    return result.rows.length ? this.mapEmployeeBranchAssignment(result.rows[0]) : null;
  }

  async updateEmployeeBranchAssignmentRole(employeeId: string, branchId: string, role: EmployeeRole): Promise<EmployeeBranchAssignment> {
    const result = await this.db.query(
      `UPDATE employee_branch_assignments 
       SET role = $1 
       WHERE employee_id = $2 AND branch_id = $3 AND active = true 
       RETURNING *`,
      [role, employeeId, branchId]
    );
    if (result.rows.length === 0) {
      throw new Error('Branch assignment not found');
    }
    return this.mapEmployeeBranchAssignment(result.rows[0]);
  }

  async deactivateAllEmployeeBranchAssignments(employeeId: string): Promise<void> {
    await this.db.query(
      'UPDATE employee_branch_assignments SET active = false WHERE employee_id = $1',
      [employeeId]
    );
  }

  async deactivateEmployeeBranchAssignment(employeeId: string, branchId: string): Promise<void> {
    await this.db.query(
      'UPDATE employee_branch_assignments SET active = false WHERE employee_id = $1 AND branch_id = $2',
      [employeeId, branchId]
    );
  }

  async createInvite(invite: Omit<Invite, 'id' | 'created_at'>): Promise<Invite> {
    const query = `
      INSERT INTO invites (tenant_id, branch_id, role, phone, token_hash, first_name, last_name, note, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      invite.tenant_id,
      invite.branch_id,
      invite.role,
      invite.phone,
      invite.token_hash,
      invite.first_name,
      invite.last_name,
      invite.note,
      invite.expires_at
    ];
    const result = await this.db.query(query, values);
    return this.mapInvite(result.rows[0]);
  }

  async findInviteByToken(tokenHash: string): Promise<Invite | null> {
    const result = await this.db.query('SELECT * FROM invites WHERE token_hash = $1', [tokenHash]);
    return result.rows.length ? this.mapInvite(result.rows[0]) : null;
  }

  async findInviteById(inviteId: string): Promise<Invite | null> {
    const result = await this.db.query('SELECT * FROM invites WHERE id = $1', [inviteId]);
    return result.rows.length ? this.mapInvite(result.rows[0]) : null;
  }

  async acceptInvite(inviteId: string): Promise<Invite> {
    const result = await this.db.query(
      'UPDATE invites SET accepted_at = NOW() WHERE id = $1 RETURNING *',
      [inviteId]
    );
    return this.mapInvite(result.rows[0]);
  }

  async revokeInvite(inviteId: string): Promise<Invite> {
    const result = await this.db.query(
      'UPDATE invites SET revoked_at = NOW() WHERE id = $1 RETURNING *',
      [inviteId]
    );
    return this.mapInvite(result.rows[0]);
  }

  async updateInviteToken(inviteId: string, tokenHash: string, expiresAt: Date): Promise<Invite> {
    const result = await this.db.query(
      'UPDATE invites SET token_hash = $1, expires_at = $2, revoked_at = NULL WHERE id = $3 RETURNING *',
      [tokenHash, expiresAt, inviteId]
    );
    return this.mapInvite(result.rows[0]);
  }

  async createPhoneOtp(input: {
    phone: string;
    purpose: PhoneOtpPurpose;
    code_hash: string;
    expires_at: Date;
    max_attempts: number;
  }): Promise<PhoneOtp> {
    const result = await this.db.query(
      `INSERT INTO auth_phone_otps (phone, purpose, code_hash, expires_at, max_attempts)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.phone,
        input.purpose,
        input.code_hash,
        input.expires_at,
        input.max_attempts,
      ]
    );
    return this.mapPhoneOtp(result.rows[0]);
  }

  async findLatestActivePhoneOtp(phone: string, purpose: PhoneOtpPurpose): Promise<PhoneOtp | null> {
    const result = await this.db.query(
      `SELECT *
       FROM auth_phone_otps
       WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone, purpose]
    );
    return result.rows.length ? this.mapPhoneOtp(result.rows[0]) : null;
  }

  async incrementPhoneOtpAttempts(otpId: string): Promise<PhoneOtp> {
    const result = await this.db.query(
      `UPDATE auth_phone_otps
       SET attempts = attempts + 1,
           consumed_at = CASE WHEN (attempts + 1) >= max_attempts THEN NOW() ELSE consumed_at END
       WHERE id = $1
       RETURNING *`,
      [otpId]
    );
    if (result.rows.length === 0) {
      throw new Error("OTP not found");
    }
    return this.mapPhoneOtp(result.rows[0]);
  }

  async consumePhoneOtp(otpId: string): Promise<PhoneOtp> {
    const result = await this.db.query(
      `UPDATE auth_phone_otps
       SET consumed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [otpId]
    );
    if (result.rows.length === 0) {
      throw new Error("OTP not found");
    }
    return this.mapPhoneOtp(result.rows[0]);
  }

  async createSession(session: Omit<Session, 'id' | 'created_at'>): Promise<Session> {
    const query = `
      INSERT INTO sessions (employee_id, refresh_token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await this.db.query(query, [
      session.employee_id,
      session.refresh_token_hash,
      session.expires_at
    ]);
    return this.mapSession(result.rows[0]);
  }

  async findSessionByRefreshToken(refreshTokenHash: string): Promise<Session | null> {
    const result = await this.db.query(
      'SELECT * FROM sessions WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()',
      [refreshTokenHash]
    );
    return result.rows.length ? this.mapSession(result.rows[0]) : null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1', [sessionId]);
  }

  async revokeAllSessionsForEmployee(employeeId: string): Promise<void> {
    await this.db.query(
      "UPDATE sessions SET revoked_at = NOW() WHERE employee_id = $1 AND revoked_at IS NULL",
      [employeeId]
    );
  }

  // Mappers (keep the same as before)
  private mapAccount(row: any): Account {
    return {
      id: row.id,
      phone: row.phone,
      password_hash: row.password_hash,
      status: row.status,
      phone_verified_at: row.phone_verified_at ? new Date(row.phone_verified_at) : undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapEmployee(row: any): Employee {
    return {
      id: row.id,
      account_id: row.account_id,
      tenant_id: row.tenant_id,
      phone: row.phone,
      email: row.email,
      password_hash: row.password_hash,
      default_branch_id: row.default_branch_id ?? undefined,
      last_branch_id: row.last_branch_id ?? undefined,
      first_name: row.first_name,
      last_name: row.last_name,
      status: row.status,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }

  private mapEmployeeBranchAssignment(row: any): EmployeeBranchAssignment {
    return {
      id: row.id,
      employee_id: row.employee_id,
      branch_id: row.branch_id,
      role: row.role,
      active: row.active,
      assigned_at: new Date(row.assigned_at),
      branch_name: row.branch_name
    };
  }

  private mapInvite(row: any): Invite {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      role: row.role,
      phone: row.phone,
      token_hash: row.token_hash,
      first_name: row.first_name,
      last_name: row.last_name,
      note: row.note,
      expires_at: new Date(row.expires_at),
      accepted_at: row.accepted_at ? new Date(row.accepted_at) : undefined,
      revoked_at: row.revoked_at ? new Date(row.revoked_at) : undefined,
      created_at: new Date(row.created_at)
    };
  }

  private mapSession(row: any): Session {
    return {
      id: row.id,
      employee_id: row.employee_id,
      refresh_token_hash: row.refresh_token_hash,
      created_at: new Date(row.created_at),
      revoked_at: row.revoked_at ? new Date(row.revoked_at) : undefined,
      expires_at: new Date(row.expires_at)
    };
  }

  private mapPhoneOtp(row: any): PhoneOtp {
    return {
      id: row.id,
      phone: row.phone,
      purpose: row.purpose,
      code_hash: row.code_hash,
      attempts: row.attempts,
      max_attempts: row.max_attempts,
      created_at: new Date(row.created_at),
      expires_at: new Date(row.expires_at),
      consumed_at: row.consumed_at ? new Date(row.consumed_at) : undefined,
    };
  }
}

import { pool } from '#db'; // Use your existing pool import
import { 
  Employee, 
  EmployeeStatus, 
  EmployeeRole, 
  Tenant, 
  Branch, 
  Invite, 
  Session, 
  ActivityLog, 
  EmployeeBranchAssignment 
} from '../domain/entities.js';

export class AuthRepository {
  constructor(private db = pool) {} // Use your existing pool

  async createTenant(tenant: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>): Promise<Tenant> {
    const query = `
      INSERT INTO tenants (name, business_type, status)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await this.db.query(query, [tenant.name, tenant.business_type, tenant.status || 'ACTIVE']);
    return this.mapTenant(result.rows[0]);
  }

  async findTenantById(id: string): Promise<Tenant | null> {
    const result = await this.db.query('SELECT * FROM tenants WHERE id = $1', [id]);
    return result.rows.length ? this.mapTenant(result.rows[0]) : null;
  }

  async createBranch(branch: Omit<Branch, 'id' | 'created_at' | 'updated_at'>): Promise<Branch> {
    const query = `
      INSERT INTO branches (tenant_id, name, address)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await this.db.query(query, [branch.tenant_id, branch.name, branch.address]);
    return this.mapBranch(result.rows[0]);
  }

  async findBranchById(id: string): Promise<Branch | null> {
    const result = await this.db.query('SELECT * FROM branches WHERE id = $1', [id]);
    return result.rows.length ? this.mapBranch(result.rows[0]) : null;
  }

  async createEmployee(employee: Omit<Employee, 'id' | 'created_at' | 'updated_at'>): Promise<Employee> {
    const query = `
      INSERT INTO employees (tenant_id, phone, email, password_hash, first_name, last_name, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
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
       WHERE eba.employee_id = $1 AND eba.active = true
       ORDER BY eba.assigned_at DESC`,
      [employeeId]
    );
    return result.rows.map(row => this.mapEmployeeBranchAssignment(row));
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

  async createActivityLog(activity: Omit<ActivityLog, 'id' | 'created_at'>): Promise<ActivityLog> {
    const query = `
      INSERT INTO activity_log (tenant_id, branch_id, employee_id, action_type, resource_type, resource_id, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      activity.tenant_id,
      activity.branch_id,
      activity.employee_id,
      activity.action_type,
      activity.resource_type,
      activity.resource_id,
      activity.details ? JSON.stringify(activity.details) : null,
      activity.ip_address,
      activity.user_agent
    ];
    const result = await this.db.query(query, values);
    return this.mapActivityLog(result.rows[0]);
  }

  // Mappers (keep the same as before)
  private mapTenant(row: any): Tenant {
    return {
      id: row.id,
      name: row.name,
      business_type: row.business_type,
      status: row.status,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }

  private mapBranch(row: any): Branch {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      address: row.address,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    };
  }

  private mapEmployee(row: any): Employee {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      phone: row.phone,
      email: row.email,
      password_hash: row.password_hash,
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

  private mapActivityLog(row: any): ActivityLog {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      employee_id: row.employee_id,
      action_type: row.action_type,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      details: row.details,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      created_at: new Date(row.created_at)
    };
  }
}
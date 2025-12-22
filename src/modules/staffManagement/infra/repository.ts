import { pool } from "#db";
import type { Pool } from "pg";
import type {
  ActivityLog,
  Branch,
  Employee,
  EmployeeBranchAssignment,
  EmployeeRole,
  EmployeeStatus,
  Invite,
} from "../domain/entities.js";

export class StaffManagementRepository {
  constructor(private db: Pool = pool) {}

  async getStaffSeatLimits(
    tenantId: string
  ): Promise<{ maxStaffSeatsSoft: number; maxStaffSeatsHard: number } | null> {
    const result = await this.db.query(
      `SELECT max_staff_seats_soft, max_staff_seats_hard
       FROM tenant_limits
       WHERE tenant_id = $1`,
      [tenantId]
    );
    if (result.rows.length === 0) return null;
    return {
      maxStaffSeatsSoft: Number(result.rows[0].max_staff_seats_soft),
      maxStaffSeatsHard: Number(result.rows[0].max_staff_seats_hard),
    };
  }

  async countEmployeesByStatus(
    tenantId: string,
    statuses: EmployeeStatus[]
  ): Promise<number> {
    if (statuses.length === 0) return 0;
    const result = await this.db.query(
      `SELECT COUNT(*)::INT AS count
       FROM employees
       WHERE tenant_id = $1
         AND status = ANY($2::TEXT[])`,
      [tenantId, statuses]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async countPendingInvites(tenantId: string): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*)::INT AS count
       FROM invites
       WHERE tenant_id = $1
         AND accepted_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > NOW()`,
      [tenantId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async findBranchById(id: string): Promise<Branch | null> {
    const result = await this.db.query("SELECT * FROM branches WHERE id = $1", [
      id,
    ]);
    return result.rows.length ? this.mapBranch(result.rows[0]) : null;
  }

  async findEmployeeById(id: string): Promise<Employee | null> {
    const result = await this.db.query("SELECT * FROM employees WHERE id = $1", [
      id,
    ]);
    return result.rows.length ? this.mapEmployee(result.rows[0]) : null;
  }

  async findEmployeeByPhone(
    tenantId: string,
    phone: string
  ): Promise<Employee | null> {
    const result = await this.db.query(
      "SELECT * FROM employees WHERE tenant_id = $1 AND phone = $2",
      [tenantId, phone]
    );
    return result.rows.length ? this.mapEmployee(result.rows[0]) : null;
  }

  async createEmployee(input: {
    account_id: string;
    tenant_id: string;
    phone: string;
    email?: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    status: EmployeeStatus;
  }): Promise<Employee> {
    const result = await this.db.query(
      `INSERT INTO employees (account_id, tenant_id, phone, email, password_hash, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.account_id,
        input.tenant_id,
        input.phone,
        input.email ?? null,
        input.password_hash,
        input.first_name,
        input.last_name,
        input.status,
      ]
    );
    return this.mapEmployee(result.rows[0]);
  }

  async updateEmployeeStatus(
    employeeId: string,
    status: EmployeeStatus
  ): Promise<Employee> {
    const result = await this.db.query(
      "UPDATE employees SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, employeeId]
    );
    if (result.rows.length === 0) {
      throw new Error("Employee not found");
    }
    return this.mapEmployee(result.rows[0]);
  }

  async createEmployeeBranchAssignment(input: {
    employee_id: string;
    branch_id: string;
    role: EmployeeRole;
    active: boolean;
  }): Promise<EmployeeBranchAssignment> {
    const result = await this.db.query(
      `INSERT INTO employee_branch_assignments (employee_id, branch_id, role, active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.employee_id, input.branch_id, input.role, input.active]
    );
    return this.mapEmployeeBranchAssignment(result.rows[0]);
  }

  async findEmployeeBranchAssignment(
    employeeId: string,
    branchId: string
  ): Promise<EmployeeBranchAssignment | null> {
    const result = await this.db.query(
      `SELECT eba.*, b.name as branch_name
       FROM employee_branch_assignments eba
       JOIN branches b ON eba.branch_id = b.id
       WHERE eba.employee_id = $1 AND eba.branch_id = $2 AND eba.active = true`,
      [employeeId, branchId]
    );
    return result.rows.length ? this.mapEmployeeBranchAssignment(result.rows[0]) : null;
  }

  async updateEmployeeBranchAssignmentRole(
    employeeId: string,
    branchId: string,
    role: EmployeeRole
  ): Promise<EmployeeBranchAssignment> {
    const result = await this.db.query(
      `UPDATE employee_branch_assignments
       SET role = $1
       WHERE employee_id = $2 AND branch_id = $3 AND active = true
       RETURNING *`,
      [role, employeeId, branchId]
    );
    if (result.rows.length === 0) {
      throw new Error("Branch assignment not found");
    }
    return this.mapEmployeeBranchAssignment(result.rows[0]);
  }

  async deactivateAllEmployeeBranchAssignments(employeeId: string): Promise<void> {
    await this.db.query(
      "UPDATE employee_branch_assignments SET active = false WHERE employee_id = $1",
      [employeeId]
    );
  }

  async activateAllEmployeeBranchAssignments(employeeId: string): Promise<void> {
    await this.db.query(
      "UPDATE employee_branch_assignments SET active = true WHERE employee_id = $1",
      [employeeId]
    );
  }

  async createInvite(input: {
    tenant_id: string;
    branch_id: string;
    role: EmployeeRole;
    phone: string;
    token_hash: string;
    first_name: string;
    last_name: string;
    note?: string;
    expires_at: Date;
  }): Promise<Invite> {
    const result = await this.db.query(
      `INSERT INTO invites (tenant_id, branch_id, role, phone, token_hash, first_name, last_name, note, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.tenant_id,
        input.branch_id,
        input.role,
        input.phone,
        input.token_hash,
        input.first_name,
        input.last_name,
        input.note ?? null,
        input.expires_at,
      ]
    );
    return this.mapInvite(result.rows[0]);
  }

  async findInviteById(inviteId: string): Promise<Invite | null> {
    const result = await this.db.query("SELECT * FROM invites WHERE id = $1", [
      inviteId,
    ]);
    return result.rows.length ? this.mapInvite(result.rows[0]) : null;
  }

  async findInviteByTokenHash(tokenHash: string): Promise<Invite | null> {
    const result = await this.db.query(
      "SELECT * FROM invites WHERE token_hash = $1",
      [tokenHash]
    );
    return result.rows.length ? this.mapInvite(result.rows[0]) : null;
  }

  async acceptInvite(inviteId: string): Promise<Invite> {
    const result = await this.db.query(
      "UPDATE invites SET accepted_at = NOW() WHERE id = $1 RETURNING *",
      [inviteId]
    );
    return this.mapInvite(result.rows[0]);
  }

  async revokeInvite(inviteId: string): Promise<Invite> {
    const result = await this.db.query(
      "UPDATE invites SET revoked_at = NOW() WHERE id = $1 RETURNING *",
      [inviteId]
    );
    return this.mapInvite(result.rows[0]);
  }

  async updateInviteToken(
    inviteId: string,
    tokenHash: string,
    expiresAt: Date
  ): Promise<Invite> {
    const result = await this.db.query(
      "UPDATE invites SET token_hash = $1, expires_at = $2, revoked_at = NULL WHERE id = $3 RETURNING *",
      [tokenHash, expiresAt, inviteId]
    );
    return this.mapInvite(result.rows[0]);
  }

  async createActivityLog(
    activity: Omit<ActivityLog, "id" | "created_at">
  ): Promise<ActivityLog> {
    const result = await this.db.query(
      `INSERT INTO activity_log (tenant_id, branch_id, employee_id, action_type, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        activity.tenant_id,
        activity.branch_id ?? null,
        activity.employee_id ?? null,
        activity.action_type,
        activity.resource_type ?? null,
        activity.resource_id ?? null,
        activity.details ? JSON.stringify(activity.details) : null,
        activity.ip_address ?? null,
        activity.user_agent ?? null,
      ]
    );
    return this.mapActivityLog(result.rows[0]);
  }

  private mapBranch(row: any): Branch {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      address: row.address ?? null,
      contact_phone: row.contact_phone ?? null,
      contact_email: row.contact_email ?? null,
      status: row.status,
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
      updated_at: new Date(row.updated_at),
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
      branch_name: row.branch_name,
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
      created_at: new Date(row.created_at),
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
      created_at: new Date(row.created_at),
    };
  }
}

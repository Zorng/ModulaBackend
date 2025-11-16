import { 
  Employee, 
  EmployeeRole, 
  EmployeeStatus, 
  Tenant, 
  Branch, 
  Invite, 
  AuthTokens,
  LoginCredentials,
  RegisterTenantRequest,
  CreateInviteRequest,
  AcceptInviteRequest,
  AuthActionType,
  EmployeeBranchAssignment
} from '../domain/entities.js';
import { AuthRepository } from '../infra/repository.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import * as crypto from 'crypto';

export class AuthService {
  constructor(
    private authRepo: AuthRepository,
    private tokenService: TokenService,
    private defaultInviteExpiryHours: number = 72
  ) {}

  async registerTenant(request: RegisterTenantRequest): Promise<{ tenant: Tenant; employee: Employee; tokens: AuthTokens }> {
    // Create tenant
    const tenant = await this.authRepo.createTenant({
      name: request.business_name,
      business_type: request.business_type,
      status: 'ACTIVE'
    });

    // Create first branch
    const branch = await this.authRepo.createBranch({
      tenant_id: tenant.id,
      name: 'Main Branch',
      address: 'Primary business location'
    });

    // Hash password
    const passwordHash = await PasswordService.hashPassword(request.password);

    // Create admin employee
    const employee = await this.authRepo.createEmployee({
      tenant_id: tenant.id,
      phone: request.phone,
      first_name: request.first_name,
      last_name: request.last_name,
      password_hash: passwordHash,
      status: 'ACTIVE'
    });

    // Create admin assignment
    await this.authRepo.createEmployeeBranchAssignment({
      employee_id: employee.id,
      branch_id: branch.id,
      role: 'ADMIN',
      active: true
    });

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: tenant.id,
      branch_id: branch.id,
      employee_id: employee.id,
      action_type: 'AUTH_INVITE_ACCEPTED',
      resource_type: 'TENANT',
      resource_id: tenant.id,
      details: { business_name: request.business_name }
    });

    // Generate tokens
    const tokens = await this.generateEmployeeTokens(employee, branch.id, 'ADMIN');

    return { tenant, employee, tokens };
  }

  async login(credentials: LoginCredentials): Promise<{ employee: Employee; tokens: AuthTokens; branchAssignments: any[] }> {
    // Find employee by phone across all tenants
    const employee = await this.authRepo.findEmployeeByPhoneAnyTenant(credentials.phone);
    
    if (!employee || employee.status !== 'ACTIVE') {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await PasswordService.verifyPassword(credentials.password, employee.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    const branchAssignments = await this.authRepo.findEmployeeBranchAssignments(employee.id);
    if (branchAssignments.length === 0) {
      throw new Error('No branch assignments found');
    }

    // Use the first active branch assignment
    const primaryAssignment = branchAssignments[0];
    const tokens = await this.generateEmployeeTokens(employee, primaryAssignment.branch_id, primaryAssignment.role);

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: employee.tenant_id,
      branch_id: primaryAssignment.branch_id,
      employee_id: employee.id,
      action_type: 'AUTH_INVITE_ACCEPTED', // Reusing for login
      resource_type: 'EMPLOYEE',
      resource_id: employee.id
    });

    return { employee, tokens, branchAssignments };
  }

  async createInvite(tenantId: string, adminEmployeeId: string, request: CreateInviteRequest): Promise<Invite> {
    const branch = await this.authRepo.findBranchById(request.branch_id);
    if (!branch || branch.tenant_id !== tenantId) {
      throw new Error('Invalid branch');
    }

    // Check for duplicate invites
    const existingEmployee = await this.authRepo.findEmployeeByPhone(tenantId, request.phone);
    if (existingEmployee) {
      throw new Error('Employee already exists with this phone');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (request.expires_in_hours || this.defaultInviteExpiryHours));

    const invite = await this.authRepo.createInvite({
      tenant_id: tenantId,
      branch_id: request.branch_id,
      role: request.role,
      phone: request.phone,
      token_hash: tokenHash,
      first_name: request.first_name,
      last_name: request.last_name,
      note: request.note,
      expires_at: expiresAt
    });

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: tenantId,
      branch_id: request.branch_id,
      employee_id: adminEmployeeId,
      action_type: 'AUTH_INVITE_CREATED',
      resource_type: 'INVITE',
      resource_id: invite.id,
      details: { role: request.role, phone: request.phone }
    });

    return { ...invite, token_hash: token }; // Return actual token for sending
  }

  async acceptInvite(token: string, request: AcceptInviteRequest): Promise<{ employee: Employee; tokens: AuthTokens }> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invite = await this.authRepo.findInviteByToken(tokenHash);

    if (!invite) {
      throw new Error('Invalid invite token');
    }

    if (invite.expires_at < new Date()) {
      throw new Error('Invite has expired');
    }

    if (invite.revoked_at) {
      throw new Error('Invite has been revoked');
    }

    if (invite.accepted_at) {
      throw new Error('Invite has already been accepted');
    }

    // Validate password
    if (!PasswordService.validatePasswordStrength(request.password)) {
      throw new Error('Password does not meet strength requirements');
    }

    const passwordHash = await PasswordService.hashPassword(request.password);

    // Create employee
    const employee = await this.authRepo.createEmployee({
      tenant_id: invite.tenant_id,
      phone: invite.phone,
      first_name: invite.first_name,
      last_name: invite.last_name,
      password_hash: passwordHash,
      status: 'ACTIVE'
    });

    // Create branch assignment
    await this.authRepo.createEmployeeBranchAssignment({
      employee_id: employee.id,
      branch_id: invite.branch_id,
      role: invite.role,
      active: true
    });

    // Mark invite as accepted
    await this.authRepo.acceptInvite(invite.id);

    // Generate tokens
    const tokens = await this.generateEmployeeTokens(employee, invite.branch_id, invite.role);

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: invite.tenant_id,
      branch_id: invite.branch_id,
      employee_id: employee.id,
      action_type: 'AUTH_INVITE_ACCEPTED',
      resource_type: 'INVITE',
      resource_id: invite.id
    });

    return { employee, tokens };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.authRepo.findSessionByRefreshToken(refreshTokenHash);

    if (!session) {
      throw new Error('Invalid refresh token');
    }

    const employee = await this.authRepo.findEmployeeById(session.employee_id);
    if (!employee || employee.status !== 'ACTIVE') {
      throw new Error('Employee not found or inactive');
    }

    const branchAssignments = await this.authRepo.findEmployeeBranchAssignments(employee.id);
    if (branchAssignments.length === 0) {
      throw new Error('No active branch assignments');
    }

    const primaryAssignment = branchAssignments[0];
    return this.generateEmployeeTokens(employee, primaryAssignment.branch_id, primaryAssignment.role);
  }

  async logout(refreshToken: string): Promise<void> {
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.authRepo.findSessionByRefreshToken(refreshTokenHash);
    
    if (session) {
      await this.authRepo.revokeSession(session.id);
    }
  }

  async revokeInvite(tenantId: string, inviteId: string, adminEmployeeId: string): Promise<Invite> {
    const invite = await this.authRepo.revokeInvite(inviteId);

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: tenantId,
      employee_id: adminEmployeeId,
      action_type: 'AUTH_INVITE_REVOKED',
      resource_type: 'INVITE',
      resource_id: invite.id
    });

    return invite;
  }

  async resendInvite(tenantId: string, inviteId: string, adminEmployeeId: string): Promise<Invite> {
    // Find existing invite
    const existingInvite = await this.authRepo.findInviteById(inviteId);
    
    if (!existingInvite) {
      throw new Error('Invite not found');
    }

    if (existingInvite.tenant_id !== tenantId) {
      throw new Error('Unauthorized: Invite belongs to different tenant');
    }

    if (existingInvite.accepted_at) {
      throw new Error('Invite has already been accepted');
    }

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.defaultInviteExpiryHours);

    // Update invite with new token and expiry
    const updatedInvite = await this.authRepo.updateInviteToken(inviteId, tokenHash, expiresAt);

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: tenantId,
      employee_id: adminEmployeeId,
      action_type: 'AUTH_INVITE_REISSUED',
      resource_type: 'INVITE',
      resource_id: inviteId,
      details: { phone: existingInvite.phone }
    });

    return { ...updatedInvite, token_hash: token }; // Return actual token for sending
  }

  async assignBranch(tenantId: string, employeeId: string, branchId: string, role: EmployeeRole, adminEmployeeId: string): Promise<EmployeeBranchAssignment> {
    // Verify employee belongs to tenant
    const employee = await this.authRepo.findEmployeeById(employeeId);
    if (!employee || employee.tenant_id !== tenantId) {
      throw new Error('Employee not found or does not belong to tenant');
    }

    // Verify branch belongs to tenant
    const branch = await this.authRepo.findBranchById(branchId);
    if (!branch || branch.tenant_id !== tenantId) {
      throw new Error('Branch not found or does not belong to tenant');
    }

    // Check if assignment already exists
    const existingAssignment = await this.authRepo.findEmployeeBranchAssignment(employeeId, branchId);
    if (existingAssignment) {
      throw new Error('Employee is already assigned to this branch');
    }

    // Create new branch assignment
    const assignment = await this.authRepo.createEmployeeBranchAssignment({
      employee_id: employeeId,
      branch_id: branchId,
      role,
      active: true
    });

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: tenantId,
      branch_id: branchId,
      employee_id: adminEmployeeId,
      action_type: 'AUTH_BRANCH_TRANSFERRED',
      resource_type: 'EMPLOYEE',
      resource_id: employeeId,
      details: { branch_id: branchId, role }
    });

    return assignment;
  }

  async updateRole(tenantId: string, employeeId: string, branchId: string, newRole: EmployeeRole, adminEmployeeId: string): Promise<EmployeeBranchAssignment> {
    // Verify employee belongs to tenant
    const employee = await this.authRepo.findEmployeeById(employeeId);
    if (!employee || employee.tenant_id !== tenantId) {
      throw new Error('Employee not found or does not belong to tenant');
    }

    // Verify branch belongs to tenant
    const branch = await this.authRepo.findBranchById(branchId);
    if (!branch || branch.tenant_id !== tenantId) {
      throw new Error('Branch not found or does not belong to tenant');
    }

    // Update the role
    const updatedAssignment = await this.authRepo.updateEmployeeBranchAssignmentRole(employeeId, branchId, newRole);

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: tenantId,
      branch_id: branchId,
      employee_id: adminEmployeeId,
      action_type: 'AUTH_ROLE_CHANGED',
      resource_type: 'EMPLOYEE',
      resource_id: employeeId,
      details: { new_role: newRole, branch_id: branchId }
    });

    return updatedAssignment;
  }

  async disableEmployee(tenantId: string, employeeId: string, adminEmployeeId: string): Promise<Employee> {
    // Verify employee belongs to tenant
    const employee = await this.authRepo.findEmployeeById(employeeId);
    if (!employee || employee.tenant_id !== tenantId) {
      throw new Error('Employee not found or does not belong to tenant');
    }

    if (employee.status === 'DISABLED') {
      throw new Error('Employee is already disabled');
    }

    // Prevent self-disabling
    if (employeeId === adminEmployeeId) {
      throw new Error('Cannot disable your own account');
    }

    // Update employee status
    const updatedEmployee = await this.authRepo.updateEmployeeStatus(employeeId, 'DISABLED');

    // Deactivate all branch assignments
    await this.authRepo.deactivateAllEmployeeBranchAssignments(employeeId);

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: tenantId,
      employee_id: adminEmployeeId,
      action_type: 'AUTH_EMPLOYEE_DISABLED',
      resource_type: 'EMPLOYEE',
      resource_id: employeeId
    });

    return updatedEmployee;
  }

  private async generateEmployeeTokens(employee: Employee, branchId: string, role: EmployeeRole): Promise<AuthTokens> {
    const accessToken = this.tokenService.generateAccessToken({
      employeeId: employee.id,
      tenantId: employee.tenant_id,
      branchId,
      role
    });

    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenExpiry = this.tokenService.calculateRefreshTokenExpiry();
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Create session
    await this.authRepo.createSession({
        employee_id: employee.id,
        refresh_token_hash: refreshTokenHash,
        expires_at: refreshTokenExpiry
        });

        return {
        accessToken,
        refreshToken,
        expiresIn: 12 * 60 * 60 // 12 hours in seconds
        };
    }
}
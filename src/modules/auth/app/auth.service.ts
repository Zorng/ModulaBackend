import { 
  Account,
  Employee, 
  EmployeeRole, 
  Tenant, 
  AuthTokens,
  LoginCredentials,
  RegisterTenantRequest,
  AcceptInviteRequest,
  EmployeeBranchAssignment
} from '../domain/entities.js';
import { AuthRepository } from '../infra/repository.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import type { InvitationPort } from '../../../shared/ports/staff-management.js';
import type { TenantProvisioningPort } from "../../../shared/ports/tenant.js";
import type { AuditWriterPort } from "../../../shared/ports/audit.js";
import * as crypto from 'crypto';

type LoginResult =
  | {
      kind: "single";
      employee: Employee;
      tokens: AuthTokens;
      branchAssignments: EmployeeBranchAssignment[];
    }
  | {
      kind: "tenant_selection_required";
      selectionToken: string;
      memberships: Array<{
        tenant: { id: string; name: string };
        employeeId: string;
      }>;
    };

export class AuthService {
  constructor(
    private authRepo: AuthRepository,
    private tokenService: TokenService,
    private invitationPort: InvitationPort,
    private tenantProvisioningPort: TenantProvisioningPort,
    private auditWriter: AuditWriterPort
  ) {}

  private readonly otpExpiryMinutes = 10;
  private readonly otpMaxAttempts = 5;
  private readonly otpCodeLength = 6;
  private readonly tenantSelectionTokenExpiry = "10m";

  private generateOtpCode(): string {
    const max = 10 ** this.otpCodeLength;
    const value = crypto.randomInt(0, max);
    return String(value).padStart(this.otpCodeLength, "0");
  }

  private hashOtp(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  private shouldExposeOtpForDebug(): boolean {
    return process.env.NODE_ENV !== "production";
  }

  private resolveBranchAssignment(params: {
    employee: Employee;
    branchAssignments: EmployeeBranchAssignment[];
    requestedBranchId?: string;
  }): EmployeeBranchAssignment {
    if (params.requestedBranchId) {
      const match =
        params.branchAssignments.find(
          (a) => a.branch_id === params.requestedBranchId
        ) ?? null;
      if (!match) {
        throw new Error("Branch assignment not found");
      }
      return match;
    }

    const preferredBranchId =
      params.employee.last_branch_id ?? params.employee.default_branch_id;
    if (preferredBranchId) {
      const match =
        params.branchAssignments.find((a) => a.branch_id === preferredBranchId) ??
        null;
      if (match) {
        return match;
      }
    }

    return params.branchAssignments[0];
  }

  private async getOrCreateAccountForPhone(params: {
    phone: string;
    password: string;
  }): Promise<{ account: Account; passwordHash: string }> {
    const existing = await this.authRepo.findAccountByPhone(params.phone);
    if (existing) {
      const ok = await PasswordService.verifyPassword(
        params.password,
        existing.password_hash
      );
      if (!ok) {
        throw new Error("Invalid credentials");
      }
      return { account: existing, passwordHash: existing.password_hash };
    }

    const passwordHash = await PasswordService.hashPassword(params.password);
    const account = await this.authRepo.createAccount({
      phone: params.phone,
      password_hash: passwordHash,
      status: "ACTIVE",
    });
    return { account, passwordHash };
  }

  async registerTenant(request: RegisterTenantRequest): Promise<{ tenant: Tenant; employee: Employee; tokens: AuthTokens }> {
    const { account, passwordHash } = await this.getOrCreateAccountForPhone({
      phone: request.phone,
      password: request.password,
    });

    const provisioned = await this.tenantProvisioningPort.provisionTenant({
      name: request.business_name,
      business_type: request.business_type,
      accountId: account.id,
      phone: request.phone,
      firstName: request.first_name,
      lastName: request.last_name,
      passwordHash,
    });

    const tokens = await this.generateEmployeeTokens(
      provisioned.employee,
      provisioned.branch.id,
      provisioned.role
    );

    return { tenant: provisioned.tenant, employee: provisioned.employee, tokens };
  }

  async requestRegisterTenantOtp(phone: string): Promise<{ message: string; debugOtp?: string }> {
    const otp = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000);

    await this.authRepo.createPhoneOtp({
      phone,
      purpose: "REGISTER_TENANT",
      code_hash: this.hashOtp(otp),
      expires_at: expiresAt,
      max_attempts: this.otpMaxAttempts,
    });

    // Dev/test delivery: log OTP. Replace with SMS provider adapter later.
    // Avoid exposing OTP in production responses.
    // eslint-disable-next-line no-console
    console.log(`[OTP][REGISTER_TENANT] ${phone}: ${otp}`);

    return {
      message: "OTP sent",
      ...(this.shouldExposeOtpForDebug() ? { debugOtp: otp } : {}),
    };
  }

  private async tryWriteLoginFailedAudit(accountId: string): Promise<void> {
    try {
      const memberships = await this.authRepo.listActiveMembershipTenants(accountId);
      for (const m of memberships) {
        await this.auditWriter.write({
          tenantId: m.tenant.id,
          employeeId: m.employee.id,
          actionType: "LOGIN_FAILED",
          resourceType: "EMPLOYEE",
          resourceId: m.employee.id,
          outcome: "FAILED",
          details: { reason: "INVALID_CREDENTIALS" },
        });
      }
    } catch {
      // Best-effort: do not block auth flow if audit write fails.
    }
  }

  async login(credentials: LoginCredentials): Promise<LoginResult> {
    const account = await this.authRepo.findAccountByPhone(credentials.phone);
    if (!account || account.status !== "ACTIVE") {
      throw new Error("Invalid credentials");
    }

    const isValidPassword = await PasswordService.verifyPassword(
      credentials.password,
      account.password_hash
    );
    if (!isValidPassword) {
      await this.tryWriteLoginFailedAudit(account.id);
      throw new Error("Invalid credentials");
    }

    const memberships = await this.authRepo.listActiveMembershipTenants(
      account.id
    );
    if (memberships.length === 0) {
      throw new Error("No memberships found");
    }

    if (memberships.length > 1) {
      return {
        kind: "tenant_selection_required",
        selectionToken: this.tokenService.generateTenantSelectionToken(
          account.id,
          this.tenantSelectionTokenExpiry
        ),
        memberships: memberships.map((m) => ({
          tenant: m.tenant,
          employeeId: m.employee.id,
        })),
      };
    }

    const employee = memberships[0].employee;
    const branchAssignments = await this.authRepo.findEmployeeBranchAssignments(
      employee.id
    );
    if (branchAssignments.length === 0) {
      throw new Error("No branch assignments found");
    }

    const primaryAssignment = this.resolveBranchAssignment({
      employee,
      branchAssignments,
    });
    const tokens = await this.generateEmployeeTokens(
      employee,
      primaryAssignment.branch_id,
      primaryAssignment.role
    );

    await this.auditWriter.write({
      tenantId: employee.tenant_id,
      branchId: primaryAssignment.branch_id,
      employeeId: employee.id,
      actorRole: primaryAssignment.role,
      actionType: "LOGIN_SUCCESS",
      resourceType: "EMPLOYEE",
      resourceId: employee.id,
      outcome: "SUCCESS",
    });

    return { kind: "single", employee, tokens, branchAssignments };
  }

  async selectTenant(params: {
    selectionToken: string;
    tenantId: string;
    branchId?: string;
  }): Promise<{ employee: Employee; tokens: AuthTokens; branchAssignments: EmployeeBranchAssignment[] }> {
    const claims = this.tokenService.verifyTenantSelectionToken(
      params.selectionToken
    );
    if (!claims) {
      throw new Error("Invalid or expired selection token");
    }

    const employee = await this.authRepo.findEmployeeByAccountAndTenant(
      claims.accountId,
      params.tenantId
    );
    if (!employee || employee.status !== "ACTIVE") {
      throw new Error("Membership not found");
    }

    const branchAssignments = await this.authRepo.findEmployeeBranchAssignments(
      employee.id
    );
    if (branchAssignments.length === 0) {
      throw new Error("No branch assignments found");
    }

    const chosenAssignment = this.resolveBranchAssignment({
      employee,
      branchAssignments,
      requestedBranchId: params.branchId,
    });

    const tokens = await this.generateEmployeeTokens(
      employee,
      chosenAssignment.branch_id,
      chosenAssignment.role
    );

    await this.auditWriter.write({
      tenantId: employee.tenant_id,
      branchId: chosenAssignment.branch_id,
      employeeId: employee.id,
      actorRole: chosenAssignment.role,
      actionType: "LOGIN_SUCCESS",
      resourceType: "EMPLOYEE",
      resourceId: employee.id,
      outcome: "SUCCESS",
    });

    return { employee, tokens, branchAssignments };
  }

  async requestForgotPasswordOtp(phone: string): Promise<{ message: string; debugOtp?: string }> {
    const otp = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000);

    await this.authRepo.createPhoneOtp({
      phone,
      purpose: "FORGOT_PASSWORD",
      code_hash: this.hashOtp(otp),
      expires_at: expiresAt,
      max_attempts: this.otpMaxAttempts,
    });

    // Dev/test delivery: log OTP. Replace with SMS provider adapter later.
    // eslint-disable-next-line no-console
    console.log(`[OTP][FORGOT_PASSWORD] ${phone}: ${otp}`);

    return {
      message: "OTP sent",
      ...(this.shouldExposeOtpForDebug() ? { debugOtp: otp } : {}),
    };
  }

  async confirmForgotPassword(params: {
    phone: string;
    otp: string;
    newPassword: string;
  }): Promise<LoginResult> {
    const latestOtp = await this.authRepo.findLatestActivePhoneOtp(
      params.phone,
      "FORGOT_PASSWORD"
    );
    if (!latestOtp) {
      throw new Error("OTP not found");
    }

    if (latestOtp.consumed_at) {
      throw new Error("OTP already used");
    }

    if (latestOtp.expires_at.getTime() <= Date.now()) {
      throw new Error("OTP expired");
    }

    if (latestOtp.attempts >= latestOtp.max_attempts) {
      throw new Error("OTP attempts exceeded");
    }

    const submittedHash = this.hashOtp(params.otp);
    if (submittedHash !== latestOtp.code_hash) {
      await this.authRepo.incrementPhoneOtpAttempts(latestOtp.id);
      throw new Error("Invalid OTP");
    }

    await this.authRepo.consumePhoneOtp(latestOtp.id);

    if (!PasswordService.validatePasswordStrength(params.newPassword)) {
      throw new Error("Password does not meet strength requirements");
    }

    const account = await this.authRepo.findAccountByPhone(params.phone);
    if (!account || account.status !== "ACTIVE") {
      throw new Error("Account not found");
    }

    const passwordHash = await PasswordService.hashPassword(params.newPassword);

    await this.authRepo.updateAccountPassword(account.id, passwordHash);

    const employees = await this.authRepo.findEmployeesByAccountId(account.id);

    // Reset password across all memberships + revoke sessions
    for (const employee of employees) {
      await this.authRepo.updateEmployeePassword(employee.id, passwordHash);
      await this.authRepo.revokeAllSessionsForEmployee(employee.id);
      await this.auditWriter.write({
        tenantId: employee.tenant_id,
        employeeId: employee.id,
        actionType: "CREDENTIAL_CHANGED",
        resourceType: "EMPLOYEE",
        resourceId: employee.id,
        outcome: "SUCCESS",
      });
    }

    const memberships = await this.authRepo.listActiveMembershipTenants(
      account.id
    );
    if (memberships.length === 0) {
      throw new Error("No memberships found");
    }

    if (memberships.length > 1) {
      return {
        kind: "tenant_selection_required",
        selectionToken: this.tokenService.generateTenantSelectionToken(
          account.id,
          this.tenantSelectionTokenExpiry
        ),
        memberships: memberships.map((m) => ({
          tenant: m.tenant,
          employeeId: m.employee.id,
        })),
      };
    }

    const primaryEmployee = memberships[0].employee;
    const branchAssignments = await this.authRepo.findEmployeeBranchAssignments(
      primaryEmployee.id
    );
    if (branchAssignments.length === 0) {
      throw new Error("No branch assignments found");
    }
    const primaryAssignment = this.resolveBranchAssignment({
      employee: primaryEmployee,
      branchAssignments,
    });
    const tokens = await this.generateEmployeeTokens(
      primaryEmployee,
      primaryAssignment.branch_id,
      primaryAssignment.role
    );

    return { kind: "single", employee: primaryEmployee, tokens, branchAssignments };
  }

  async changePassword(params: {
    employeeId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ tokens: AuthTokens }> {
    const employee = await this.authRepo.findEmployeeById(params.employeeId);
    if (!employee || employee.status !== "ACTIVE") {
      throw new Error("Employee not found or inactive");
    }

    const account = await this.authRepo.findAccountById(employee.account_id);
    if (!account || account.status !== "ACTIVE") {
      throw new Error("Account not found or inactive");
    }

    const isValidPassword = await PasswordService.verifyPassword(
      params.currentPassword,
      account.password_hash
    );
    if (!isValidPassword) {
      throw new Error("Invalid current password");
    }

    if (!PasswordService.validatePasswordStrength(params.newPassword)) {
      throw new Error("Password does not meet strength requirements");
    }

    const newHash = await PasswordService.hashPassword(params.newPassword);
    await this.authRepo.updateAccountPassword(account.id, newHash);

    const accountEmployees = await this.authRepo.findEmployeesByAccountId(
      account.id
    );
    for (const membership of accountEmployees) {
      await this.authRepo.updateEmployeePassword(membership.id, newHash);
      await this.authRepo.revokeAllSessionsForEmployee(membership.id);
    }

    const branchAssignments = await this.authRepo.findEmployeeBranchAssignments(
      employee.id
    );
    if (branchAssignments.length === 0) {
      throw new Error("No branch assignments found");
    }
    const primaryAssignment = this.resolveBranchAssignment({
      employee,
      branchAssignments,
    });

    const tokens = await this.generateEmployeeTokens(
      employee,
      primaryAssignment.branch_id,
      primaryAssignment.role
    );

    await this.auditWriter.write({
      tenantId: employee.tenant_id,
      branchId: primaryAssignment.branch_id,
      employeeId: employee.id,
      actorRole: primaryAssignment.role,
      actionType: "CREDENTIAL_CHANGED",
      resourceType: "EMPLOYEE",
      resourceId: employee.id,
      outcome: "SUCCESS",
    });

    return { tokens };
  }

  async acceptInvite(token: string, request: AcceptInviteRequest): Promise<{ employee: Employee; tokens: AuthTokens }> {
    const invite = await this.invitationPort.peekValidInvite(token);

    // Validate password
    if (!PasswordService.validatePasswordStrength(request.password)) {
      throw new Error('Password does not meet strength requirements');
    }

    const { account, passwordHash } = await this.getOrCreateAccountForPhone({
      phone: invite.phone,
      password: request.password,
    });

    const accepted = await this.invitationPort.acceptInvite({
      token,
      accountId: account.id,
      passwordHash,
    });

    const tokens = await this.generateEmployeeTokens(
      accepted.employee,
      accepted.branchId,
      accepted.role
    );

    return { employee: accepted.employee, tokens };
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

    const primaryAssignment = this.resolveBranchAssignment({
      employee,
      branchAssignments,
    });
    return this.generateEmployeeTokens(
      employee,
      primaryAssignment.branch_id,
      primaryAssignment.role
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.authRepo.findSessionByRefreshToken(refreshTokenHash);
    
    if (session) {
      await this.authRepo.revokeSession(session.id);
    }
  }

  private async generateEmployeeTokens(employee: Employee, branchId: string, role: EmployeeRole): Promise<AuthTokens> {
    await this.authRepo.touchEmployeeBranchContext(employee.id, branchId);

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

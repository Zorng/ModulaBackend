import * as crypto from "crypto";
import type {
  InvitationPort,
  InviteAcceptanceResult,
  InvitePreview,
} from "../../../shared/ports/staff-management.js";
import type {
  CreateInviteRequest,
  Employee,
  EmployeeBranchAssignment,
  EmployeeRole,
  Invite,
} from "../domain/entities.js";
import { StaffManagementRepository } from "../infra/repository.js";

export class StaffManagementService {
  constructor(
    private repo: StaffManagementRepository,
    private defaultInviteExpiryHours: number = 72
  ) {}

  async createInvite(
    tenantId: string,
    adminEmployeeId: string,
    request: CreateInviteRequest
  ): Promise<Invite> {
    const branch = await this.repo.findBranchById(request.branch_id);
    if (!branch || branch.tenant_id !== tenantId) {
      throw new Error("Invalid branch");
    }

    const existingEmployee = await this.repo.findEmployeeByPhone(
      tenantId,
      request.phone
    );
    if (existingEmployee) {
      throw new Error("Employee already exists with this phone");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const expiresAt = new Date();
    expiresAt.setHours(
      expiresAt.getHours() +
        (request.expires_in_hours || this.defaultInviteExpiryHours)
    );

    const invite = await this.repo.createInvite({
      tenant_id: tenantId,
      branch_id: request.branch_id,
      role: request.role,
      phone: request.phone,
      token_hash: tokenHash,
      first_name: request.first_name,
      last_name: request.last_name,
      note: request.note,
      expires_at: expiresAt,
    });

    await this.repo.createActivityLog({
      tenant_id: tenantId,
      branch_id: request.branch_id,
      employee_id: adminEmployeeId,
      action_type: "AUTH_INVITE_CREATED",
      resource_type: "INVITE",
      resource_id: invite.id,
      details: { role: request.role, phone: request.phone },
    });

    return { ...invite, token_hash: token };
  }

  async revokeInvite(
    tenantId: string,
    inviteId: string,
    adminEmployeeId: string
  ): Promise<Invite> {
    const invite = await this.repo.revokeInvite(inviteId);

    await this.repo.createActivityLog({
      tenant_id: tenantId,
      employee_id: adminEmployeeId,
      action_type: "AUTH_INVITE_REVOKED",
      resource_type: "INVITE",
      resource_id: invite.id,
    });

    return invite;
  }

  async resendInvite(
    tenantId: string,
    inviteId: string,
    adminEmployeeId: string
  ): Promise<Invite> {
    const existingInvite = await this.repo.findInviteById(inviteId);
    if (!existingInvite) {
      throw new Error("Invite not found");
    }

    if (existingInvite.tenant_id !== tenantId) {
      throw new Error("Unauthorized: Invite belongs to different tenant");
    }

    if (existingInvite.accepted_at) {
      throw new Error("Invite has already been accepted");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.defaultInviteExpiryHours);

    const updatedInvite = await this.repo.updateInviteToken(
      inviteId,
      tokenHash,
      expiresAt
    );

    await this.repo.createActivityLog({
      tenant_id: tenantId,
      employee_id: adminEmployeeId,
      action_type: "AUTH_INVITE_REISSUED",
      resource_type: "INVITE",
      resource_id: inviteId,
      details: { phone: existingInvite.phone },
    });

    return { ...updatedInvite, token_hash: token };
  }

  async assignBranch(
    tenantId: string,
    employeeId: string,
    branchId: string,
    role: EmployeeRole,
    adminEmployeeId: string
  ): Promise<EmployeeBranchAssignment> {
    const employee = await this.repo.findEmployeeById(employeeId);
    if (!employee || employee.tenant_id !== tenantId) {
      throw new Error("Employee not found or does not belong to tenant");
    }

    const branch = await this.repo.findBranchById(branchId);
    if (!branch || branch.tenant_id !== tenantId) {
      throw new Error("Branch not found or does not belong to tenant");
    }

    const existingAssignment = await this.repo.findEmployeeBranchAssignment(
      employeeId,
      branchId
    );
    if (existingAssignment) {
      throw new Error("Employee is already assigned to this branch");
    }

    const assignment = await this.repo.createEmployeeBranchAssignment({
      employee_id: employeeId,
      branch_id: branchId,
      role,
      active: true,
    });

    await this.repo.createActivityLog({
      tenant_id: tenantId,
      branch_id: branchId,
      employee_id: adminEmployeeId,
      action_type: "AUTH_BRANCH_TRANSFERRED",
      resource_type: "EMPLOYEE",
      resource_id: employeeId,
      details: { branch_id: branchId, role },
    });

    return assignment;
  }

  async updateRole(
    tenantId: string,
    employeeId: string,
    branchId: string,
    newRole: EmployeeRole,
    adminEmployeeId: string
  ): Promise<EmployeeBranchAssignment> {
    const employee = await this.repo.findEmployeeById(employeeId);
    if (!employee || employee.tenant_id !== tenantId) {
      throw new Error("Employee not found or does not belong to tenant");
    }

    const branch = await this.repo.findBranchById(branchId);
    if (!branch || branch.tenant_id !== tenantId) {
      throw new Error("Branch not found or does not belong to tenant");
    }

    const updatedAssignment = await this.repo.updateEmployeeBranchAssignmentRole(
      employeeId,
      branchId,
      newRole
    );

    await this.repo.createActivityLog({
      tenant_id: tenantId,
      branch_id: branchId,
      employee_id: adminEmployeeId,
      action_type: "AUTH_ROLE_CHANGED",
      resource_type: "EMPLOYEE",
      resource_id: employeeId,
      details: { new_role: newRole, branch_id: branchId },
    });

    return updatedAssignment;
  }

  async disableEmployee(
    tenantId: string,
    employeeId: string,
    adminEmployeeId: string
  ): Promise<Employee> {
    const employee = await this.repo.findEmployeeById(employeeId);
    if (!employee || employee.tenant_id !== tenantId) {
      throw new Error("Employee not found or does not belong to tenant");
    }

    if (employee.status === "DISABLED") {
      throw new Error("Employee is already disabled");
    }

    if (employeeId === adminEmployeeId) {
      throw new Error("Cannot disable your own account");
    }

    const updatedEmployee = await this.repo.updateEmployeeStatus(
      employeeId,
      "DISABLED"
    );
    await this.repo.deactivateAllEmployeeBranchAssignments(employeeId);

    await this.repo.createActivityLog({
      tenant_id: tenantId,
      employee_id: adminEmployeeId,
      action_type: "AUTH_EMPLOYEE_DISABLED",
      resource_type: "EMPLOYEE",
      resource_id: employeeId,
    });

    return updatedEmployee;
  }
}

export function createInvitationPort(
  repo: StaffManagementRepository
): InvitationPort {
  return {
    async peekValidInvite(token: string): Promise<InvitePreview> {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const invite = await repo.findInviteByTokenHash(tokenHash);
      if (!invite) {
        throw new Error("Invalid invite token");
      }
      if (invite.expires_at < new Date()) {
        throw new Error("Invite has expired");
      }
      if (invite.revoked_at) {
        throw new Error("Invite has been revoked");
      }
      if (invite.accepted_at) {
        throw new Error("Invite has already been accepted");
      }

      return {
        id: invite.id,
        tenantId: invite.tenant_id,
        branchId: invite.branch_id,
        role: invite.role,
        phone: invite.phone,
        firstName: invite.first_name,
        lastName: invite.last_name,
        expiresAt: invite.expires_at,
      };
    },

    async acceptInvite(params: {
      token: string;
      accountId: string;
      passwordHash: string;
    }): Promise<InviteAcceptanceResult> {
      const tokenHash = crypto
        .createHash("sha256")
        .update(params.token)
        .digest("hex");
      const invite = await repo.findInviteByTokenHash(tokenHash);
      if (!invite) {
        throw new Error("Invalid invite token");
      }
      if (invite.expires_at < new Date()) {
        throw new Error("Invite has expired");
      }
      if (invite.revoked_at) {
        throw new Error("Invite has been revoked");
      }
      if (invite.accepted_at) {
        throw new Error("Invite has already been accepted");
      }

      const employee = await repo.createEmployee({
        account_id: params.accountId,
        tenant_id: invite.tenant_id,
        phone: invite.phone,
        first_name: invite.first_name,
        last_name: invite.last_name,
        password_hash: params.passwordHash,
        status: "ACTIVE",
      });

      await repo.createEmployeeBranchAssignment({
        employee_id: employee.id,
        branch_id: invite.branch_id,
        role: invite.role,
        active: true,
      });

      await repo.acceptInvite(invite.id);

      await repo.createActivityLog({
        tenant_id: invite.tenant_id,
        branch_id: invite.branch_id,
        employee_id: employee.id,
        action_type: "AUTH_INVITE_ACCEPTED",
        resource_type: "INVITE",
        resource_id: invite.id,
      });

      return { employee, branchId: invite.branch_id, role: invite.role };
    },
  };
}

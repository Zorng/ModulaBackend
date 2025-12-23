import * as crypto from "crypto";
import type {
  InvitationPort,
  InviteAcceptanceResult,
  InvitePreview,
} from "../../../shared/ports/staff-management.js";
import type { AuditWriterPort } from "../../../shared/ports/audit.js";
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
    private auditWriter: AuditWriterPort,
    private defaultInviteExpiryHours: number = 72
  ) {}

  private async tryWriteAudit(
    entry: Parameters<AuditWriterPort["write"]>[0]
  ): Promise<void> {
    try {
      await this.auditWriter.write(entry);
    } catch {}
  }

  async createInvite(
    tenantId: string,
    adminEmployeeId: string,
    request: CreateInviteRequest
  ): Promise<Invite> {
    const branch = await this.repo.findBranchById(request.branch_id);
    if (!branch || branch.tenant_id !== tenantId) {
      throw new Error("Invalid branch");
    }
    if (branch.status === "FROZEN") {
      throw new Error("Cannot assign staff to a frozen branch");
    }

    const limits = await this.repo.getStaffSeatLimits(tenantId);
    if (!limits) {
      throw new Error("Tenant limits not found. Please contact support.");
    }

    const [hardCount, pendingInvites] = await Promise.all([
      this.repo.countEmployeesByStatus(tenantId, ["ACTIVE", "ARCHIVED"]),
      this.repo.countPendingInvites(tenantId),
    ]);
    if (hardCount + pendingInvites >= limits.maxStaffSeatsHard) {
      throw new Error(
        `Staff seat hard limit reached (${hardCount + pendingInvites}/${limits.maxStaffSeatsHard}).`
      );
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

    await this.tryWriteAudit({
      tenantId,
      branchId: request.branch_id,
      employeeId: adminEmployeeId,
      actorRole: "ADMIN",
      actionType: "STAFF_INVITED",
      resourceType: "INVITE",
      resourceId: invite.id,
      outcome: "SUCCESS",
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

    await this.tryWriteAudit({
      tenantId,
      branchId: invite.branch_id,
      employeeId: adminEmployeeId,
      actorRole: "ADMIN",
      actionType: "STAFF_INVITE_REVOKED",
      resourceType: "INVITE",
      resourceId: invite.id,
      outcome: "SUCCESS",
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

    await this.tryWriteAudit({
      tenantId,
      branchId: existingInvite.branch_id,
      employeeId: adminEmployeeId,
      actorRole: "ADMIN",
      actionType: "STAFF_INVITE_REISSUED",
      resourceType: "INVITE",
      resourceId: inviteId,
      outcome: "SUCCESS",
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

    await this.tryWriteAudit({
      tenantId,
      branchId,
      employeeId: adminEmployeeId,
      actorRole: "ADMIN",
      actionType: "STAFF_BRANCH_CHANGED",
      resourceType: "EMPLOYEE",
      resourceId: employeeId,
      outcome: "SUCCESS",
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

    const previousAssignment = await this.repo.findEmployeeBranchAssignment(
      employeeId,
      branchId
    );
    const updatedAssignment = await this.repo.updateEmployeeBranchAssignmentRole(
      employeeId,
      branchId,
      newRole
    );

    await this.tryWriteAudit({
      tenantId,
      branchId,
      employeeId: adminEmployeeId,
      actorRole: "ADMIN",
      actionType: "STAFF_ROLE_CHANGED",
      resourceType: "EMPLOYEE",
      resourceId: employeeId,
      outcome: "SUCCESS",
      details: {
        branch_id: branchId,
        previous_role: previousAssignment?.role ?? null,
        new_role: newRole,
      },
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

    await this.tryWriteAudit({
      tenantId,
      employeeId: adminEmployeeId,
      actorRole: "ADMIN",
      actionType: "STAFF_DISABLED",
      resourceType: "EMPLOYEE",
      resourceId: employeeId,
      outcome: "SUCCESS",
      details: { previous_status: employee.status },
    });

    return updatedEmployee;
  }

  async reactivateEmployee(
    tenantId: string,
    employeeId: string,
    adminEmployeeId: string
  ): Promise<Employee> {
    const employee = await this.repo.findEmployeeById(employeeId);
    if (!employee || employee.tenant_id !== tenantId) {
      throw new Error("Employee not found or does not belong to tenant");
    }

    if (employee.status !== "DISABLED") {
      throw new Error("Employee is not disabled");
    }

    if (employeeId === adminEmployeeId) {
      throw new Error("Cannot reactivate your own account");
    }

    const limits = await this.repo.getStaffSeatLimits(tenantId);
    if (!limits) {
      throw new Error("Tenant limits not found. Please contact support.");
    }

    const activeCount = await this.repo.countEmployeesByStatus(tenantId, [
      "ACTIVE",
    ]);
    if (activeCount >= limits.maxStaffSeatsSoft) {
      throw new Error(
        `Staff seat limit reached (${activeCount}/${limits.maxStaffSeatsSoft}). Disable or archive staff, or upgrade your plan.`
      );
    }

    const updatedEmployee = await this.repo.updateEmployeeStatus(
      employeeId,
      "ACTIVE"
    );
    await this.repo.activateAllEmployeeBranchAssignments(employeeId);

    await this.tryWriteAudit({
      tenantId,
      employeeId: adminEmployeeId,
      actorRole: "ADMIN",
      actionType: "STAFF_REACTIVATED",
      resourceType: "EMPLOYEE",
      resourceId: employeeId,
      outcome: "SUCCESS",
      details: { previous_status: employee.status },
    });

    return updatedEmployee;
  }

  async archiveEmployee(
    tenantId: string,
    employeeId: string,
    adminEmployeeId: string
  ): Promise<Employee> {
    const employee = await this.repo.findEmployeeById(employeeId);
    if (!employee || employee.tenant_id !== tenantId) {
      throw new Error("Employee not found or does not belong to tenant");
    }

    if (employee.status === "ARCHIVED") {
      throw new Error("Employee is already archived");
    }
    if (employee.status === "INVITED") {
      throw new Error("Cannot archive an invited employee");
    }

    if (employeeId === adminEmployeeId) {
      throw new Error("Cannot archive your own account");
    }

    const updatedEmployee = await this.repo.updateEmployeeStatus(
      employeeId,
      "ARCHIVED"
    );
    await this.repo.deactivateAllEmployeeBranchAssignments(employeeId);

    await this.tryWriteAudit({
      tenantId,
      employeeId: adminEmployeeId,
      actorRole: "ADMIN",
      actionType: "STAFF_ARCHIVED",
      resourceType: "EMPLOYEE",
      resourceId: employeeId,
      outcome: "SUCCESS",
      details: { previous_status: employee.status },
    });

    return updatedEmployee;
  }
}

export function createInvitationPort(
  repo: StaffManagementRepository,
  auditWriter: AuditWriterPort
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

      const limits = await repo.getStaffSeatLimits(invite.tenant_id);
      if (!limits) {
        throw new Error("Tenant limits not found. Please contact support.");
      }

      const [hardCount, activeCount] = await Promise.all([
        repo.countEmployeesByStatus(invite.tenant_id, ["ACTIVE", "ARCHIVED"]),
        repo.countEmployeesByStatus(invite.tenant_id, ["ACTIVE"]),
      ]);
      if (hardCount >= limits.maxStaffSeatsHard) {
        throw new Error(
          `Staff seat hard limit reached (${hardCount}/${limits.maxStaffSeatsHard}).`
        );
      }
      if (activeCount >= limits.maxStaffSeatsSoft) {
        throw new Error(
          `Staff seat limit reached (${activeCount}/${limits.maxStaffSeatsSoft}). Disable or archive staff, or upgrade your plan.`
        );
      }

      const branch = await repo.findBranchById(invite.branch_id);
      if (!branch || branch.tenant_id !== invite.tenant_id) {
        throw new Error("Invalid branch");
      }
      if (branch.status === "FROZEN") {
        throw new Error("Cannot join a frozen branch");
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

      try {
        await auditWriter.write({
          tenantId: invite.tenant_id,
          branchId: invite.branch_id,
          employeeId: employee.id,
          actorRole: invite.role,
          actionType: "STAFF_INVITE_ACCEPTED",
          resourceType: "INVITE",
          resourceId: invite.id,
          outcome: "SUCCESS",
          details: { role: invite.role },
        });
      } catch {}

      return { employee, branchId: invite.branch_id, role: invite.role };
    },
  };
}

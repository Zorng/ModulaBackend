import crypto from "crypto";
import { V0PasswordService } from "./password.service.js";
import { V0AuthBaseService } from "./base.service.js";
import {
  V0AuthError,
  normalizePhone,
  normalizeRoleKey,
  normalizeUniqueBranchIds,
} from "./common.js";

export class V0AuthMembershipService extends V0AuthBaseService {
  async inviteMembership(input: {
    requesterAccountId: string;
    tenantId: string;
    phone: string;
    roleKey: string;
  }): Promise<{
    membershipId: string;
    tenantId: string;
    accountId: string;
    phone: string;
    roleKey: string;
    status: string;
  }> {
    const tenantId = String(input.tenantId ?? "").trim();
    const phone = normalizePhone(input.phone);
    const roleKey = normalizeRoleKey(input.roleKey);

    if (!tenantId || !phone || !roleKey) {
      throw new V0AuthError(422, "tenantId, phone, and roleKey are required");
    }
    if (!this.assignableRoles.has(roleKey)) {
      throw new V0AuthError(422, "invalid roleKey");
    }

    const requesterMembership = await this.repo.findActiveMembership(
      input.requesterAccountId,
      tenantId
    );
    if (!requesterMembership) {
      throw new V0AuthError(403, "requester has no active membership for tenant");
    }
    if (!this.privilegedRoles.has(requesterMembership.role_key)) {
      throw new V0AuthError(403, "requester role cannot invite members");
    }

    let account = await this.repo.findAccountByPhone(phone);
    if (!account) {
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await V0PasswordService.hashPassword(randomPassword);
      account = await this.repo.createInvitedAccount({
        phone,
        passwordHash,
      });
    }

    const existingMembership = await this.repo.findMembershipByTenantAndAccount(
      tenantId,
      account.id
    );
    if (existingMembership?.status === "ACTIVE") {
      throw new V0AuthError(409, "membership already active");
    }

    const membership = await this.repo.upsertInvitedMembership({
      tenantId,
      accountId: account.id,
      roleKey,
      invitedByMembershipId: requesterMembership.id,
    });

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      phone,
      eventKey: "AUTH_MEMBERSHIP_INVITE",
      outcome: "SUCCESS",
      metadata: {
        tenantId,
        targetAccountId: account.id,
        roleKey,
        membershipId: membership.id,
      },
    });

    return {
      membershipId: membership.id,
      tenantId: membership.tenant_id,
      accountId: membership.account_id,
      phone: account.phone,
      roleKey: membership.role_key,
      status: membership.status,
    };
  }

  async listInvitationInbox(input: { requesterAccountId: string }): Promise<{
    invitations: Array<{
      membershipId: string;
      tenantId: string;
      tenantName: string;
      roleKey: string;
      invitedAt: string;
      invitedByMembershipId: string | null;
    }>;
  }> {
    const rows = await this.repo.listInvitationInbox(input.requesterAccountId);
    return {
      invitations: rows.map((row) => ({
        membershipId: row.membership_id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        roleKey: row.role_key,
        invitedAt: row.invited_at.toISOString(),
        invitedByMembershipId: row.invited_by_membership_id,
      })),
    };
  }

  async acceptInvitation(input: {
    requesterAccountId: string;
    membershipId: string;
  }): Promise<{
    membershipId: string;
    tenantId: string;
    status: string;
    activeBranchIds: string[];
  }> {
    const membershipId = String(input.membershipId ?? "").trim();
    if (!membershipId) {
      throw new V0AuthError(422, "membershipId is required");
    }

    const existing = await this.repo.findMembershipById(membershipId);
    if (!existing) {
      throw new V0AuthError(404, "invitation not found");
    }
    if (existing.account_id !== input.requesterAccountId) {
      throw new V0AuthError(403, "cannot accept invitation for another account");
    }
    if (existing.status !== "INVITED") {
      throw new V0AuthError(409, "invitation is not pending");
    }

    const updated = await this.repo.acceptInvitation({
      membershipId,
      accountId: input.requesterAccountId,
    });
    if (!updated) {
      throw new V0AuthError(409, "invitation is not pending");
    }

    await this.repo.ensureStaffProfileForMembership(updated.id);
    const pendingBranchIds = await this.repo.listPendingBranchIdsForMembership(updated.id);
    if (pendingBranchIds.length > 0) {
      await this.repo.upsertActiveBranchAssignmentsForMembership({
        membershipId: updated.id,
        tenantId: updated.tenant_id,
        accountId: updated.account_id,
        branchIds: pendingBranchIds,
      });
      await this.repo.clearPendingBranchAssignments(updated.id);
    }
    const activeBranchIds = await this.repo.listActiveBranchIdsForMembership(updated.id);

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      eventKey: "AUTH_MEMBERSHIP_ACCEPT",
      outcome: "SUCCESS",
      metadata: {
        membershipId: updated.id,
        tenantId: updated.tenant_id,
        assignedBranchCount: activeBranchIds.length,
      },
    });

    return {
      membershipId: updated.id,
      tenantId: updated.tenant_id,
      status: updated.status,
      activeBranchIds,
    };
  }

  async rejectInvitation(input: {
    requesterAccountId: string;
    membershipId: string;
  }): Promise<{ membershipId: string; tenantId: string; status: string }> {
    const membershipId = String(input.membershipId ?? "").trim();
    if (!membershipId) {
      throw new V0AuthError(422, "membershipId is required");
    }

    const existing = await this.repo.findMembershipById(membershipId);
    if (!existing) {
      throw new V0AuthError(404, "invitation not found");
    }
    if (existing.account_id !== input.requesterAccountId) {
      throw new V0AuthError(403, "cannot reject invitation for another account");
    }
    if (existing.status !== "INVITED") {
      throw new V0AuthError(409, "invitation is not pending");
    }

    const updated = await this.repo.rejectInvitation({
      membershipId,
      accountId: input.requesterAccountId,
    });
    if (!updated) {
      throw new V0AuthError(409, "invitation is not pending");
    }

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      eventKey: "AUTH_MEMBERSHIP_REJECT",
      outcome: "SUCCESS",
      metadata: {
        membershipId: updated.id,
        tenantId: updated.tenant_id,
      },
    });

    return {
      membershipId: updated.id,
      tenantId: updated.tenant_id,
      status: updated.status,
    };
  }

  async changeMembershipRole(input: {
    requesterAccountId: string;
    membershipId: string;
    roleKey: string;
  }): Promise<{ membershipId: string; tenantId: string; roleKey: string }> {
    const membershipId = String(input.membershipId ?? "").trim();
    const roleKey = normalizeRoleKey(input.roleKey);
    if (!membershipId || !roleKey) {
      throw new V0AuthError(422, "membershipId and roleKey are required");
    }
    if (!this.assignableRoles.has(roleKey)) {
      throw new V0AuthError(422, "invalid roleKey");
    }

    const target = await this.repo.findMembershipById(membershipId);
    if (!target) {
      throw new V0AuthError(404, "membership not found");
    }
    if (target.role_key === "OWNER") {
      throw new V0AuthError(409, "owner role cannot be changed");
    }

    const requesterMembership = await this.repo.findActiveMembership(
      input.requesterAccountId,
      target.tenant_id
    );
    if (!requesterMembership || !this.privilegedRoles.has(requesterMembership.role_key)) {
      throw new V0AuthError(403, "requester role cannot change membership role");
    }

    const updated = await this.repo.updateMembershipRole({
      membershipId,
      roleKey,
    });
    if (!updated) {
      throw new V0AuthError(404, "membership not found");
    }

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      eventKey: "AUTH_MEMBERSHIP_ROLE_CHANGE",
      outcome: "SUCCESS",
      metadata: {
        membershipId: updated.id,
        tenantId: updated.tenant_id,
        roleKey: updated.role_key,
      },
    });

    return {
      membershipId: updated.id,
      tenantId: updated.tenant_id,
      roleKey: updated.role_key,
    };
  }

  async revokeMembership(input: {
    requesterAccountId: string;
    membershipId: string;
  }): Promise<{ membershipId: string; tenantId: string; status: string }> {
    const membershipId = String(input.membershipId ?? "").trim();
    if (!membershipId) {
      throw new V0AuthError(422, "membershipId is required");
    }

    const target = await this.repo.findMembershipById(membershipId);
    if (!target) {
      throw new V0AuthError(404, "membership not found");
    }
    if (target.role_key === "OWNER") {
      throw new V0AuthError(409, "owner membership cannot be revoked");
    }

    const requesterMembership = await this.repo.findActiveMembership(
      input.requesterAccountId,
      target.tenant_id
    );
    if (!requesterMembership || !this.privilegedRoles.has(requesterMembership.role_key)) {
      throw new V0AuthError(403, "requester role cannot revoke membership");
    }
    if (requesterMembership.id === target.id) {
      throw new V0AuthError(409, "cannot revoke own membership");
    }

    const updated = await this.repo.revokeMembership(membershipId);
    if (!updated) {
      throw new V0AuthError(404, "membership not found");
    }

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      eventKey: "AUTH_MEMBERSHIP_REVOKE",
      outcome: "SUCCESS",
      metadata: {
        membershipId: updated.id,
        tenantId: updated.tenant_id,
      },
    });

    return {
      membershipId: updated.id,
      tenantId: updated.tenant_id,
      status: updated.status,
    };
  }

  async assignMembershipBranches(input: {
    requesterAccountId: string;
    membershipId: string;
    branchIds: string[];
  }): Promise<{
    membershipId: string;
    tenantId: string;
    membershipStatus: string;
    pendingBranchIds: string[];
    activeBranchIds: string[];
  }> {
    const membershipId = String(input.membershipId ?? "").trim();
    if (!membershipId) {
      throw new V0AuthError(422, "membershipId is required");
    }
    const branchIds = normalizeUniqueBranchIds(input.branchIds);

    const target = await this.repo.findMembershipById(membershipId);
    if (!target) {
      throw new V0AuthError(404, "membership not found");
    }

    const requesterMembership = await this.repo.findActiveMembership(
      input.requesterAccountId,
      target.tenant_id
    );
    if (!requesterMembership || !this.privilegedRoles.has(requesterMembership.role_key)) {
      throw new V0AuthError(403, "requester role cannot assign branches");
    }

    const validBranches = await this.repo.findActiveBranchesByIds(target.tenant_id, branchIds);
    if (validBranches.length !== branchIds.length) {
      throw new V0AuthError(422, "branchIds contain invalid or inactive branches");
    }

    if (target.status === "INVITED") {
      await this.repo.replacePendingBranchAssignments({
        membershipId: target.id,
        tenantId: target.tenant_id,
        branchIds,
      });
      const pendingBranchIds = await this.repo.listPendingBranchIdsForMembership(target.id);
      await this.writeAuditEventBestEffort({
        accountId: input.requesterAccountId,
        eventKey: "AUTH_MEMBERSHIP_BRANCH_ASSIGN",
        outcome: "SUCCESS",
        metadata: {
          membershipId: target.id,
          tenantId: target.tenant_id,
          mode: "PENDING_INVITE",
          branchCount: pendingBranchIds.length,
        },
      });
      return {
        membershipId: target.id,
        tenantId: target.tenant_id,
        membershipStatus: target.status,
        pendingBranchIds,
        activeBranchIds: [],
      };
    }

    if (target.status === "ACTIVE") {
      await this.repo.ensureStaffProfileForMembership(target.id);
      await this.repo.upsertActiveBranchAssignmentsForMembership({
        membershipId: target.id,
        tenantId: target.tenant_id,
        accountId: target.account_id,
        branchIds,
      });
      const activeBranchIds = await this.repo.listActiveBranchIdsForMembership(target.id);
      await this.writeAuditEventBestEffort({
        accountId: input.requesterAccountId,
        eventKey: "AUTH_MEMBERSHIP_BRANCH_ASSIGN",
        outcome: "SUCCESS",
        metadata: {
          membershipId: target.id,
          tenantId: target.tenant_id,
          mode: "ACTIVE_MEMBERSHIP",
          branchCount: activeBranchIds.length,
        },
      });
      return {
        membershipId: target.id,
        tenantId: target.tenant_id,
        membershipStatus: target.status,
        pendingBranchIds: [],
        activeBranchIds,
      };
    }

    throw new V0AuthError(
      409,
      "branch assignment allowed only for invited or active memberships"
    );
  }
}

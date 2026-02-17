import { V0OrgAccountError } from "../../common/error.js";
import { V0MembershipRepository } from "../infra/repository.js";

export class V0MembershipService {
  private readonly privilegedRoles = new Set(["OWNER", "ADMIN"]);
  private readonly assignableRoles = new Set(["ADMIN", "MANAGER", "CASHIER", "CLERK"]);

  constructor(private readonly repo: V0MembershipRepository) {}

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
      throw new V0OrgAccountError(422, "tenantId, phone, and roleKey are required");
    }
    if (!this.assignableRoles.has(roleKey)) {
      throw new V0OrgAccountError(422, "invalid roleKey");
    }

    const requesterMembership = await this.repo.findActiveMembership(
      input.requesterAccountId,
      tenantId
    );
    if (!requesterMembership) {
      throw new V0OrgAccountError(403, "requester has no active membership for tenant");
    }
    if (!this.privilegedRoles.has(requesterMembership.role_key)) {
      throw new V0OrgAccountError(403, "requester role cannot invite members");
    }

    let account = await this.repo.findAccountByPhone(phone);
    if (!account) {
      account = await this.repo.createInvitedAccount({ phone });
    }

    const existingMembership = await this.repo.findMembershipByTenantAndAccount(
      tenantId,
      account.id
    );
    if (existingMembership?.status === "ACTIVE") {
      throw new V0OrgAccountError(409, "membership already active");
    }

    const membership = await this.repo.upsertInvitedMembership({
      tenantId,
      accountId: account.id,
      roleKey,
      invitedByMembershipId: requesterMembership.id,
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
    accountId: string;
  }> {
    const membershipId = String(input.membershipId ?? "").trim();
    if (!membershipId) {
      throw new V0OrgAccountError(422, "membershipId is required");
    }

    const existing = await this.repo.findMembershipById(membershipId);
    if (!existing) {
      throw new V0OrgAccountError(404, "invitation not found");
    }
    if (existing.account_id !== input.requesterAccountId) {
      throw new V0OrgAccountError(403, "cannot accept invitation for another account");
    }
    if (existing.status !== "INVITED") {
      throw new V0OrgAccountError(409, "invitation is not pending");
    }

    const updated = await this.repo.acceptInvitation({
      membershipId,
      accountId: input.requesterAccountId,
    });
    if (!updated) {
      throw new V0OrgAccountError(409, "invitation is not pending");
    }

    return {
      membershipId: updated.id,
      tenantId: updated.tenant_id,
      status: updated.status,
      accountId: updated.account_id,
    };
  }

  async rejectInvitation(input: {
    requesterAccountId: string;
    membershipId: string;
  }): Promise<{ membershipId: string; tenantId: string; status: string }> {
    const membershipId = String(input.membershipId ?? "").trim();
    if (!membershipId) {
      throw new V0OrgAccountError(422, "membershipId is required");
    }

    const existing = await this.repo.findMembershipById(membershipId);
    if (!existing) {
      throw new V0OrgAccountError(404, "invitation not found");
    }
    if (existing.account_id !== input.requesterAccountId) {
      throw new V0OrgAccountError(403, "cannot reject invitation for another account");
    }
    if (existing.status !== "INVITED") {
      throw new V0OrgAccountError(409, "invitation is not pending");
    }

    const updated = await this.repo.rejectInvitation({
      membershipId,
      accountId: input.requesterAccountId,
    });
    if (!updated) {
      throw new V0OrgAccountError(409, "invitation is not pending");
    }

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
      throw new V0OrgAccountError(422, "membershipId and roleKey are required");
    }
    if (!this.assignableRoles.has(roleKey)) {
      throw new V0OrgAccountError(422, "invalid roleKey");
    }

    const access = await this.repo.findMembershipForRequesterAction({
      requesterAccountId: input.requesterAccountId,
      targetMembershipId: membershipId,
    });
    if (!access || !this.privilegedRoles.has(access.requester_role_key)) {
      throw new V0OrgAccountError(403, "requester role cannot change membership role");
    }
    if (access.target_role_key === "OWNER") {
      throw new V0OrgAccountError(409, "owner role cannot be changed");
    }

    const updated = await this.repo.updateMembershipRole({
      membershipId,
      roleKey,
    });
    if (!updated) {
      throw new V0OrgAccountError(404, "membership not found");
    }

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
      throw new V0OrgAccountError(422, "membershipId is required");
    }

    const access = await this.repo.findMembershipForRequesterAction({
      requesterAccountId: input.requesterAccountId,
      targetMembershipId: membershipId,
    });
    if (!access || !this.privilegedRoles.has(access.requester_role_key)) {
      throw new V0OrgAccountError(403, "requester role cannot revoke membership");
    }
    if (access.target_role_key === "OWNER") {
      throw new V0OrgAccountError(409, "owner membership cannot be revoked");
    }
    if (access.requester_membership_id === access.target_membership_id) {
      throw new V0OrgAccountError(409, "cannot revoke own membership");
    }

    const updated = await this.repo.revokeMembership(membershipId);
    if (!updated) {
      throw new V0OrgAccountError(404, "membership not found");
    }

    return {
      membershipId: updated.id,
      tenantId: updated.tenant_id,
      status: updated.status,
    };
  }
}

function normalizePhone(phone: string): string {
  return String(phone ?? "").trim();
}

function normalizeRoleKey(input: string | undefined): string {
  return String(input ?? "").trim().toUpperCase();
}

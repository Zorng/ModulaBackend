import { V0StaffManagementRepository } from "../infra/repository.js";

export class V0StaffManagementError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "V0StaffManagementError";
  }
}

export class V0StaffManagementService {
  private readonly privilegedRoles = new Set(["OWNER", "ADMIN"]);

  constructor(private readonly repo: V0StaffManagementRepository) {}

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
    const membershipId = normalizeRequiredId(input.membershipId, "membershipId is required");
    const branchIds = normalizeUniqueBranchIds(input.branchIds);

    const access = await this.repo.findMembershipForRequesterAction({
      requesterAccountId: input.requesterAccountId,
      targetMembershipId: membershipId,
    });
    if (!access || !this.privilegedRoles.has(access.requester_role_key)) {
      throw new V0StaffManagementError(403, "requester role cannot assign branches");
    }

    const validBranches = await this.repo.findActiveBranchesByIds(
      access.target_tenant_id,
      branchIds
    );
    if (validBranches.length !== branchIds.length) {
      throw new V0StaffManagementError(422, "branchIds contain invalid or inactive branches");
    }

    if (access.target_status === "INVITED") {
      await this.repo.replacePendingBranchAssignments({
        membershipId: access.target_membership_id,
        tenantId: access.target_tenant_id,
        branchIds,
      });
      const pendingBranchIds = await this.repo.listPendingBranchIdsForMembership(
        access.target_membership_id
      );
      return {
        membershipId: access.target_membership_id,
        tenantId: access.target_tenant_id,
        membershipStatus: access.target_status,
        pendingBranchIds,
        activeBranchIds: [],
      };
    }

    if (access.target_status === "ACTIVE") {
      await this.repo.ensureStaffProfileForMembership(access.target_membership_id);
      await this.repo.upsertActiveBranchAssignmentsForMembership({
        membershipId: access.target_membership_id,
        tenantId: access.target_tenant_id,
        accountId: access.target_account_id,
        branchIds,
      });
      const activeBranchIds = await this.repo.listActiveBranchIdsForMembership(
        access.target_membership_id
      );
      return {
        membershipId: access.target_membership_id,
        tenantId: access.target_tenant_id,
        membershipStatus: access.target_status,
        pendingBranchIds: [],
        activeBranchIds,
      };
    }

    throw new V0StaffManagementError(
      409,
      "branch assignment allowed only for invited or active memberships"
    );
  }

  async activateMembershipBranchAssignments(input: { membershipId: string }): Promise<{
    membershipId: string;
    tenantId: string;
    accountId: string;
    activeBranchIds: string[];
  }> {
    const membershipId = normalizeRequiredId(input.membershipId, "membershipId is required");
    const membership = await this.repo.findMembershipById(membershipId);
    if (!membership) {
      throw new V0StaffManagementError(404, "membership not found");
    }
    if (membership.status !== "ACTIVE") {
      throw new V0StaffManagementError(409, "membership must be active");
    }

    await this.repo.ensureStaffProfileForMembership(membership.id);

    const pendingBranchIds = await this.repo.listPendingBranchIdsForMembership(membership.id);
    if (pendingBranchIds.length > 0) {
      await this.repo.upsertActiveBranchAssignmentsForMembership({
        membershipId: membership.id,
        tenantId: membership.tenant_id,
        accountId: membership.account_id,
        branchIds: pendingBranchIds,
      });
      await this.repo.clearPendingBranchAssignments(membership.id);
    }

    const activeBranchIds = await this.repo.listActiveBranchIdsForMembership(membership.id);
    return {
      membershipId: membership.id,
      tenantId: membership.tenant_id,
      accountId: membership.account_id,
      activeBranchIds,
    };
  }

  async ensureStaffProjectionForProvisionedMembership(input: {
    membershipId: string;
    tenantId: string;
    accountId: string;
    initialBranchIds: string[];
  }): Promise<void> {
    const membershipId = normalizeRequiredId(input.membershipId, "membershipId is required");
    const tenantId = normalizeRequiredId(input.tenantId, "tenantId is required");
    const accountId = normalizeRequiredId(input.accountId, "accountId is required");
    const branchIds = normalizeUniqueBranchIds(input.initialBranchIds);

    await this.repo.ensureStaffProfileForMembership(membershipId);
    await this.repo.upsertActiveBranchAssignmentsForMembership({
      membershipId,
      tenantId,
      accountId,
      branchIds,
    });
  }

  async revokeMembershipStaffProjection(input: { membershipId: string }): Promise<void> {
    const membershipId = normalizeRequiredId(input.membershipId, "membershipId is required");
    await this.repo.revokeStaffProjectionForMembership(membershipId);
  }
}

function normalizeRequiredId(value: unknown, message: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new V0StaffManagementError(422, message);
  }
  return normalized;
}

function normalizeUniqueBranchIds(branchIds: unknown): string[] {
  if (!Array.isArray(branchIds)) {
    return [];
  }

  const normalized = branchIds
    .map((branchId) => String(branchId ?? "").trim())
    .filter((branchId) => branchId.length > 0);
  return Array.from(new Set(normalized));
}

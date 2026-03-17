import {
  V0StaffManagementRepository,
  type V0StaffMembershipStatus,
} from "../infra/repository.js";
import {
  buildOffsetPaginatedResult,
  type OffsetPaginatedResult,
} from "../../../../../shared/pagination.js";

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
  private readonly readRoles = new Set(["OWNER", "ADMIN", "MANAGER"]);

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

  async listStaffMembers(input: {
    actor: {
      accountId: string;
      tenantId: string | null;
      branchId: string | null;
    };
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<
    OffsetPaginatedResult<{
      membershipId: string;
      tenantId: string;
      accountId: string;
      roleKey: string;
      membershipStatus: V0StaffMembershipStatus;
      phone: string;
      firstName: string | null;
      lastName: string | null;
      staffProfileStatus: "ACTIVE" | "REVOKED" | null;
      invitedAt: string;
      acceptedAt: string | null;
      rejectedAt: string | null;
      revokedAt: string | null;
      pendingBranchIds: string[];
      activeBranchIds: string[];
    }>
  > {
    const scope = assertTenantContext(input.actor);
    const requesterMembership = await this.repo.findActiveMembershipForAccountInTenant({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
    });
    if (!requesterMembership || !this.readRoles.has(requesterMembership.role_key)) {
      throw new V0StaffManagementError(403, "requester role cannot view staff");
    }

    const status = normalizeOptionalMembershipStatus(input.status);
    const search = normalizeOptionalString(input.search);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const [rows, total] = await Promise.all([
      this.repo.listMembershipProfilesForTenant({
        tenantId: scope.tenantId,
        status,
        search,
        limit,
        offset,
      }),
      this.repo.countMembershipProfilesForTenant({
        tenantId: scope.tenantId,
        status,
        search,
      }),
    ]);

    const items = await Promise.all(
      rows.map(async (row) => {
        const [pendingBranchIds, activeBranchIds] = await Promise.all([
          this.repo.listPendingBranchIdsForMembership(row.membership_id),
          this.repo.listActiveBranchIdsForMembership(row.membership_id),
        ]);
        return mapMembershipProfile(row, pendingBranchIds, activeBranchIds);
      })
    );

    return buildOffsetPaginatedResult({
      items,
      limit,
      offset,
      total,
    });
  }

  async getStaffMember(input: {
    actor: {
      accountId: string;
      tenantId: string | null;
      branchId: string | null;
    };
    membershipId: string;
  }): Promise<{
    membershipId: string;
    tenantId: string;
    accountId: string;
    roleKey: string;
    membershipStatus: V0StaffMembershipStatus;
    phone: string;
    firstName: string | null;
    lastName: string | null;
    staffProfileStatus: "ACTIVE" | "REVOKED" | null;
    invitedAt: string;
    acceptedAt: string | null;
    rejectedAt: string | null;
    revokedAt: string | null;
    pendingBranchIds: string[];
    activeBranchIds: string[];
  }> {
    const scope = assertTenantContext(input.actor);
    const requesterMembership = await this.repo.findActiveMembershipForAccountInTenant({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
    });
    if (!requesterMembership || !this.readRoles.has(requesterMembership.role_key)) {
      throw new V0StaffManagementError(403, "requester role cannot view staff");
    }

    const row = await this.repo.findMembershipProfileForTenant({
      tenantId: scope.tenantId,
      membershipId: input.membershipId,
    });
    if (!row) {
      throw new V0StaffManagementError(404, "membership not found");
    }

    const [pendingBranchIds, activeBranchIds] = await Promise.all([
      this.repo.listPendingBranchIdsForMembership(row.membership_id),
      this.repo.listActiveBranchIdsForMembership(row.membership_id),
    ]);

    return mapMembershipProfile(row, pendingBranchIds, activeBranchIds);
  }

  async getMembershipBranchAssignments(input: {
    actor: {
      accountId: string;
      tenantId: string | null;
      branchId: string | null;
    };
    membershipId: string;
  }): Promise<{
    membershipId: string;
    tenantId: string;
    membershipStatus: V0StaffMembershipStatus;
    pendingBranchIds: string[];
    activeBranchIds: string[];
  }> {
    const scope = assertTenantContext(input.actor);
    const requesterMembership = await this.repo.findActiveMembershipForAccountInTenant({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
    });
    if (!requesterMembership || !this.readRoles.has(requesterMembership.role_key)) {
      throw new V0StaffManagementError(403, "requester role cannot view staff");
    }

    const row = await this.repo.findMembershipProfileForTenant({
      tenantId: scope.tenantId,
      membershipId: input.membershipId,
    });
    if (!row) {
      throw new V0StaffManagementError(404, "membership not found");
    }

    const [pendingBranchIds, activeBranchIds] = await Promise.all([
      this.repo.listPendingBranchIdsForMembership(row.membership_id),
      this.repo.listActiveBranchIdsForMembership(row.membership_id),
    ]);

    return {
      membershipId: row.membership_id,
      tenantId: row.tenant_id,
      membershipStatus: row.membership_status,
      pendingBranchIds,
      activeBranchIds,
    };
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

function assertTenantContext(actor: {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
}): {
  accountId: string;
  tenantId: string;
} {
  const accountId = String(actor.accountId ?? "").trim();
  const tenantId = String(actor.tenantId ?? "").trim();

  if (!accountId) {
    throw new V0StaffManagementError(401, "authentication required");
  }
  if (!tenantId) {
    throw new V0StaffManagementError(403, "tenant context required");
  }

  return { accountId, tenantId };
}

function normalizeOptionalMembershipStatus(status: string | undefined): V0StaffMembershipStatus | null {
  const value = normalizeOptionalString(status)?.toUpperCase();
  if (!value || value === "ALL") {
    return null;
  }
  if (value === "INVITED" || value === "ACTIVE" || value === "REVOKED") {
    return value;
  }
  throw new V0StaffManagementError(422, "status must be INVITED | ACTIVE | REVOKED | ALL");
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLimit(limit: number | undefined): number {
  const value = Number(limit ?? 50);
  if (!Number.isFinite(value) || value <= 0) {
    return 50;
  }
  return Math.min(Math.floor(value), 200);
}

function normalizeOffset(offset: number | undefined): number {
  const value = Number(offset ?? 0);
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function mapMembershipProfile(
  row: {
    membership_id: string;
    tenant_id: string;
    account_id: string;
    role_key: string;
    membership_status: V0StaffMembershipStatus;
    invited_at: Date;
    accepted_at: Date | null;
    rejected_at: Date | null;
    revoked_at: Date | null;
    phone: string;
    first_name: string | null;
    last_name: string | null;
    staff_profile_status: "ACTIVE" | "REVOKED" | null;
  },
  pendingBranchIds: string[],
  activeBranchIds: string[]
) {
  return {
    membershipId: row.membership_id,
    tenantId: row.tenant_id,
    accountId: row.account_id,
    roleKey: row.role_key,
    membershipStatus: row.membership_status,
    phone: row.phone,
    firstName: row.first_name,
    lastName: row.last_name,
    staffProfileStatus: row.staff_profile_status,
    invitedAt: row.invited_at.toISOString(),
    acceptedAt: row.accepted_at ? row.accepted_at.toISOString() : null,
    rejectedAt: row.rejected_at ? row.rejected_at.toISOString() : null,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    pendingBranchIds,
    activeBranchIds,
  };
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

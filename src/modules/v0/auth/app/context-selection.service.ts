import { V0AuthBaseService } from "./base.service.js";
import { V0AuthError } from "./common.js";

type TenantSelectionState =
  | "NO_ACTIVE_MEMBERSHIPS"
  | "TENANT_AUTO_SELECTED"
  | "TENANT_SELECTION_REQUIRED"
  | "TENANT_SELECTED";

type BranchSelectionState =
  | "TENANT_CONTEXT_REQUIRED"
  | "NO_BRANCH_ASSIGNED"
  | "BRANCH_AUTO_SELECTED"
  | "BRANCH_SELECTION_REQUIRED"
  | "BRANCH_SELECTED";

export class V0AuthContextSelectionService extends V0AuthBaseService {
  async listTenantContext(input: {
    requesterAccountId: string;
    currentTenantId: string | null;
  }): Promise<{
    state: TenantSelectionState;
    selectedTenantId: string | null;
    memberships: Array<{
      membershipId: string;
      tenantId: string;
      tenantName: string;
      roleKey: string;
    }>;
  }> {
    const memberships = await this.repo.listActiveMembershipTenants(
      input.requesterAccountId
    );
    const mappedMemberships = memberships.map((membership) => ({
      membershipId: membership.membership_id,
      tenantId: membership.tenant_id,
      tenantName: membership.tenant_name,
      roleKey: membership.role_key,
    }));

    if (mappedMemberships.length === 0) {
      return {
        state: "NO_ACTIVE_MEMBERSHIPS",
        selectedTenantId: null,
        memberships: [],
      };
    }

    if (mappedMemberships.length === 1) {
      return {
        state: "TENANT_AUTO_SELECTED",
        selectedTenantId: mappedMemberships[0].tenantId,
        memberships: mappedMemberships,
      };
    }

    const selectedTenant = mappedMemberships.find(
      (membership) => membership.tenantId === input.currentTenantId
    );
    if (selectedTenant) {
      return {
        state: "TENANT_SELECTED",
        selectedTenantId: selectedTenant.tenantId,
        memberships: mappedMemberships,
      };
    }

    return {
      state: "TENANT_SELECTION_REQUIRED",
      selectedTenantId: null,
      memberships: mappedMemberships,
    };
  }

  async selectTenantContext(input: {
    requesterAccountId: string;
    tenantId: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    context: { tenantId: string; branchId: null };
  }> {
    const tenantId = String(input.tenantId ?? "").trim();
    if (!tenantId) {
      throw new V0AuthError(422, "tenantId is required");
    }

    const account = await this.repo.findAccountById(input.requesterAccountId);
    if (!account || account.status !== "ACTIVE") {
      throw new V0AuthError(401, "account is not active");
    }

    const membership = await this.repo.findActiveMembership(input.requesterAccountId, tenantId);
    if (!membership) {
      throw new V0AuthError(403, "no active membership for tenant");
    }

    const context = { tenantId, branchId: null as null };
    const issued = await this.issueSessionTokens(input.requesterAccountId, context);

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      phone: account.phone,
      eventKey: "AUTH_CONTEXT_TENANT_SELECTED",
      outcome: "SUCCESS",
      metadata: {
        tenantId,
      },
    });

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      context,
    };
  }

  async listBranchContext(input: {
    requesterAccountId: string;
    currentTenantId: string | null;
    currentBranchId: string | null;
  }): Promise<{
    state: BranchSelectionState;
    tenantId: string | null;
    selectedBranchId: string | null;
    branches: Array<{ branchId: string; branchName: string }>;
  }> {
    if (!input.currentTenantId) {
      return {
        state: "TENANT_CONTEXT_REQUIRED",
        tenantId: null,
        selectedBranchId: null,
        branches: [],
      };
    }

    const membership = await this.repo.findActiveMembership(
      input.requesterAccountId,
      input.currentTenantId
    );
    if (!membership) {
      throw new V0AuthError(403, "no active membership for tenant");
    }

    const branches = await this.repo.listEligibleBranchesForAccountInTenant({
      accountId: input.requesterAccountId,
      tenantId: input.currentTenantId,
    });
    const mappedBranches = branches.map((branch) => ({
      branchId: branch.branch_id,
      branchName: branch.branch_name,
    }));

    if (mappedBranches.length === 0) {
      return {
        state: "NO_BRANCH_ASSIGNED",
        tenantId: input.currentTenantId,
        selectedBranchId: null,
        branches: [],
      };
    }

    if (mappedBranches.length === 1) {
      return {
        state: "BRANCH_AUTO_SELECTED",
        tenantId: input.currentTenantId,
        selectedBranchId: mappedBranches[0].branchId,
        branches: mappedBranches,
      };
    }

    const selected = mappedBranches.find(
      (branch) => branch.branchId === input.currentBranchId
    );
    if (selected) {
      return {
        state: "BRANCH_SELECTED",
        tenantId: input.currentTenantId,
        selectedBranchId: selected.branchId,
        branches: mappedBranches,
      };
    }

    return {
      state: "BRANCH_SELECTION_REQUIRED",
      tenantId: input.currentTenantId,
      selectedBranchId: null,
      branches: mappedBranches,
    };
  }

  async selectBranchContext(input: {
    requesterAccountId: string;
    tenantId: string | null;
    branchId: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    context: { tenantId: string; branchId: string };
  }> {
    const tenantId = String(input.tenantId ?? "").trim();
    const branchId = String(input.branchId ?? "").trim();
    if (!tenantId) {
      throw new V0AuthError(409, "tenant context is required");
    }
    if (!branchId) {
      throw new V0AuthError(422, "branchId is required");
    }

    const account = await this.repo.findAccountById(input.requesterAccountId);
    if (!account || account.status !== "ACTIVE") {
      throw new V0AuthError(401, "account is not active");
    }

    const membership = await this.repo.findActiveMembership(input.requesterAccountId, tenantId);
    if (!membership) {
      throw new V0AuthError(403, "no active membership for tenant");
    }

    const eligibleBranches = await this.repo.listEligibleBranchesForAccountInTenant({
      accountId: input.requesterAccountId,
      tenantId,
    });
    const isEligible = eligibleBranches.some((branch) => branch.branch_id === branchId);
    if (!isEligible) {
      throw new V0AuthError(403, "no active branch assignment for branch");
    }

    const context = { tenantId, branchId };
    const issued = await this.issueSessionTokens(input.requesterAccountId, context);

    await this.writeAuditEventBestEffort({
      accountId: input.requesterAccountId,
      phone: account.phone,
      eventKey: "AUTH_CONTEXT_BRANCH_SELECTED",
      outcome: "SUCCESS",
      metadata: {
        tenantId,
        branchId,
      },
    });

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      context,
    };
  }
}

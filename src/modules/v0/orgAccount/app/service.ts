import { V0OrgAccountRepository } from "../infra/repository.js";

export class V0OrgAccountError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "V0OrgAccountError";
  }
}

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

export class V0OrgAccountService {
  private readonly tenantCountPerAccountHard = parsePositiveInt(
    process.env.V0_TENANT_COUNT_PER_ACCOUNT_HARD,
    10
  );

  private readonly tenantProvisionRateLimit = parsePositiveInt(
    process.env.V0_TENANT_PROVISION_RATE_LIMIT,
    5
  );

  private readonly tenantProvisionRateWindowSeconds = parsePositiveInt(
    process.env.V0_TENANT_PROVISION_RATE_WINDOW_SECONDS,
    3600
  );

  constructor(private readonly repo: V0OrgAccountRepository) {}

  async getCurrentTenantProfile(input: { actor: ActorContext }) {
    const scope = assertTenantContext(input.actor);
    const tenant = await this.repo.findTenantProfileById(scope.tenantId);
    if (!tenant) {
      throw new V0OrgAccountError(404, "tenant not found");
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantAddress: tenant.address,
      contactNumber: tenant.contact_phone,
      logoUrl: tenant.logo_url,
      status: tenant.status,
    };
  }

  async listAccessibleBranches(input: { actor: ActorContext }) {
    const scope = assertTenantContext(input.actor);
    const branches = await this.repo.listAccessibleBranches({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
    });

    return branches.map((branch) => ({
      branchId: branch.id,
      tenantId: branch.tenant_id,
      branchName: branch.name,
      branchAddress: branch.address,
      contactNumber: branch.contact_phone,
      status: branch.status,
    }));
  }

  async getCurrentBranchProfile(input: { actor: ActorContext }) {
    const scope = assertBranchContext(input.actor);
    const hasAccess = await this.repo.hasActiveBranchAssignment({
      accountId: scope.accountId,
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    if (!hasAccess) {
      throw new V0OrgAccountError(403, "no active branch assignment for branch");
    }

    const branch = await this.repo.findBranchProfile({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
    });
    if (!branch) {
      throw new V0OrgAccountError(404, "branch not found");
    }

    return {
      branchId: branch.id,
      tenantId: branch.tenant_id,
      branchName: branch.name,
      branchAddress: branch.address,
      contactNumber: branch.contact_phone,
      status: branch.status,
    };
  }

  async createTenant(input: {
    requesterAccountId: string;
    tenantName: string;
    firstBranchName?: string;
  }): Promise<{
    tenant: { id: string; name: string; status: string };
    ownerMembership: { id: string; roleKey: string; status: string };
    branch: { id: string; name: string; status: string } | null;
  }> {
    const requesterAccountId = String(input.requesterAccountId ?? "").trim();
    const tenantName = String(input.tenantName ?? "").trim();
    const firstBranchName =
      typeof input.firstBranchName === "string" ? input.firstBranchName.trim() : "";

    if (!requesterAccountId) {
      throw new V0OrgAccountError(401, "authentication required");
    }
    if (!tenantName) {
      throw new V0OrgAccountError(422, "tenantName is required");
    }

    const requesterAccount = await this.repo.findAccountById(requesterAccountId);
    if (!requesterAccount || requesterAccount.status !== "ACTIVE") {
      throw new V0OrgAccountError(401, "account is not active");
    }

    const tenantProvisionAttemptCount = await this.repo.recordFairUseEventAndCountRecent({
      accountId: requesterAccountId,
      actionKey: "tenant.provision",
      windowSeconds: this.tenantProvisionRateWindowSeconds,
    });
    if (tenantProvisionAttemptCount > this.tenantProvisionRateLimit) {
      throw new V0OrgAccountError(
        429,
        "tenant provisioning is rate-limited; try again later",
        "FAIRUSE_RATE_LIMITED"
      );
    }

    const ownedTenantCount = await this.repo.countOwnerTenantMembershipsForAccount(
      requesterAccountId
    );
    if (ownedTenantCount >= this.tenantCountPerAccountHard) {
      throw new V0OrgAccountError(
        409,
        "tenant creation hard limit reached for this account",
        "FAIRUSE_HARD_LIMIT_EXCEEDED"
      );
    }

    const provisioned = await this.repo.createTenantWithOwnerAndOptionalFirstBranch({
      accountId: requesterAccountId,
      tenantName,
      firstBranchName: firstBranchName || null,
    });

    await this.repo.ensureStaffProfileForMembership(provisioned.membership_id);
    if (provisioned.branch_id) {
      await this.repo.upsertActiveBranchAssignmentsForMembership({
        membershipId: provisioned.membership_id,
        tenantId: provisioned.tenant_id,
        accountId: requesterAccountId,
        branchIds: [provisioned.branch_id],
      });
    }

    return {
      tenant: {
        id: provisioned.tenant_id,
        name: provisioned.tenant_name,
        status: provisioned.tenant_status,
      },
      ownerMembership: {
        id: provisioned.membership_id,
        roleKey: provisioned.membership_role_key,
        status: provisioned.membership_status,
      },
      branch: provisioned.branch_id && provisioned.branch_name && provisioned.branch_status
        ? {
          id: provisioned.branch_id,
          name: provisioned.branch_name,
          status: provisioned.branch_status,
        }
        : null,
    };
  }
}

function assertTenantContext(actor: ActorContext): {
  accountId: string;
  tenantId: string;
} {
  const accountId = String(actor.accountId ?? "").trim();
  const tenantId = String(actor.tenantId ?? "").trim();
  if (!accountId) {
    throw new V0OrgAccountError(401, "authentication required");
  }
  if (!tenantId) {
    throw new V0OrgAccountError(403, "tenant context required");
  }
  return { accountId, tenantId };
}

function assertBranchContext(actor: ActorContext): {
  accountId: string;
  tenantId: string;
  branchId: string;
} {
  const base = assertTenantContext(actor);
  const branchId = String(actor.branchId ?? "").trim();
  if (!branchId) {
    throw new V0OrgAccountError(403, "branch context required");
  }
  return {
    ...base,
    branchId,
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

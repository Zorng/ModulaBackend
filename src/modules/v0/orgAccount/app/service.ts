import { V0OrgAccountRepository } from "../infra/repository.js";

export class V0OrgAccountError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
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

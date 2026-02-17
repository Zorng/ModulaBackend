import { V0OrgAccountError, type OrgActorContext } from "../../common/error.js";
import { V0TenantRepository } from "../infra/repository.js";

export class V0TenantService {
  private readonly tenantCountPerAccountHard = parsePositiveInt(
    process.env.V0_FAIRUSE_TENANT_COUNT_PER_ACCOUNT_HARD ??
      process.env.V0_TENANT_COUNT_PER_ACCOUNT_HARD,
    10
  );

  private readonly tenantProvisionRateLimit = parsePositiveInt(
    process.env.V0_FAIRUSE_TENANT_PROVISION_RATE_LIMIT ??
      process.env.V0_TENANT_PROVISION_RATE_LIMIT,
    5
  );

  private readonly tenantProvisionRateWindowSeconds = parsePositiveInt(
    process.env.V0_FAIRUSE_TENANT_PROVISION_WINDOW_SECONDS ??
      process.env.V0_TENANT_PROVISION_RATE_WINDOW_SECONDS,
    3600
  );

  constructor(private readonly repo: V0TenantRepository) {}

  async getCurrentTenantProfile(input: { actor: OrgActorContext }) {
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

  async createTenant(input: {
    requesterAccountId: string;
    tenantName: string;
  }): Promise<{
    tenant: { id: string; name: string; status: string };
    ownerMembership: { id: string; roleKey: string; status: string };
    branch: null;
  }> {
    const requesterAccountId = String(input.requesterAccountId ?? "").trim();
    const tenantName = String(input.tenantName ?? "").trim();

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
      actionKey: "org.tenant.provision",
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

    const provisioned = await this.repo.createTenantWithOwnerMembership({
      accountId: requesterAccountId,
      tenantName,
    });

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
      branch: null,
    };
  }
}

function assertTenantContext(actor: OrgActorContext): {
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

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

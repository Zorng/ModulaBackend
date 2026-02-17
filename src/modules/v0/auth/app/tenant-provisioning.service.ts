import { V0AuthBaseService } from "./base.service.js";
import { V0AuthError } from "./common.js";

export class V0AuthTenantProvisioningService extends V0AuthBaseService {
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
      throw new V0AuthError(401, "authentication required");
    }
    if (!tenantName) {
      throw new V0AuthError(422, "tenantName is required");
    }

    const requesterAccount = await this.repo.findAccountById(requesterAccountId);
    if (!requesterAccount || requesterAccount.status !== "ACTIVE") {
      throw new V0AuthError(401, "account is not active");
    }

    const tenantProvisionAttemptCount = await this.repo.recordFairUseEventAndCountRecent({
      accountId: requesterAccountId,
      actionKey: "tenant.provision",
      windowSeconds: this.tenantProvisionRateWindowSeconds,
    });
    if (tenantProvisionAttemptCount > this.tenantProvisionRateLimit) {
      throw new V0AuthError(
        429,
        "tenant provisioning is rate-limited; try again later",
        "FAIRUSE_RATE_LIMITED"
      );
    }

    const ownedTenantCount = await this.repo.countOwnerTenantMembershipsForAccount(
      requesterAccountId
    );
    if (ownedTenantCount >= this.tenantCountPerAccountHard) {
      throw new V0AuthError(
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

    await this.writeAuditEventBestEffort({
      accountId: requesterAccountId,
      phone: requesterAccount.phone,
      eventKey: "TENANT_CREATED",
      outcome: "SUCCESS",
      metadata: {
        tenantId: provisioned.tenant_id,
        branchId: provisioned.branch_id,
        membershipId: provisioned.membership_id,
      },
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

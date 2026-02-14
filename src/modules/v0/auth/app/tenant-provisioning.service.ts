import { V0AuthBaseService } from "./base.service.js";
import { V0AuthError } from "./common.js";

export class V0AuthTenantProvisioningService extends V0AuthBaseService {
  async createTenantWithFirstBranch(input: {
    requesterAccountId: string;
    tenantName: string;
    firstBranchName: string;
  }): Promise<{
    tenant: { id: string; name: string; status: string };
    ownerMembership: { id: string; roleKey: string; status: string };
    branch: { id: string; name: string; status: string };
  }> {
    const requesterAccountId = String(input.requesterAccountId ?? "").trim();
    const tenantName = String(input.tenantName ?? "").trim();
    const firstBranchName = String(input.firstBranchName ?? "").trim();

    if (!requesterAccountId) {
      throw new V0AuthError(401, "authentication required");
    }
    if (!tenantName || !firstBranchName) {
      throw new V0AuthError(422, "tenantName and firstBranchName are required");
    }

    const requesterAccount = await this.repo.findAccountById(requesterAccountId);
    if (!requesterAccount || requesterAccount.status !== "ACTIVE") {
      throw new V0AuthError(401, "account is not active");
    }

    const provisioned = await this.repo.createTenantWithOwnerAndFirstBranch({
      accountId: requesterAccountId,
      tenantName,
      firstBranchName,
    });
    await this.repo.ensureStaffProfileForMembership(provisioned.membership_id);
    await this.repo.upsertActiveBranchAssignmentsForMembership({
      membershipId: provisioned.membership_id,
      tenantId: provisioned.tenant_id,
      accountId: requesterAccountId,
      branchIds: [provisioned.branch_id],
    });

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
      branch: {
        id: provisioned.branch_id,
        name: provisioned.branch_name,
        status: provisioned.branch_status,
      },
    };
  }
}

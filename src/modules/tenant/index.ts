import type { Pool } from "pg";
import type { AuthMiddlewarePort } from "../../platform/security/auth.js";
import type { BranchProvisioningPort } from "../../shared/ports/branch.js";
import type {
  MembershipProvisioningPort,
  PolicyDefaultsPort,
  TenantMetadataPort,
} from "../../shared/ports/tenant.js";
import type { AuditWriterPort } from "../../shared/ports/audit.js";
import {
  createTenantProvisioningPort,
  TenantProvisioningService,
} from "./app/tenant-provisioning.service.js";
import { TenantService } from "./app/tenant.service.js";
import { createTenantRouter } from "./api/router.js";
import { TenantRepository } from "./infra/repository.js";

export function bootstrapTenantModule(
  pool: Pool,
  deps: {
    membershipProvisioningPort: MembershipProvisioningPort;
    branchProvisioningPort: BranchProvisioningPort;
    policyDefaultsPort: PolicyDefaultsPort;
    auditWriterPort: AuditWriterPort;
  }
) {
  const repo = new TenantRepository(pool);
  const service = new TenantService(repo, deps.auditWriterPort);
  const provisioningService = new TenantProvisioningService(
    pool,
    repo,
    deps.auditWriterPort,
    deps.membershipProvisioningPort,
    deps.branchProvisioningPort,
    deps.policyDefaultsPort
  );
  const tenantProvisioningPort = createTenantProvisioningPort(provisioningService);
  const tenantMetadataPort: TenantMetadataPort = {
    getTenantMetadata: async (tenantId: string) => {
      const metadata = await service.getMetadata(tenantId);
      return {
        id: metadata.id,
        name: metadata.name,
        logo_url: metadata.logo_url ?? null,
        status: metadata.status,
      };
    },
  };

  return {
    service,
    tenantProvisioningPort,
    tenantMetadataPort,
    createRouter: (auth: AuthMiddlewarePort) => createTenantRouter(service, auth),
  };
}

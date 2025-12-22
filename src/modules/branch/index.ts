import type { Pool } from "pg";
import type { AuthMiddlewarePort } from "../../platform/security/auth.js";
import type {
  BranchGuardPort,
  BranchProvisioningPort,
  BranchQueryPort,
} from "../../shared/ports/branch.js";
import { BranchService } from "./app/branch.service.js";
import { createBranchRouter } from "./api/router.js";
import { BranchRepository } from "./infra/repository.js";

export function bootstrapBranchModule(pool: Pool) {
  const repo = new BranchRepository(pool);
  const service = new BranchService(repo);

  const branchProvisioningPort: BranchProvisioningPort = {
    provisionBranch: async (params) => {
      const branch = await service.provisionBranch({
        client: params.client,
        tenantId: params.tenantId,
        name: params.name,
        address: params.address ?? null,
        contact_phone: params.contact_phone ?? null,
        contact_email: params.contact_email ?? null,
      });
      return branch;
    },
  };

  const branchQueryPort: BranchQueryPort = {
    getBranch: async (params) => service.getBranch(params),
  };

  const branchGuardPort: BranchGuardPort = {
    assertBranchActive: async (params) => service.assertBranchActive(params),
  };

  return {
    service,
    branchProvisioningPort,
    branchQueryPort,
    branchGuardPort,
    createRouter: (auth: AuthMiddlewarePort) => createBranchRouter(service, auth),
  };
}


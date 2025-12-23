import type { Pool } from "pg";
import type { AuthMiddlewarePort } from "../../platform/security/auth.js";
import type { AuditWriterPort } from "../../shared/ports/audit.js";
import type { BranchGuardPort } from "../../shared/ports/branch.js";
import type { TransactionManager } from "../../platform/db/transactionManager.js";
import { PgSalesRepository } from "../sales/infra/repository/sales.repository.js";
import { PolicyAdapter } from "../sales/infra/adapters/policy.adapter.js";
import { MenuAdapter } from "../sales/infra/adapters/menu.adapter.js";
import { OfflineSyncService } from "./app/offlineSync.service.js";
import { createOfflineSyncRouter } from "./api/router.js";
import { PgOfflineSyncOperationsRepository } from "./infra/repository.js";

export function bootstrapOfflineSyncModule(
  pool: Pool,
  txManager: TransactionManager,
  authMiddleware: AuthMiddlewarePort,
  deps: {
    branchGuardPort: BranchGuardPort;
    auditWriterPort: AuditWriterPort;
  }
) {
  const repo = new PgOfflineSyncOperationsRepository(pool);

  // Reuse Sales read-ports for server-authoritative pricing/policies.
  const salesRepo = new PgSalesRepository(pool);
  const policyPort = new PolicyAdapter(pool);
  const menuPort = new MenuAdapter(pool);

  const service = new OfflineSyncService(
    repo,
    txManager,
    deps.branchGuardPort,
    deps.auditWriterPort,
    salesRepo,
    policyPort,
    menuPort
  );

  const router = createOfflineSyncRouter(service, authMiddleware);

  return { router, service };
}


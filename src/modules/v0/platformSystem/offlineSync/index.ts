import type { Pool } from "pg";
import { TransactionManager } from "../../../../platform/db/transactionManager.js";
import { createV0OfflineSyncRouter } from "./api/router.js";
import { V0OfflineSyncService } from "./app/service.js";
import { V0OfflineSyncRepository } from "./infra/repository.js";

export function bootstrapV0OfflineSyncModule(pool: Pool) {
  const repo = new V0OfflineSyncRepository(pool);
  const service = new V0OfflineSyncService(repo);
  const transactionManager = new TransactionManager(pool);
  const router = createV0OfflineSyncRouter({
    service,
    transactionManager,
  });
  return { repo, service, router };
}

export { V0OfflineSyncService } from "./app/service.js";
export { V0OfflineSyncRepository } from "./infra/repository.js";
export { V0_OFFLINE_SYNC_ACTION_KEYS } from "./app/command-contract.js";

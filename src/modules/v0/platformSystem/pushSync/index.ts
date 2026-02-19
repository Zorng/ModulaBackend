import type { Pool } from "pg";
import { TransactionManager } from "../../../../platform/db/transactionManager.js";
import { createV0PushSyncRouter } from "./api/router.js";
import { V0PushSyncService } from "./app/service.js";
import { V0PushSyncRepository } from "./infra/repository.js";

export function bootstrapV0PushSyncModule(pool: Pool) {
  const repo = new V0PushSyncRepository(pool);
  const service = new V0PushSyncService(repo);
  const transactionManager = new TransactionManager(pool);
  const router = createV0PushSyncRouter({
    service,
    transactionManager,
  });
  return { repo, service, router };
}

export { V0PushSyncService } from "./app/service.js";
export { V0PushSyncRepository } from "./infra/repository.js";
export { V0_PUSH_SYNC_ACTION_KEYS } from "./app/command-contract.js";

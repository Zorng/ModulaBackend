import type { Pool } from "pg";
import { createV0PullSyncRouter } from "./api/router.js";
import { V0PullSyncService } from "./app/service.js";
import { V0PullSyncRepository } from "./infra/repository.js";

export function bootstrapV0PullSyncModule(pool: Pool) {
  const repo = new V0PullSyncRepository(pool);
  const service = new V0PullSyncService(repo);
  const router = createV0PullSyncRouter(service);
  return { repo, service, router };
}

export { V0PullSyncService } from "./app/service.js";
export { V0PullSyncRepository } from "./infra/repository.js";
export { V0_PULL_SYNC_MODULE_KEYS } from "./app/command-contract.js";

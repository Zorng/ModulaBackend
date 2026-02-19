import type { Pool } from "pg";
import { createV0SyncRouter } from "./api/router.js";
import { V0SyncService } from "./app/service.js";
import { V0SyncRepository } from "./infra/repository.js";

export function bootstrapV0SyncModule(pool: Pool) {
  const repo = new V0SyncRepository(pool);
  const service = new V0SyncService(repo);
  const router = createV0SyncRouter(service);
  return { repo, service, router };
}

export { V0SyncService } from "./app/service.js";
export { V0SyncRepository } from "./infra/repository.js";
export { V0_SYNC_MODULE_KEYS } from "./app/command-contract.js";

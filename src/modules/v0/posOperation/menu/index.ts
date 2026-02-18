import type { Pool } from "pg";
import { V0IdempotencyRepository } from "../../../../platform/idempotency/repository.js";
import { V0IdempotencyService } from "../../../../platform/idempotency/service.js";
import { createV0MenuRouter } from "./api/router.js";
import {
  V0_MENU_ACTION_KEYS,
  V0_MENU_EVENT_TYPES,
  V0_MENU_IDEMPOTENCY_SCOPE,
  buildMenuCommandDedupeKey,
} from "./app/command-contract.js";
import { V0MenuService } from "./app/service.js";
import { V0MenuRepository } from "./infra/repository.js";

export function bootstrapV0MenuModule(pool: Pool) {
  const repo = new V0MenuRepository(pool);
  const service = new V0MenuService(repo);
  const idempotencyRepo = new V0IdempotencyRepository(pool);
  const idempotencyService = new V0IdempotencyService(idempotencyRepo);
  const router = createV0MenuRouter({
    service,
    idempotencyService,
    db: pool,
  });
  return { repo, service, router };
}

export { V0MenuError } from "./app/service.js";
export { V0MenuRepository } from "./infra/repository.js";
export {
  V0_MENU_ACTION_KEYS,
  V0_MENU_EVENT_TYPES,
  V0_MENU_IDEMPOTENCY_SCOPE,
  buildMenuCommandDedupeKey,
};

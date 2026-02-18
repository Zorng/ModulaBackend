import type { Pool } from "pg";
import { V0IdempotencyRepository } from "../../../../platform/idempotency/repository.js";
import { V0IdempotencyService } from "../../../../platform/idempotency/service.js";
import { createV0PolicyRouter } from "./api/router.js";
import { V0PolicyService } from "./app/service.js";
import { V0PolicyRepository } from "./infra/repository.js";

export function bootstrapV0PolicyModule(pool: Pool) {
  const repo = new V0PolicyRepository(pool);
  const service = new V0PolicyService(repo);
  const idempotencyRepo = new V0IdempotencyRepository(pool);
  const idempotencyService = new V0IdempotencyService(idempotencyRepo);
  const router = createV0PolicyRouter({
    service,
    idempotencyService,
    db: pool,
  });
  return { repo, service, router };
}

export { V0PolicyError } from "./app/service.js";
export { V0PolicyRepository } from "./infra/repository.js";
export {
  V0_POLICY_ACTION_KEYS,
  V0_POLICY_EVENT_TYPES,
  buildPolicyCommandDedupeKey,
} from "./app/command-contract.js";

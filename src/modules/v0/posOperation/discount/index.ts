import type { Pool } from "pg";
import { V0IdempotencyRepository } from "../../../../platform/idempotency/repository.js";
import { V0IdempotencyService } from "../../../../platform/idempotency/service.js";
import { createV0DiscountRouter } from "./api/router.js";
import { V0DiscountService } from "./app/service.js";
import { V0DiscountRepository } from "./infra/repository.js";

export function bootstrapV0DiscountModule(pool: Pool) {
  const repo = new V0DiscountRepository(pool);
  const service = new V0DiscountService(repo);
  const idempotencyRepo = new V0IdempotencyRepository(pool);
  const idempotencyService = new V0IdempotencyService(idempotencyRepo);
  const router = createV0DiscountRouter({
    service,
    idempotencyService,
    db: pool,
  });
  return { repo, service, router };
}

export { V0DiscountError } from "./app/service.js";
export { V0DiscountRepository } from "./infra/repository.js";
export {
  V0_DISCOUNT_ACTION_KEYS,
  V0_DISCOUNT_EVENT_TYPES,
  V0_DISCOUNT_IDEMPOTENCY_SCOPE,
  buildDiscountCommandDedupeKey,
} from "./app/command-contract.js";

import type { Pool } from "pg";
import { V0IdempotencyRepository } from "../../../../platform/idempotency/repository.js";
import { V0IdempotencyService } from "../../../../platform/idempotency/service.js";
import { createV0ShiftRouter } from "./api/router.js";
import { V0ShiftService } from "./app/service.js";
import { V0ShiftRepository } from "./infra/repository.js";

export function bootstrapV0ShiftModule(pool: Pool) {
  const repo = new V0ShiftRepository(pool);
  const service = new V0ShiftService(repo);
  const idempotencyRepo = new V0IdempotencyRepository(pool);
  const idempotencyService = new V0IdempotencyService(idempotencyRepo);
  const router = createV0ShiftRouter({
    service,
    idempotencyService,
    db: pool,
  });
  return { repo, service, router };
}

export { V0ShiftError } from "./app/service.js";
export { V0ShiftRepository } from "./infra/repository.js";
export {
  V0_SHIFT_ACTION_KEYS,
  V0_SHIFT_EVENT_TYPES,
  V0_SHIFT_IDEMPOTENCY_SCOPE,
  buildShiftCommandDedupeKey,
} from "./app/command-contract.js";

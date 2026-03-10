import type { Pool } from "pg";
import { V0IdempotencyRepository } from "../../../../platform/idempotency/repository.js";
import { V0IdempotencyService } from "../../../../platform/idempotency/service.js";
import { createV0CashSessionRouter } from "./api/router.js";
import { registerCashSessionSubscribers } from "./app/subscribers.js";
import { V0CashSessionService } from "./app/service.js";
import { V0CashSessionRepository } from "./infra/repository.js";

export function bootstrapV0CashSessionModule(pool: Pool) {
  const repo = new V0CashSessionRepository(pool);
  const service = new V0CashSessionService(repo);
  registerCashSessionSubscribers(pool);
  const idempotencyRepo = new V0IdempotencyRepository(pool);
  const idempotencyService = new V0IdempotencyService(idempotencyRepo);
  const router = createV0CashSessionRouter({
    service,
    idempotencyService,
    db: pool,
  });
  return { repo, service, router };
}

export { V0CashSessionRepository } from "./infra/repository.js";
export { V0CashSessionError } from "./app/service.js";
export {
  V0_CASH_SESSION_ACTION_KEYS,
  V0_CASH_SESSION_EVENT_TYPES,
  V0_CASH_SESSION_IDEMPOTENCY_SCOPE,
  buildCashSessionCommandDedupeKey,
  buildSaleCashMovementAnchor,
} from "./app/command-contract.js";

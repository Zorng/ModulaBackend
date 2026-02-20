import type { Pool } from "pg";
import { V0IdempotencyRepository } from "../../../../platform/idempotency/repository.js";
import { V0IdempotencyService } from "../../../../platform/idempotency/service.js";
import { createV0KhqrPaymentRouter } from "./api/router.js";
import {
  StubV0KhqrPaymentProvider,
  buildV0KhqrPaymentProviderFromEnv,
  type V0KhqrPaymentProvider,
} from "./app/payment-provider.js";
import { V0KhqrPaymentService } from "./app/service.js";
import { V0KhqrPaymentRepository } from "./infra/repository.js";
import { startV0KhqrReconciliationDispatcher } from "./app/reconciliation-dispatcher.js";

export function bootstrapV0KhqrPaymentModule(pool: Pool) {
  const repo = new V0KhqrPaymentRepository(pool);
  const provider = buildV0KhqrPaymentProviderFromEnv();
  const service = new V0KhqrPaymentService(repo, provider);
  const idempotencyService = new V0IdempotencyService(new V0IdempotencyRepository(pool));
  const router = createV0KhqrPaymentRouter({
    service,
    provider,
    idempotencyService,
    db: pool,
  });
  return { repo, provider, service, router };
}

export { V0KhqrPaymentRepository } from "./infra/repository.js";
export { V0KhqrPaymentService, V0KhqrPaymentError } from "./app/service.js";
export { startV0KhqrReconciliationDispatcher } from "./app/reconciliation-dispatcher.js";
export {
  type V0KhqrPaymentProvider,
  V0KhqrProviderError,
  StubV0KhqrPaymentProvider,
} from "./app/payment-provider.js";
export { V0_KHQR_PAYMENT_ACTION_KEYS } from "./app/command-contract.js";

import type { Pool } from "pg";
import { V0IdempotencyRepository } from "../../../../platform/idempotency/repository.js";
import { V0IdempotencyService } from "../../../../platform/idempotency/service.js";
import { createV0ReceiptRouter } from "./api/router.js";
import { V0ReceiptService } from "./app/service.js";
import { V0ReceiptRepository } from "./infra/repository.js";

export function bootstrapV0ReceiptModule(pool: Pool) {
  const repo = new V0ReceiptRepository(pool);
  const service = new V0ReceiptService(repo);
  const idempotencyRepo = new V0IdempotencyRepository(pool);
  const idempotencyService = new V0IdempotencyService(idempotencyRepo);
  const router = createV0ReceiptRouter({
    service,
    idempotencyService,
    db: pool,
  });
  return { repo, service, router };
}

export { V0ReceiptRepository } from "./infra/repository.js";
export { V0ReceiptService, V0ReceiptError } from "./app/service.js";
export { buildSaleReceiptPreview, type V0SaleReceiptPreview } from "./app/preview.js";
export {
  deriveSaleReceiptNumber,
  formatReceiptNumber,
  resolveReceiptIssuedAt,
} from "./app/reference.js";
export {
  V0_RECEIPT_ACTION_KEYS,
  V0_RECEIPT_EVENT_TYPES,
  V0_RECEIPT_IDEMPOTENCY_SCOPE,
  buildReceiptCommandDedupeKey,
  buildReceiptPrintAnchor,
  type ReceiptCommandOutcome,
  type ReceiptPrintPurpose,
} from "./app/command-contract.js";

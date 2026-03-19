import type { Pool } from "pg";
import { V0IdempotencyRepository } from "../../../../platform/idempotency/repository.js";
import { V0IdempotencyService } from "../../../../platform/idempotency/service.js";
import { V0MediaUploadRepository } from "../../../../platform/media-uploads/repository.js";
import { createV0SaleOrderRouter } from "./api/router.js";
import { V0SaleOrderService } from "./app/service.js";
import { buildV0KhqrPaymentProviderFromEnv } from "../../platformSystem/khqrPayment/app/payment-provider.js";
export { V0SaleOrderRepository } from "./infra/repository.js";
import { V0SaleOrderRepository } from "./infra/repository.js";
export type {
  V0OrderFulfillmentBatchRow,
  V0OrderFulfillmentBatchStatus,
  V0OrderTicketLineRow,
  V0OrderTicketRow,
  V0OrderTicketStatus,
  V0SaleLineRow,
  V0SalePaymentMethod,
  V0SaleRow,
  V0SaleStatus,
  V0TenderCurrency,
  V0VoidRequestRow,
  V0VoidRequestStatus,
} from "./infra/repository.js";
export {
  V0_SALE_ORDER_ACTION_KEYS,
  V0_SALE_ORDER_EVENT_TYPES,
  V0_SALE_ORDER_IDEMPOTENCY_SCOPE,
  V0_SALE_ORDER_PUSH_SYNC_OPERATION_TYPES,
  buildSaleFinalizeAnchor,
  buildSaleOrderCommandDedupeKey,
  buildSaleVoidExecuteAnchor,
  buildSaleVoidRequestAnchor,
  type V0SaleOrderPushSyncOperationType,
} from "./app/command-contract.js";
export { V0SaleOrderError } from "./app/service.js";

export function bootstrapV0SaleOrderModule(pool: Pool) {
  const repo = new V0SaleOrderRepository(pool);
  const mediaUploadsRepo = new V0MediaUploadRepository(pool);
  const service = new V0SaleOrderService(repo, mediaUploadsRepo);
  const idempotencyRepo = new V0IdempotencyRepository(pool);
  const idempotencyService = new V0IdempotencyService(idempotencyRepo);
  const khqrProvider = buildV0KhqrPaymentProviderFromEnv();
  const router = createV0SaleOrderRouter({
    service,
    idempotencyService,
    khqrProvider,
    db: pool,
  });
  return { repo, service, router };
}

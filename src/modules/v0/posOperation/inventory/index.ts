import type { Pool } from "pg";
import { V0IdempotencyRepository } from "../../../../platform/idempotency/repository.js";
import { V0IdempotencyService } from "../../../../platform/idempotency/service.js";
import { createV0InventoryRouter } from "./api/router.js";
import { V0InventoryService } from "./app/service.js";
import { V0InventoryRepository } from "./infra/repository.js";

export function bootstrapV0InventoryModule(pool: Pool) {
  const repo = new V0InventoryRepository(pool);
  const service = new V0InventoryService(repo);
  const idempotencyRepo = new V0IdempotencyRepository(pool);
  const idempotencyService = new V0IdempotencyService(idempotencyRepo);
  const router = createV0InventoryRouter({
    service,
    idempotencyService,
    db: pool,
  });
  return { repo, service, router };
}

export { V0InventoryError } from "./app/service.js";
export { V0InventoryRepository } from "./infra/repository.js";
export {
  V0_INVENTORY_ACTION_KEYS,
  V0_INVENTORY_EVENT_TYPES,
  V0_INVENTORY_PUSH_SYNC_OPERATION_TYPES,
  buildInventoryCommandDedupeKey,
  buildInventoryExternalMovementSourceIdentity,
  type V0InventoryPushSyncOperationType,
} from "./app/command-contract.js";
export type {
  InventoryAggregateStockViewRow,
  InventoryBranchStockRow,
  InventoryBranchStockViewRow,
  InventoryDirection,
  InventoryJournalEntryRow,
  InventoryReasonCode,
  InventoryRestockBatchRow,
  InventorySourceType,
  InventoryStatus,
  InventoryStockCategoryRow,
  InventoryStockItemRow,
} from "./infra/repository.js";

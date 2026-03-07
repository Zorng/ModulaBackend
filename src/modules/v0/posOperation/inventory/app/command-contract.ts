import {
  buildCommandDedupeKey,
  type CommandOutcome,
} from "../../../../../shared/utils/dedupe.js";

export type InventoryCommandOutcome = CommandOutcome;

export const V0_INVENTORY_ACTION_KEYS = {
  categoriesList: "inventory.categories.list",
  categoriesCreate: "inventory.categories.create",
  categoriesUpdate: "inventory.categories.update",
  categoriesArchive: "inventory.categories.archive",
  itemsList: "inventory.items.list",
  itemsRead: "inventory.items.read",
  itemsCreate: "inventory.items.create",
  itemsUpdate: "inventory.items.update",
  itemsArchive: "inventory.items.archive",
  itemsRestore: "inventory.items.restore",
  restockBatchesList: "inventory.restockBatches.list",
  restockBatchesCreate: "inventory.restockBatches.create",
  restockBatchesUpdateMeta: "inventory.restockBatches.updateMeta",
  restockBatchesArchive: "inventory.restockBatches.archive",
  adjustmentsApply: "inventory.adjustments.apply",
  journalList: "inventory.journal.list",
  journalListAll: "inventory.journal.listAll",
  stockBranchRead: "inventory.stock.branch.read",
  stockAggregateRead: "inventory.stock.aggregate.read",
  externalSaleDeductionApply: "inventory.external.saleDeduction.apply",
  externalVoidReversalApply: "inventory.external.voidReversal.apply",
} as const;

export const V0_INVENTORY_EVENT_TYPES = {
  stockCategoryCreated: "INVENTORY_STOCK_CATEGORY_CREATED",
  stockCategoryUpdated: "INVENTORY_STOCK_CATEGORY_UPDATED",
  stockCategoryArchived: "INVENTORY_STOCK_CATEGORY_ARCHIVED",
  stockItemCreated: "INVENTORY_STOCK_ITEM_CREATED",
  stockItemUpdated: "INVENTORY_STOCK_ITEM_UPDATED",
  stockItemArchived: "INVENTORY_STOCK_ITEM_ARCHIVED",
  stockItemRestored: "INVENTORY_STOCK_ITEM_RESTORED",
  restockBatchRecorded: "INVENTORY_RESTOCK_BATCH_RECORDED",
  restockBatchMetadataUpdated: "INVENTORY_RESTOCK_BATCH_METADATA_UPDATED",
  restockBatchArchived: "INVENTORY_RESTOCK_BATCH_ARCHIVED",
  movementAppended: "INVENTORY_MOVEMENT_APPENDED",
  adjustmentRecorded: "INVENTORY_ADJUSTMENT_RECORDED",
  externalDeductionApplied: "INVENTORY_EXTERNAL_DEDUCTION_APPLIED",
  externalReversalApplied: "INVENTORY_EXTERNAL_REVERSAL_APPLIED",
} as const;

export const V0_INVENTORY_PUSH_SYNC_OPERATION_TYPES = [
  "inventory.category.create",
  "inventory.category.update",
  "inventory.category.archive",
  "inventory.stockItem.create",
  "inventory.stockItem.update",
  "inventory.stockItem.archive",
  "inventory.stockItem.restore",
  "inventory.restockBatch.create",
  "inventory.restockBatch.updateMeta",
  "inventory.restockBatch.archive",
  "inventory.adjustment.apply",
  "inventory.external.saleDeduction.apply",
  "inventory.external.voidReversal.apply",
] as const;

export type V0InventoryPushSyncOperationType =
  (typeof V0_INVENTORY_PUSH_SYNC_OPERATION_TYPES)[number];

export function buildInventoryCommandDedupeKey(
  actionKey: string,
  idempotencyKey: string | null | undefined,
  outcome: InventoryCommandOutcome,
  parts?: ReadonlyArray<unknown>
): string | null {
  return buildCommandDedupeKey({ actionKey, idempotencyKey, outcome, parts });
}

export function buildInventoryExternalMovementSourceIdentity(input: {
  sourceType: "SALE_ORDER";
  sourceId: string;
  stockItemId: string;
  reasonCode: "SALE_DEDUCTION" | "VOID_REVERSAL";
}): string {
  return [
    input.sourceType,
    input.sourceId,
    input.reasonCode,
    input.stockItemId,
  ].join(":");
}

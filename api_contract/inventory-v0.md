# Inventory Module (`/v0`) — API Contract

This document locks the target `/v0/inventory` HTTP contract for stock truth (ledger + projections).

Base path: `/v0/inventory`

Implementation status:
- Phase 1 contract lock completed.
- Endpoints below are target contract for rollout phases 2-4.

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "...", "details"?: {...} }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` / `branchId` come from working-context token.
  - no tenant/branch override via body/query/headers.
- Idempotency:
  - all write endpoints require `Idempotency-Key`.
  - duplicate replay returns stored response with `Idempotency-Replayed: true`.

## Types

```ts
type InventoryStatus = "ACTIVE" | "ARCHIVED";

type StockCategory = {
  id: string;
  tenantId: string;
  name: string;
  status: InventoryStatus;
  createdAt: string;
  updatedAt: string;
};

type StockItem = {
  id: string;
  tenantId: string;
  categoryId: string | null;
  name: string;
  baseUnit: string;
  imageUrl: string | null;
  lowStockThreshold: number | null; // in base unit
  status: InventoryStatus;
  createdAt: string;
  updatedAt: string;
};

type RestockBatch = {
  id: string;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  quantityInBaseUnit: number;
  status: InventoryStatus;
  receivedAt: string;
  expiryDate: string | null; // YYYY-MM-DD
  supplierName: string | null;
  purchaseCostUsd: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type InventoryJournalEntry = {
  id: string;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  direction: "IN" | "OUT";
  quantityInBaseUnit: number;
  reasonCode:
    | "RESTOCK"
    | "SALE_DEDUCTION"
    | "VOID_REVERSAL"
    | "ADJUSTMENT"
    | "OTHER";
  sourceType: "RESTOCK_BATCH" | "SALE_ORDER" | "ADJUSTMENT" | "SYSTEM";
  sourceId: string;
  occurredAt: string;
  note: string | null;
};

type BranchStockItem = {
  stockItemId: string;
  stockItemName: string;
  baseUnit: string;
  onHandInBaseUnit: number;
  lowStockThreshold: number | null;
  isLowStock: boolean;
};
```

## Endpoints

### Categories

- `GET /v0/inventory/categories`
- `POST /v0/inventory/categories`
- `PATCH /v0/inventory/categories/:categoryId`
- `POST /v0/inventory/categories/:categoryId/archive`

Action keys:
- `inventory.categories.list`
- `inventory.categories.create`
- `inventory.categories.update`
- `inventory.categories.archive`

### Stock items

- `GET /v0/inventory/items`
- `GET /v0/inventory/items/:stockItemId`
- `POST /v0/inventory/items`
- `PATCH /v0/inventory/items/:stockItemId`
- `POST /v0/inventory/items/:stockItemId/archive`
- `POST /v0/inventory/items/:stockItemId/restore`

Action keys:
- `inventory.items.list`
- `inventory.items.read`
- `inventory.items.create`
- `inventory.items.update`
- `inventory.items.archive`
- `inventory.items.restore`

### Restock batches

- `GET /v0/inventory/restock-batches`
- `POST /v0/inventory/restock-batches`
- `PATCH /v0/inventory/restock-batches/:batchId`
- `POST /v0/inventory/restock-batches/:batchId/archive`

Action keys:
- `inventory.restockBatches.list`
- `inventory.restockBatches.create`
- `inventory.restockBatches.updateMeta`
- `inventory.restockBatches.archive`

### Adjustments and journal

- `POST /v0/inventory/adjustments`
- `GET /v0/inventory/journal`
- `GET /v0/inventory/stock/branch`
- `GET /v0/inventory/stock/aggregate`

Action keys:
- `inventory.adjustments.apply`
- `inventory.journal.list`
- `inventory.stock.branch.read`
- `inventory.stock.aggregate.read`

## Offline-sync operation types (locked target)

```ts
type InventoryOfflineOperationType =
  | "inventory.category.create"
  | "inventory.category.update"
  | "inventory.category.archive"
  | "inventory.stockItem.create"
  | "inventory.stockItem.update"
  | "inventory.stockItem.archive"
  | "inventory.stockItem.restore"
  | "inventory.restockBatch.create"
  | "inventory.restockBatch.updateMeta"
  | "inventory.restockBatch.archive"
  | "inventory.adjustment.apply";
```

Cross-module (sale-order owned orchestration, inventory consumed):
- `inventory.external.saleDeduction.apply`
- `inventory.external.voidReversal.apply`

## Sync module scope (locked target)

- `moduleKey: "inventory"`

Expected inventory entity types in `/v0/sync/pull`:
- `inventory_stock_item`
- `inventory_stock_category`
- `inventory_restock_batch`
- `inventory_journal_entry`
- `inventory_branch_stock_projection`

## Deterministic reason codes (inventory baseline)

- `INVENTORY_STOCK_ITEM_NOT_FOUND`
- `INVENTORY_STOCK_ITEM_INACTIVE`
- `INVENTORY_STOCK_CATEGORY_NOT_FOUND`
- `INVENTORY_RESTOCK_BATCH_NOT_FOUND`
- `INVENTORY_RESTOCK_BATCH_ARCHIVED`
- `INVENTORY_BASE_UNIT_IMMUTABLE`
- `INVENTORY_QUANTITY_INVALID`
- `INVENTORY_ADJUSTMENT_INVALID`
- `INVENTORY_DUPLICATE_EXTERNAL_MOVEMENT`
- `INVENTORY_NEGATIVE_STOCK_BLOCKED`
- plus platform-level denials:
  - `BRANCH_FROZEN`
  - `SUBSCRIPTION_FROZEN`
  - `ENTITLEMENT_BLOCKED`
  - `ENTITLEMENT_READ_ONLY`
  - `NO_MEMBERSHIP`
  - `NO_BRANCH_ACCESS`
  - `PERMISSION_DENIED`
  - idempotency errors from `api_contract/idempotency-v0.md`

## Frontend notes

- Treat inventory as ledger-first:
  - on-hand values come from branch stock projection
  - history comes from journal
- For offline mode:
  - enqueue inventory writes with stable `clientOpId`
  - after replay success, run `/v0/sync/pull` with `moduleScopes: ["inventory"]`
- Restock metadata updates do not change stock quantity.


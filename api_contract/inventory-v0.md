# Inventory Module (`/v0`) — API Contract

This document defines the `/v0/inventory` HTTP contract for stock truth (ledger + projections).

Base path: `/v0/inventory`

Implementation status:
- Phase 1–5 completed (endpoints shipped on `/v0`).

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "...", "details"?: {...} }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` / `branchId` come from working-context token.
  - No tenant/branch override via query/body/headers.
- Idempotency:
  - All write endpoints require `Idempotency-Key` (see `api_contract/idempotency-v0.md`).
  - When idempotent replay happens, response includes `Idempotency-Replayed: true`.

## Access control (summary)

- Entitlement gate: `module.inventory`
- Tenant-catalog reads:
  - Categories/items: `OWNER|ADMIN|MANAGER`
- Tenant-catalog writes:
  - Categories/items: `OWNER|ADMIN`
- Branch operational reads:
  - Restock list, journal, branch stock: `OWNER|ADMIN|MANAGER`
- Branch operational writes:
  - Restock create: `OWNER|ADMIN|MANAGER`
  - Restock metadata update/archive + adjustments: `OWNER|ADMIN`

## Types

```ts
type InventoryStatus = "ACTIVE" | "ARCHIVED";

type StockCategory = {
  id: string;
  tenantId: string;
  name: string;
  status: InventoryStatus;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
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
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
};

type RestockBatch = {
  id: string;
  tenantId: string;
  branchId: string;
  stockItemId: string;
  quantityInBaseUnit: number;
  status: InventoryStatus;
  receivedAt: string; // ISO datetime
  expiryDate: string | null; // YYYY-MM-DD
  supplierName: string | null;
  purchaseCostUsd: number | null;
  note: string | null;
  createdByAccountId: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
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
  idempotencyKey: string;
  occurredAt: string; // ISO datetime
  actorAccountId: string | null;
  note: string | null;
  createdAt: string; // ISO datetime
};

type BranchStockItem = {
  stockItemId: string;
  stockItemName: string;
  baseUnit: string;
  onHandInBaseUnit: number;
  lowStockThreshold: number | null;
  isLowStock: boolean;
  updatedAt: string; // ISO datetime
};

type BranchStockProjection = {
  id: string; // `${branchId}:${stockItemId}`
  tenantId: string;
  branchId: string;
  stockItemId: string;
  onHandInBaseUnit: number;
  lastMovementAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
};
```

## Endpoints

### Categories (tenant-scoped catalog)

#### 1) List categories
`GET /v0/inventory/categories?status=active|archived|all`

Action key: `inventory.categories.list`

Response `200`:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "name": "Dairy",
      "status": "ACTIVE",
      "createdAt": "2026-02-20T00:00:00.000Z",
      "updatedAt": "2026-02-20T00:00:00.000Z"
    }
  ]
}
```

#### 2) Create category
`POST /v0/inventory/categories`

Headers:
- `Idempotency-Key: <string>`

Body:
```json
{ "name": "Dairy" }
```

Action key: `inventory.categories.create`

Response `200`: `StockCategory`

Errors:
- `409` `INVENTORY_STOCK_CATEGORY_DUPLICATE_NAME`

#### 3) Update category
`PATCH /v0/inventory/categories/:categoryId`

Headers:
- `Idempotency-Key: <string>`

Body:
```json
{ "name": "Packaging" }
```

Action key: `inventory.categories.update`

Errors:
- `404` `INVENTORY_STOCK_CATEGORY_NOT_FOUND`
- `409` `INVENTORY_STOCK_CATEGORY_DUPLICATE_NAME`

#### 4) Archive category (detaches items)
`POST /v0/inventory/categories/:categoryId/archive`

Headers:
- `Idempotency-Key: <string>`

Action key: `inventory.categories.archive`

Errors:
- `404` `INVENTORY_STOCK_CATEGORY_NOT_FOUND`

### Stock items (tenant-scoped catalog)

#### 5) List stock items
`GET /v0/inventory/items?status=active|archived|all&categoryId=uuid&search=string&limit=number&offset=number`

Action key: `inventory.items.list`

Response `200`: `StockItem[]`

#### 6) Read stock item
`GET /v0/inventory/items/:stockItemId`

Action key: `inventory.items.read`

Errors:
- `404` `INVENTORY_STOCK_ITEM_NOT_FOUND`

#### 7) Create stock item
`POST /v0/inventory/items`

Headers:
- `Idempotency-Key: <string>`

Body:
```json
{
  "name": "Milk",
  "baseUnit": "ml",
  "categoryId": null,
  "imageUrl": null,
  "lowStockThreshold": 1000
}
```

Action key: `inventory.items.create`

Errors:
- `404` `INVENTORY_STOCK_CATEGORY_NOT_FOUND` (if categoryId provided and invalid)
- `409` `INVENTORY_STOCK_ITEM_DUPLICATE_NAME`

#### 8) Update stock item
`PATCH /v0/inventory/items/:stockItemId`

Headers:
- `Idempotency-Key: <string>`

Body (any subset; at least 1 field required):
```json
{
  "name": "Whole Milk",
  "categoryId": "uuid", 
  "imageUrl": "https://...",
  "lowStockThreshold": 1200
}
```

Rules:
- `baseUnit` is immutable (a different value is rejected with `INVENTORY_BASE_UNIT_IMMUTABLE`).

Action key: `inventory.items.update`

Errors:
- `404` `INVENTORY_STOCK_ITEM_NOT_FOUND`
- `404` `INVENTORY_STOCK_CATEGORY_NOT_FOUND` (if categoryId provided and invalid)
- `409` `INVENTORY_BASE_UNIT_IMMUTABLE`

#### 9) Archive stock item
`POST /v0/inventory/items/:stockItemId/archive`

Headers:
- `Idempotency-Key: <string>`

Action key: `inventory.items.archive`

Errors:
- `404` `INVENTORY_STOCK_ITEM_NOT_FOUND`

#### 10) Restore stock item
`POST /v0/inventory/items/:stockItemId/restore`

Headers:
- `Idempotency-Key: <string>`

Action key: `inventory.items.restore`

Errors:
- `404` `INVENTORY_STOCK_ITEM_NOT_FOUND`

### Restock batches (branch-scoped operations)

#### 11) List restock batches
`GET /v0/inventory/restock-batches?status=active|archived|all&stockItemId=uuid&limit=number&offset=number`

Action key: `inventory.restockBatches.list`

Response `200`: `RestockBatch[]`

#### 12) Create restock batch (records journal + updates projection)
`POST /v0/inventory/restock-batches`

Headers:
- `Idempotency-Key: <string>`

Body:
```json
{
  "stockItemId": "uuid",
  "quantityInBaseUnit": 1200,
  "receivedAt": "2026-02-20T00:00:00.000Z",
  "expiryDate": "2026-03-01",
  "supplierName": "Supplier X",
  "purchaseCostUsd": 12.5,
  "note": "Initial restock"
}
```

Action key: `inventory.restockBatches.create`

Response `200`:
- `RestockBatch` plus:
  - `journalEntry: InventoryJournalEntry`
  - `branchStockProjection: BranchStockProjection`

Errors:
- `404` `INVENTORY_STOCK_ITEM_NOT_FOUND`
- `409` `INVENTORY_STOCK_ITEM_INACTIVE`
- `422` `INVENTORY_QUANTITY_INVALID`

#### 13) Update restock batch metadata (does not change stock quantity)
`PATCH /v0/inventory/restock-batches/:batchId`

Headers:
- `Idempotency-Key: <string>`

Body (any subset; at least 1 field required):
```json
{ "expiryDate": "2026-03-01", "supplierName": "Supplier X", "purchaseCostUsd": 12.5, "note": "Updated" }
```

Action key: `inventory.restockBatches.updateMeta`

Errors:
- `404` `INVENTORY_RESTOCK_BATCH_NOT_FOUND`
- `409` `INVENTORY_RESTOCK_BATCH_ARCHIVED`

#### 14) Archive restock batch
`POST /v0/inventory/restock-batches/:batchId/archive`

Headers:
- `Idempotency-Key: <string>`

Action key: `inventory.restockBatches.archive`

Errors:
- `404` `INVENTORY_RESTOCK_BATCH_NOT_FOUND`
- `409` `INVENTORY_RESTOCK_BATCH_ARCHIVED`

### Adjustments, journal, and stock views

#### 15) Apply adjustment (records journal + updates projection)
`POST /v0/inventory/adjustments`

Headers:
- `Idempotency-Key: <string>`

Body (style = `DELTA`):
```json
{
  "stockItemId": "uuid",
  "style": "DELTA",
  "deltaInBaseUnit": -250,
  "reasonCode": "WASTE",
  "note": "Spilled"
}
```

Body (style = `SET_TO_COUNT`):
```json
{
  "stockItemId": "uuid",
  "style": "SET_TO_COUNT",
  "countedOnHandInBaseUnit": 3000,
  "reasonCode": "COUNT_CORRECTION"
}
```

Action key: `inventory.adjustments.apply`

Response `200` (shape):
- adjustment summary (includes `direction`, `quantityInBaseUnit`, `reasonCode`, `resultingOnHandInBaseUnit`)
- includes `branchStockProjection: BranchStockProjection`

Errors:
- `404` `INVENTORY_STOCK_ITEM_NOT_FOUND`
- `409` `INVENTORY_STOCK_ITEM_INACTIVE`
- `422` `INVENTORY_ADJUSTMENT_INVALID`

#### 16) List inventory journal
`GET /v0/inventory/journal?stockItemId=uuid&reasonCode=RESTOCK|SALE_DEDUCTION|VOID_REVERSAL|ADJUSTMENT|OTHER&limit=number&offset=number`

Action key: `inventory.journal.list`

Response `200`: `InventoryJournalEntry[]`

#### 17) Read branch stock projection (fast read)
`GET /v0/inventory/stock/branch?includeArchivedItems=true|false`

Action key: `inventory.stock.branch.read`

Response `200`: `BranchStockItem[]`

#### 18) Read aggregate stock across active branches
`GET /v0/inventory/stock/aggregate?includeArchivedItems=true|false`

Action key: `inventory.stock.aggregate.read`

Response `200`:
```json
{
  "success": true,
  "data": [
    {
      "stockItemId": "uuid",
      "stockItemName": "Milk",
      "baseUnit": "ml",
      "totalOnHandInBaseUnit": 2000,
      "branchCount": 2
    }
  ]
}
```

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
- uniqueness errors:
  - `INVENTORY_STOCK_CATEGORY_DUPLICATE_NAME`
  - `INVENTORY_STOCK_ITEM_DUPLICATE_NAME`
- plus platform-level denials:
  - `BRANCH_FROZEN`
  - `SUBSCRIPTION_FROZEN`
  - `ENTITLEMENT_BLOCKED`
  - `ENTITLEMENT_READ_ONLY`
  - `NO_MEMBERSHIP`
  - `NO_BRANCH_ACCESS`
  - `PERMISSION_DENIED`
  - idempotency errors from `api_contract/idempotency-v0.md`

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
- Tenant-catalog writes (`categories/*`, `items/*`) are fanned out into each active branch sync stream.

Expected inventory entity types in `/v0/sync/pull`:
- `inventory_stock_item`
- `inventory_stock_category`
- `inventory_restock_batch`
- `inventory_journal_entry`
- `inventory_branch_stock_projection`


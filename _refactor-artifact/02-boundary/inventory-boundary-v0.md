# Inventory Module Boundary (v0)

Status: Phase 1 locked  
Owner context: `POSOperation`  
Canonical route prefix: `/v0/inventory`

## 1) Module Identity

- Module name: `inventory`
- Primary KB references:
  - domain: `knowledge_base/BusinessLogic/2_domain/40_POSOperation/inventory_domain.md`
  - process:
    - `knowledge_base/BusinessLogic/4_process/30_POSOperation/13_stock_deduction_on_finalize_sale_process.md`
    - `knowledge_base/BusinessLogic/4_process/30_POSOperation/22_void_sale_inventory_reversal_process.md`
  - modSpec: `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/inventory_module_patched.md`
  - edge cases: `knowledge_base/BusinessLogic/3_contract/10_edgecases/pos_operation_edge_case_sweep_patched.md`

## 2) Owned Facts (Source of Truth)

- Owned tables/projections (target):
  - `v0_inventory_stock_categories`
  - `v0_inventory_stock_items`
  - `v0_inventory_restock_batches`
  - `v0_inventory_journal_entries` (append-only source of truth)
  - `v0_inventory_branch_stock` (projection)
- Invariants:
  - journal is append-only; correction is compensating movement
  - movement quantities are stored in stock-item base unit
  - restock metadata updates never mutate journal quantity
  - external movements are idempotent by stable source identity
  - projection derives from journal and must be rebuildable
- State/status:
  - category/item/batch: `ACTIVE | ARCHIVED`

## 3) Consumed Facts (Read Dependencies)

- AccessControl:
  - membership/role/branch assignment authorization gates
- OrgAccount:
  - tenant/branch existence and active/frozen state
- Subscription/Entitlements:
  - `core.pos` and `module.inventory` capability checks
- Menu (read dependency):
  - stock-item references from composition mapping
- Sale-order (process orchestrator dependency):
  - finalized sale deduction lines and void reversal source identity

## 4) Commands (Write Surface)

- Categories:
  - `inventory.categories.create`
  - `inventory.categories.update`
  - `inventory.categories.archive`
- Stock items:
  - `inventory.items.create`
  - `inventory.items.update`
  - `inventory.items.archive`
  - `inventory.items.restore`
- Restock batches:
  - `inventory.restockBatches.create`
  - `inventory.restockBatches.updateMeta`
  - `inventory.restockBatches.archive`
- Adjustments:
  - `inventory.adjustments.apply`
- External process commands:
  - `inventory.external.saleDeduction.apply`
  - `inventory.external.voidReversal.apply`

Transaction contract for each write:
- business writes
- audit write
- outbox write
- sync change append

## 5) Queries (Read Surface)

- `inventory.categories.list`
- `inventory.items.list`
- `inventory.items.read`
- `inventory.restockBatches.list`
- `inventory.journal.list`
- `inventory.stock.branch.read`
- `inventory.stock.aggregate.read`

## 6) Event Contract

### Produced events

- `INVENTORY_STOCK_CATEGORY_CREATED`
- `INVENTORY_STOCK_CATEGORY_UPDATED`
- `INVENTORY_STOCK_CATEGORY_ARCHIVED`
- `INVENTORY_STOCK_ITEM_CREATED`
- `INVENTORY_STOCK_ITEM_UPDATED`
- `INVENTORY_STOCK_ITEM_ARCHIVED`
- `INVENTORY_STOCK_ITEM_RESTORED`
- `INVENTORY_RESTOCK_BATCH_RECORDED`
- `INVENTORY_RESTOCK_BATCH_METADATA_UPDATED`
- `INVENTORY_RESTOCK_BATCH_ARCHIVED`
- `INVENTORY_MOVEMENT_APPENDED`
- `INVENTORY_ADJUSTMENT_RECORDED`
- `INVENTORY_EXTERNAL_DEDUCTION_APPLIED`
- `INVENTORY_EXTERNAL_REVERSAL_APPLIED`

### Subscribed events (target)

- `SALE_FINALIZED` (or finalize outbox command trigger)
- `SALE_VOIDED` (or void outbox command trigger)
- `ORG_BRANCH_ACTIVATED` (optional initialization tasks)

## 7) Access-control mapping (target)

- Scope/effect/roles:
  - query: `READ` with branch or tenant scope by endpoint
  - writes:
    - owner/admin default
    - manager allowed for restock + adjustments by policy
  - cashier no inventory writes
- Entitlement:
  - reads allowed when subscription is not frozen and access passes
  - writes blocked when `module.inventory` is read-only/blocked

## 8) Deterministic failure code baseline

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

## 9) Test requirements

- Unit:
  - movement reason validation
  - set-to-count vs delta adjustment math
  - idempotent external movement dedupe
- Integration:
  - full command atomicity (`business + audit + outbox + sync`)
  - replay duplicate/payload conflict behavior
  - sync pull convergence for inventory entities
  - scope isolation (tenant/branch/account)

## 10) Boundary guard checklist

- [x] Owned facts vs consumed facts locked
- [x] Action-key namespace locked (`inventory.*`)
- [x] Event ownership list locked
- [x] Offline replay operation family locked
- [x] Sync entity producer map locked


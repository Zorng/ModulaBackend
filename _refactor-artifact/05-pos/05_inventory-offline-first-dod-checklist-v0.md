# Inventory Offline-First DoD Checklist (v0)

Status: Active (OF6, Phase 0 locked)  
Owner: backend  
Scope: `inventory` module rollout readiness and acceptance gates

## Objective

Define non-negotiable offline-first acceptance criteria for inventory so we do not retrofit replay/sync behavior later.

## Inputs

- `_refactor-artifact/01-platform/offline-first-rollout-v0.md`
- `_refactor-artifact/05-pos/05_inventory-rollout-v0.md`
- `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/inventory_module_patched.md`
- `knowledge_base/BusinessLogic/2_domain/40_POSOperation/inventory_domain.md`
- `api_contract/push-sync-v0.md`
- `api_contract/sync-v0.md`

## DoD Gates

### Gate A — Command surface is replay-safe

- All inventory write commands have replay operation types in `/v0/sync/push`.
- Every replayable inventory command has deterministic idempotency identity:
  - key basis: `(token.tenantId, token.branchId, clientOpId)`.
- Duplicate replay yields `DUPLICATE` (not second mutation).
- Payload mismatch on same `clientOpId` yields `OFFLINE_SYNC_PAYLOAD_CONFLICT`.

### Gate B — All writes emit sync deltas

- Every successful inventory write appends a sync change in the same DB transaction.
- Sync change rows are emitted under module key `inventory`.
- Required pull behavior:
  - `POST /v0/sync/pull` with `moduleScopes: ["inventory"]` returns inventory deltas.
  - no cross-tenant or cross-branch leakage.

### Gate C — Conflict semantics are deterministic

- Each inventory invariant failure maps to a stable failure `code`.
- Each failure `code` maps to `resolution`:
  - `RETRYABLE`
  - `PERMANENT`
  - `MANUAL`
- Reasonable initial mapping expectation:
  - malformed payload/context -> `PERMANENT`
  - dependency/state precondition missing -> `MANUAL`
  - transient infra/lease conflicts -> `RETRYABLE`

### Gate D — Atomic command contract

- Every inventory write command runs under one transaction that includes:
  - business write(s)
  - audit event
  - outbox event
  - sync change append
- On failure, transaction rolls back fully (no partial side effects).

### Gate E — End-to-end convergence tests

- Integration tests prove:
  - replay `APPLIED` updates server state once
  - replay duplicate is safe (`DUPLICATE`)
  - replay failure returns deterministic `code + resolution`
  - sync pull converges read model after replay

## Inventory operation checklist (locked in Phase 0)

### Replay operation types (locked set)

- `inventory.stockItem.create`
- `inventory.stockItem.update`
- `inventory.stockItem.archive`
- `inventory.stockItem.restore`
- `inventory.category.create`
- `inventory.category.update`
- `inventory.category.archive`
- `inventory.restockBatch.create`
- `inventory.restockBatch.updateMeta`
- `inventory.restockBatch.archive`
- `inventory.adjustment.apply`
- `inventory.external.saleDeduction.apply` (cross-module, orchestrated by sale finalize)
- `inventory.external.voidReversal.apply` (cross-module, orchestrated by sale void)

### Sync entity map (locked set)

- `inventory_stock_item`
- `inventory_stock_category`
- `inventory_restock_batch`
- `inventory_journal_entry`
- `inventory_branch_stock_projection`

## Locked conflict taxonomy (Phase 0)

| Code | Resolution | Notes |
|---|---|---|
| `INVENTORY_STOCK_ITEM_NOT_FOUND` | `MANUAL` | reference is invalid or stale |
| `INVENTORY_STOCK_ITEM_INACTIVE` | `MANUAL` | archived/inactive stock item |
| `INVENTORY_STOCK_CATEGORY_NOT_FOUND` | `MANUAL` | category reference invalid |
| `INVENTORY_RESTOCK_BATCH_NOT_FOUND` | `MANUAL` | batch reference invalid |
| `INVENTORY_RESTOCK_BATCH_ARCHIVED` | `MANUAL` | archived batch cannot be mutated |
| `INVENTORY_BASE_UNIT_IMMUTABLE` | `PERMANENT` | immutable invariant |
| `INVENTORY_QUANTITY_INVALID` | `PERMANENT` | payload validation failure |
| `INVENTORY_ADJUSTMENT_INVALID` | `PERMANENT` | invalid adjustment style/value |
| `INVENTORY_DUPLICATE_EXTERNAL_MOVEMENT` | `PERMANENT` | duplicate external source identity |
| `INVENTORY_NEGATIVE_STOCK_BLOCKED` | `MANUAL` | policy blocks current stock result |
| `OFFLINE_SYNC_PAYLOAD_CONFLICT` | `PERMANENT` | replay payload mismatch for same op |
| `OFFLINE_SYNC_IN_PROGRESS` | `RETRYABLE` | lease/in-flight conflict |

Platform/system denials remain unchanged:
- `BRANCH_FROZEN`
- `SUBSCRIPTION_FROZEN`
- `ENTITLEMENT_BLOCKED`
- `ENTITLEMENT_READ_ONLY`
- `NO_MEMBERSHIP`
- `NO_BRANCH_ACCESS`
- `PERMISSION_DENIED`

## Required test matrix (inventory module)

- Replay behavior:
  - apply once
  - duplicate safe
  - payload conflict
  - dependency missing
- Sync behavior:
  - pull bootstrap
  - pull incremental after inventory writes
  - scope isolation (tenant/branch)
- Atomicity:
  - forced outbox/audit/sync failure rolls back business write
- Conflict hint contract:
  - representative failures include `resolution.category` assertions

## Exit criteria

- This checklist is fully checked in inventory rollout PR(s).
- `api_contract/inventory-v0.md` includes replay + sync notes.
- Integration coverage exists for replay + pull convergence.

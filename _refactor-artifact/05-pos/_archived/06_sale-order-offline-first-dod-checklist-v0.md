# Sale + Order Offline-First DoD Checklist (v0)

Status: Active (SO0, Phase 0 locked)  
Owner: backend  
Scope: `sale-order` rollout readiness and acceptance gates

## Objective

Define non-negotiable offline-first acceptance criteria for sale/order so we avoid replay/sync retrofits after core POS truth is implemented.

## Inputs

- `_refactor-artifact/01-platform/offline-first-rollout-v0.md`
- `_refactor-artifact/05-pos/06_sale-order-rollout-v0.md`
- `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/sale_module_patched.md`
- `knowledge_base/BusinessLogic/2_domain/40_POSOperation/order_domain_patched.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/10_finalize_sale_orch.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/20_void_sale_orch.md`
- `api_contract/push-sync-v0.md`
- `api_contract/sync-v0.md`
- `_refactor-artifact/02-boundary/operational-notification-boundary-v0.md`

## DoD Gates

### Gate A — Command surface is replay-safe

- Every sale/order write command is explicitly classified as either:
  - replay-enabled in `/v0/sync/push`, or
  - online-only with deterministic replay rejection (`OFFLINE_SYNC_OPERATION_NOT_SUPPORTED`).
- Replay identity for enabled operations is deterministic:
  - key basis: `(token.tenantId, token.branchId, clientOpId)`.
- Duplicate replay yields `DUPLICATE` (not second mutation).
- Payload mismatch on same `clientOpId` yields `OFFLINE_SYNC_PAYLOAD_CONFLICT`.

### Gate B — All truth writes emit pull deltas

- Every successful sale/order truth mutation appends a sync change in the same DB transaction.
- Sync module key is locked as `saleOrder`.
- Pull behavior is deterministic:
  - `POST /v0/sync/pull` with `moduleScopes: ["saleOrder"]` returns sale/order deltas.
  - no cross-tenant or cross-branch leakage.

### Gate C — Conflict semantics are deterministic

- Sale/order invariant failures map to stable `code`.
- Each `code` maps to `resolution.category`:
  - `RETRYABLE`
  - `PERMANENT`
  - `MANUAL`
- Team vs solo void behavior is deterministic:
  - team mode: request/approve path
  - solo mode: direct void path (no second-actor approval requirement).

### Gate D — Atomic command contract

- Every sale/order write command runs under one transaction that includes:
  - business write(s)
  - audit event
  - outbox event
  - sync change append
- On failure, transaction rolls back fully (no partial side effects).

### Gate E — End-to-end convergence tests

- Integration tests prove:
  - replay `APPLIED` updates state once
  - replay duplicate is safe (`DUPLICATE`)
  - replay failure returns deterministic `code + resolution`
  - pull bootstrap + incremental converge sale/order views
  - solo/team void paths preserve lifecycle + notification semantics

## Sale + Order operation checklist (locked in Phase 0)

### Replay-enabled target operations

- `sale.finalize`
- `sale.void.execute` (solo direct void or post-approval execution path)

### Online-only operations (deterministic replay reject)

- `order.place`
- `order.items.add`
- `order.checkout`
- `order.fulfillment.status.update`
- `sale.void.request`
- `sale.void.approve`
- `sale.void.reject`

Notes:
- Online-only commands remain normal HTTP writes; push replay must reject them deterministically.
- `sale.finalize` is currently contract-listed but not yet implemented in replay handler; this checklist locks the target behavior for rollout completion.

## Sync entity map (locked set)

- `sale`
- `sale_line`
- `order_ticket`
- `order_fulfillment_batch`
- `void_request`

Notes:
- `receipt` projections are owned by Receipt module and are excluded from this module scope map.
- Cash/inventory truth remains in their owned module scopes; sale-order emits only sale/order-owned projections.

## Locked conflict taxonomy (Phase 0)

| Code | Resolution | Notes |
|---|---|---|
| `SALE_NOT_FOUND` | `MANUAL` | stale or invalid reference |
| `SALE_ALREADY_VOIDED` | `MANUAL` | already terminal |
| `SALE_FINALIZE_REQUIRES_OPEN_CASH_SESSION` | `MANUAL` | branch session precondition missing |
| `SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED` | `MANUAL` | proof not confirmed |
| `SALE_FINALIZE_KHQR_PROOF_MISMATCH` | `MANUAL` | amount/currency/receiver mismatch |
| `ORDER_NOT_FOUND` | `MANUAL` | stale or invalid ticket id |
| `ORDER_NOT_UNPAID` | `MANUAL` | checkout/cancel precondition failed |
| `VOID_REQUEST_NOT_FOUND` | `MANUAL` | stale reference |
| `VOID_REQUEST_ALREADY_RESOLVED` | `MANUAL` | duplicate approval/rejection |
| `VOID_APPROVAL_REQUIRED` | `MANUAL` | team-mode approval missing |
| `VOID_NOT_ALLOWED_FOR_PAYMENT_METHOD` | `MANUAL` | March baseline blocks KHQR void |
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

## Required test matrix (sale-order module)

- Replay behavior:
  - `sale.finalize` apply once
  - `sale.finalize` duplicate safe
  - replay payload conflict
  - unsupported operation deterministic reject
- Pull behavior:
  - bootstrap sale/order hydration
  - incremental pull after finalize
  - incremental pull after team-mode void request/approval + execution
  - incremental pull after solo direct void execution
  - scope isolation (tenant/branch/account)
- Atomicity:
  - forced outbox/audit/sync failure rolls back sale/order business writes
  - void execution failure keeps lifecycle in non-terminal safe state
- Notification semantics:
  - ON-01 emitted only on `VoidRequest(status=PENDING)` creation
  - no ON-01 emission from `sale.status=VOID_PENDING` transition alone

## Exit criteria

- This checklist is fully checked in sale-order rollout PR(s).
- `api_contract/sale-order-v0.md` includes replay + pull behavior notes.
- Integration coverage exists for replay + pull convergence and solo/team void policy split.

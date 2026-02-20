# Sale + Order Module Boundary (v0)

Status: Locked (Phase 1)  
Owner context: `POSOperation`  
Canonical route prefixes: `/v0/orders`, `/v0/sales`

## 1) Module Identity

- Module name: `sale-order`
- Primary references:
  - `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/sale_module_patched.md`
  - `knowledge_base/BusinessLogic/2_domain/40_POSOperation/order_domain_patched.md`
  - `knowledge_base/BusinessLogic/4_process/30_POSOperation/10_finalize_sale_orch.md`
  - `knowledge_base/BusinessLogic/4_process/30_POSOperation/20_void_sale_orch.md`

## 2) Owned Facts

- Owned entities:
  - `order_ticket`
  - `sale`
  - `sale_line`
  - `void_request`
  - `order_fulfillment_batch`
- Ownership scope:
  - branch-owned truth (`tenant_id`, `branch_id` required on all writes)
- Lifecycle invariants:
  - `sale.finalize` requires open cash session
  - KHQR finalize requires confirmed proof (`SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED`)
  - KHQR mismatch denies finalize (`SALE_FINALIZE_KHQR_PROOF_MISMATCH`)
  - void split:
    - workforce OFF (solo): direct execute path
    - workforce ON (team): request -> approve/reject -> execute

## 3) Consumed Facts

- `policy`: VAT/FX/rounding and pay-later toggles
- `menu`: item + modifier pricing snapshots
- `discount`: eligibility metadata only (no ownership transfer)
- `cashSession`: open-session precondition + movement hooks
- `inventory`: stock reservation/consumption side effects
- `khqrPayment`: payment truth for KHQR finalize
- `operationalNotification`: ON-01/ON-02 emission triggers

## 4) Commands (Write)

- Orders:
  - `POST /v0/orders` -> `order.place`
  - `POST /v0/orders/:orderId/items` -> `order.items.add`
  - `POST /v0/orders/:orderId/checkout` -> `order.checkout`
  - `PATCH /v0/orders/:orderId/fulfillment` -> `order.fulfillment.status.update`
- Sales:
  - `POST /v0/sales/:saleId/finalize` -> `sale.finalize`
  - `POST /v0/sales/:saleId/void/request` -> `sale.void.request`
  - `POST /v0/sales/:saleId/void/approve` -> `sale.void.approve`
  - `POST /v0/sales/:saleId/void/reject` -> `sale.void.reject`
  - `POST /v0/sales/:saleId/void/execute` -> `sale.void.execute`

Write transaction contract (for each implemented command):
- business write(s)
- audit write
- outbox write
- sync change append (`moduleKey = saleOrder`)

## 5) Queries (Read)

- `GET /v0/orders`
- `GET /v0/orders/:orderId`
- `GET /v0/sales`
- `GET /v0/sales/:saleId`
- `GET /v0/sales/:saleId/void-request`

## 6) Event Contract

Produced (canonical):
- `ORDER_TICKET_PLACED`
- `ORDER_ITEMS_ADDED`
- `ORDER_CHECKOUT_COMPLETED`
- `ORDER_FULFILLMENT_STATUS_UPDATED`
- `SALE_FINALIZED`
- `SALE_VOID_REQUESTED`
- `SALE_VOID_APPROVED`
- `SALE_VOID_REJECTED`
- `SALE_VOID_EXECUTED`

Notification trigger lock:
- ON-01 emitted only on `VoidRequest(status=PENDING)` creation
- do not emit ON-01 from `sale.status=VOID_PENDING` alone

## 7) Replay / Offline Lock

- Replay-enabled target commands:
  - `sale.finalize`
  - `sale.void.execute`
- Online-only commands must reject replay with deterministic failure:
  - `order.place`
  - `order.items.add`
  - `order.checkout`
  - `order.fulfillment.status.update`
  - `sale.void.request`
  - `sale.void.approve`
  - `sale.void.reject`

## 8) Failure Codes (locked set)

- `SALE_NOT_FOUND`
- `SALE_ALREADY_VOIDED`
- `SALE_FINALIZE_REQUIRES_OPEN_CASH_SESSION`
- `SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED`
- `SALE_FINALIZE_KHQR_PROOF_MISMATCH`
- `ORDER_NOT_FOUND`
- `ORDER_NOT_UNPAID`
- `VOID_REQUEST_NOT_FOUND`
- `VOID_REQUEST_ALREADY_RESOLVED`
- `VOID_APPROVAL_REQUIRED`
- `VOID_NOT_ALLOWED_FOR_PAYMENT_METHOD`
- standard idempotency/access-control/entitlement denials

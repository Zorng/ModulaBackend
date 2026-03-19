# Sale + Order Fulfillment Unification Plan (v0)

Status: Implemented for v0 quick checkout
Owner context: POSOperation + PlatformSystem(KHQR)

Related:
- `_refactor-artifact/05-pos/06_sale-order-checkout-remodel-spec-v0.md`
- `_refactor-artifact/05-pos/06_sale-order-rollout-v0.md`
- `api_contract/sale-order-v0.md`

## Goal

Make fulfillment logically consistent across pay-now and pay-later flows.

Locked target:
- `cart` remains a frontend-local construct
- `order` is the operational and fulfillment anchor
- `sale` is the financial and payment anchor

Implication:
- every successful checkout that produces a committed sale must also produce an
  order anchor that can continue through fulfillment

## Current problem

Previous live split:
- pay-later: `order -> checkout -> sale`
- pay-now: `local cart -> sale` with no order

That left a gap:
- `PATCH /v0/orders/:orderId/fulfillment` is the only fulfillment write path
- quick-pay cash and quick-pay KHQR had no `orderId`
- finalized pay-now sales therefore cannot move through
  `PENDING -> PREPARING -> READY -> COMPLETED`

## Locked direction

1. Pay-later remains unchanged in principle.
2. Pay-now checkout does not create an `OPEN` order first.
3. Pay-now checkout must create a `CHECKED_OUT` order at payment commit.
4. Fulfillment stays order-based; no parallel fulfillment model on `sale`.
5. KHQR initiate still creates no order and no sale.
6. KHQR confirmation/finalization creates the order and sale together.

## Flow by case

### A. Quick takeaway cash

Target flow:
1. Cashier builds local cart.
2. Frontend calls `POST /v0/checkout/cash/finalize`.
3. Backend atomically creates:
   - `order_ticket(status=CHECKED_OUT, source_mode=DIRECT_CHECKOUT)`
   - `order_ticket_lines`
   - `sale(status=FINALIZED, order_ticket_id=<orderId>)`
   - `sale_lines(order_ticket_line_id=<lineId>)`
4. Backend returns:
   - `order`
   - `sale`
   - `lines`
   - `receipt`
5. Kitchen/counter continues with `PATCH /v0/orders/:orderId/fulfillment`.

### B. Quick takeaway KHQR

Target flow:
1. Cashier builds local cart.
2. Frontend calls `POST /v0/checkout/khqr/initiate`.
3. Backend creates payment intent only.
4. Customer pays.
5. Webhook or manual confirm runs a shared finalize routine.
6. Finalize routine atomically creates:
   - `order_ticket(status=CHECKED_OUT, source_mode=DIRECT_CHECKOUT)`
   - `order_ticket_lines`
   - `sale(status=FINALIZED, order_ticket_id=<orderId>)`
   - `sale_lines(order_ticket_line_id=<lineId>)`
7. Fulfillment continues through `PATCH /v0/orders/:orderId/fulfillment`.

### C. Dine-in pay-later

Remains:
1. `POST /v0/orders`
2. `POST /v0/orders/:orderId/items`
3. `PATCH /v0/orders/:orderId/fulfillment`
4. `POST /v0/orders/:orderId/checkout`

No conceptual change; this is already aligned with the model.

## Contract deltas (target, not live yet)

### `POST /v0/checkout/cash/finalize`

Current live response:
- `sale`
- `lines`
- `receipt`

Target response:
- `order`
- `sale`
- `lines`
- `receipt`

### `POST /v0/checkout/khqr/initiate`

No order yet at initiate.

No change required to the initiate response itself, but the finalize/confirm
path must materialize:
- `order`
- `sale`

### `GET /v0/orders`

Must become useful for quick-pay fulfillment queues too.

Required target behavior:
- quick-pay orders must not disappear just because they start as
  `CHECKED_OUT`
- read surfaces need a way to query fulfillable checked-out orders

Implemented:
- `GET /v0/orders?view=FULFILLMENT_ACTIVE`
- includes `OPEN` and `CHECKED_OUT` orders that are not yet
  fulfillment-`COMPLETED`/`CANCELLED`
- allows frontend fulfillment queues to read one merged work list

### `PATCH /v0/orders/:orderId/fulfillment`

No new endpoint is needed.

Rule stays:
- fulfillment is updated against `orderId`

## Data model delta

### 1. Order source mode

Extend `order_ticket.source_mode`:
- current:
  - `STANDARD`
  - `MANUAL_EXTERNAL_PAYMENT_CLAIM`
- target add:
  - `DIRECT_CHECKOUT`

Purpose:
- distinguish pay-later open tickets from pay-now materialized orders

### 2. Sale linkage

For new quick-pay writes:
- `sale.order_ticket_id` should be non-null

Compatibility:
- legacy rows with `sale.order_ticket_id = null` remain readable

### 3. Sale-line linkage

For new quick-pay writes:
- `sale_lines.order_ticket_line_id` should be populated

This preserves:
- item traceability
- richer order/sale drill-down

## Service refactor shape

Introduce one shared materialization routine for committed checkout:

`materializeCommittedCheckout()`

Responsibilities:
1. create order ticket
2. create order lines
3. create sale
4. create sale lines
5. finalize sale if payment is already committed
6. append audit/outbox/sync changes in one transaction

Callers:
- `cashFinalizeFromLocalCart()`
- KHQR finalize path after proof confirmation
- future manual finalize paths if needed

This removes duplicate sale-line creation logic and keeps idempotency in one
place.

## Query/read impact

This refactor is not only a write-path change.

Read consequences:
- `GET /v0/orders` list screens must decide whether to include
  `CHECKED_OUT` but not yet `COMPLETED` fulfillment orders
- `GET /v0/orders/:orderId` becomes the canonical detail view for all
  fulfillable sales, including quick-pay
- sales list/detail continues to represent payment truth, but can now deep-link
  to an order more reliably

## Rollout phases

### U1 — Spec and contract lock
- lock this direction
- update remodel spec and rollout docs
- do not change live contract yet

### U2 — Schema and type changes
- add `DIRECT_CHECKOUT` source mode
- adjust repository/service types
- confirm legacy sale/order reads remain compatible

### U3 — Cash finalize unification
- refactor `POST /v0/checkout/cash/finalize`
- create checked-out order + lines + sale + sale lines atomically
- response returns `order`

### U4 — KHQR finalize unification
- refactor payment-intent finalization routine
- create checked-out order + lines + sale + sale lines atomically
- preserve duplicate/late-event idempotency

### U5 — Fulfillment read alignment
- ensure quick-pay orders are visible to fulfillment surfaces
- confirm list/read contracts are sufficient for frontend kitchen/counter views

### U6 — Contract cutover
- update `api_contract/sale-order-v0.md`
- notify frontend that quick checkout responses now include an order anchor

## Test matrix

1. Cash quick checkout creates finalized sale and checked-out order in one
   transaction.
2. KHQR successful confirmation creates finalized sale and checked-out order in
   one transaction.
3. Duplicate KHQR confirmation does not create duplicate order or sale.
4. Failed/cancelled/expired KHQR does not create order or sale.
5. Fulfillment update works for quick-pay cash order.
6. Fulfillment update works for quick-pay KHQR order.
7. Pay-later flow still works unchanged.
8. Legacy reads still handle pre-existing sales with null `order_ticket_id`.

## Why this is the cleaner model

It keeps responsibilities separated:
- frontend cart stays ephemeral
- backend order owns preparation and hand-off
- backend sale owns payment truth

So the system does not collapse into "sale and order are the same thing".
Instead:
- pay-later = order first, sale later
- pay-now = order and sale created together at commit

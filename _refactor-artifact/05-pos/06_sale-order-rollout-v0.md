# Sale + Order Rollout (v0) — Checkout Remodel Track

Status: Active (online pay-first + offline cash replay live; outage claim lane pending)  
Owner context: POSOperation + PlatformSystem(KHQR)

## Why this tracker exists

Previous sale-order rollout closed against a server-cart-first model.
That model is now superseded by checkout remodel goals:
- client-local cart,
- sale written only on payment commit,
- webhook-first KHQR settlement.

Legacy artifacts are archived:
- `_refactor-artifact/05-pos/_archived/06_sale-order-rollout-v0-legacy.md`
- `_refactor-artifact/05-pos/_archived/06_sale-order-offline-first-dod-checklist-v0.md`

## Source-of-truth spec

- `_refactor-artifact/05-pos/06_sale-order-checkout-remodel-spec-v0.md`
- `_refactor-artifact/05-pos/07_sale-order-fulfillment-unification-plan-v0.md`
- `_refactor-artifact/05-pos/11_sale-order-ui-tab-refactor-v0.md`
- `_refactor-artifact/05-pos/12_sale-order-pay-first-scope-assessment-v0.md`
- `_refactor-artifact/05-pos/13_sale-order-offline-pay-first-cash-plan-v0.md`
- `api_contract/sale-order-v0.md` (`Pending Remodel Draft`)
- `api_contract/khqr-payment-v0.md` (`Pending Remodel Draft`)

## Execution phases (remodel)

### R1 — Spec + contract lock
- lock state machine (`payment_intent`, `sale`)
- lock endpoint cutover map
- lock error taxonomy

### R2 — Data model remodel
- add/lock payment-intent schema
- rewire KHQR attempt/evidence ownership to payment intent
- define immutable checkout snapshot shape

### R3 — KHQR settlement path
- implement webhook-first finalize path
- implement manual confirm fallback to same finalize routine
- enforce idempotent convergence for duplicate/late events

### R4 — Cash checkout finalize path
- add direct cash finalize endpoint from local cart payload
- server-side repricing + atomic sale write

### R5 — Cutover + deprecation
- remove cashier dependency on `/v0/orders*` as a pre-payment server-cart lane
- keep `/v0/orders*` as the order and fulfillment lane
- update frontend integration notes

### R6 — Fulfillment unification for pay-now checkout
- materialize a checked-out order for quick cash finalize
- materialize a checked-out order for finalized KHQR checkout
- keep fulfillment updates strictly order-based
- update quick-checkout responses and order reads accordingly

### R7 — Offline pay-first cash replay
- add push sync operation `checkout.cash.finalize`
- use immutable priced checkout snapshot plus client-supplied `orderId` + `saleId`
- replay the same direct-checkout truth and side effects as online cash finalize
- keep outage static-QR / external transfer as manual external-payment-claim future work

## Tracking

| Phase | Status | Notes |
|---|---|---|
| R1 Spec + contract lock | In progress | Remodel spec drafted and pending contract sections added. |
| R2 Data model remodel | Completed | Added `038_create_v0_payment_intents.sql`; KHQR attempts now owned by `payment_intent_id`; payment-intent verification status is persisted alongside attempt verification. |
| R3 KHQR settlement path | Completed | Webhook-first + manual-confirm fallback converge on shared finalize; supports local-cart intent initiate/read/cancel on `/v0/checkout/khqr/*`; cancellation blocks later finalize; duplicate/late events stay idempotent. |
| R4 Cash checkout finalize path | Completed | Added direct local-cart cash finalize at `POST /v0/checkout/cash/finalize` with server-side repricing and atomic `CHECKED_OUT order + sale` materialization. |
| R5 Cutover + deprecation | In progress | `/v0/checkout/*` bridge is live for pay-first; `/v0/orders*` is retained for pay-later tickets and supports unpaid ticket cancel (`POST /v0/orders/:orderId/cancel`). Pay-later place/add writes are now policy-gated by `saleAllowPayLater`. Settlement behavior is now explicit: pay-later cash checkout returns `FINALIZED` sale immediately, while pay-later KHQR remains `PENDING` until confirmation. Read-side alignment now exposes `GET /v0/orders?view=FULFILLMENT_ACTIVE`, `GET /v0/orders?view=PAY_LATER_EDITABLE`, and `GET /v0/orders?view=MANUAL_CLAIM_REVIEW`, plus `sourceMode` list filtering, so frontend can split fulfillment, pay-later, and manual-claim queues without client-side partitioning. Targeted regression coverage passed across `v0-sale-order`, `v0-khqr-payment`, `v0-cash-session`, `v0-reporting`, and `v0-push-sync`. Remaining work is frontend migration per lane, tracked in `_refactor-artifact/05-pos/11_sale-order-ui-tab-refactor-v0.md`. |
| R6 Fulfillment unification for pay-now checkout | Completed | Quick-pay cash and quick-pay KHQR now both materialize a checked-out `DIRECT_CHECKOUT` order anchor and auto-create an initial `PENDING` fulfillment batch so fulfillment remains order-based after sale finalization. |
| R7 Offline pay-first cash replay | Completed | Push sync now supports `checkout.cash.finalize` with immutable snapshot replay, preserved `orderId` + `saleId`, and normal sale-order audit/outbox/pull-sync side effects. Outage static-QR / external transfer remains a future manual-claim capture lane. |

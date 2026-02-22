# Sale + Order Rollout (v0) — Checkout Remodel Track

Status: Active (remodel planning)  
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
- remove cashier dependency on `/v0/orders*`
- keep/order-scope endpoints only if explicit fulfillment lane is retained
- update frontend integration notes

## Tracking

| Phase | Status | Notes |
|---|---|---|
| R1 Spec + contract lock | In progress | Remodel spec drafted and pending contract sections added. |
| R2 Data model remodel | Completed | Added `038_create_v0_payment_intents.sql`; KHQR attempts now owned by `payment_intent_id`; payment-intent verification status is persisted alongside attempt verification. |
| R3 KHQR settlement path | Completed | Webhook-first + manual-confirm fallback converge on shared finalize; supports local-cart intent initiate/read/cancel on `/v0/checkout/khqr/*`; cancellation blocks later finalize; duplicate/late events stay idempotent. |
| R4 Cash checkout finalize path | Completed | Added direct local-cart cash finalize at `POST /v0/checkout/cash/finalize` with server-side repricing and atomic sale write. |
| R5 Cutover + deprecation | In progress | `/v0/checkout/*` bridge is live; backend now denies cashier on `/v0/orders*` and keeps `/v0/orders*` for manager/fulfillment lane. Frontend cutover map is documented in `api_contract/sale-order-v0.md`; remaining work is app-side route migration. |

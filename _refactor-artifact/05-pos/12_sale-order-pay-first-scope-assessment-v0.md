# Sale + Order Pay-First Scope Assessment (v0)

Status: Active (offline cash replay implemented; reconnect claim submission path ready)  
Owner context: POS / Sale-Order / KHQR

## Goal being assessed

Deliver pay-first checkout via:

- cash
- KHQR

across:

- online
- offline

while keeping fulfillment continuity after payment.

## Scope correction

This is not a pay-later assessment.

Pay-later, manual-claim review, and broader order-lifecycle management were
explored during implementation, but they are not the current delivery target.
The current target is the narrower pay-first lane only.

## Current backend reality

### Online pay-first cash

Status: ready

What exists:

- `POST /v0/checkout/cash/finalize`
- server-side repricing
- atomic `CHECKED_OUT order + order lines + FINALIZED sale + sale lines`
- initial fulfillment batch auto-created as `PENDING`
- fulfillment continues on `/v0/orders/:orderId/fulfillment`

Confidence:

- integration-covered and already working end to end

### Online pay-first KHQR

Status: ready

What exists:

- `POST /v0/checkout/khqr/initiate`
- `GET /v0/checkout/khqr/intents/:intentId`
- `POST /v0/checkout/khqr/intents/:intentId/cancel`
- webhook-first KHQR confirmation
- manual confirm fallback
- on successful confirmation:
  - `CHECKED_OUT order + order lines + FINALIZED sale + sale lines`
  - initial fulfillment batch auto-created as `PENDING`

Confidence:

- integration-covered and already working end to end

### Offline pay-first cash

Status: ready

What exists:

- push sync operation type `checkout.cash.finalize`
- immutable priced snapshot replay for offline cash checkout
- client-supplied `orderId` + `saleId` preserved on replay
- replayed `CHECKED_OUT order + FINALIZED sale + initial PENDING fulfillment batch`
- normal audit / outbox / pull-sync side effects on replay
- integration coverage for apply / duplicate / payload conflict / cash-session precondition

### Offline external payment claim (static KHQR / transfer proof)

Status: backend-ready in the intended reconnect-submit model

Reason:

- KHQR gateway confirmation still depends on online provider truth
- current locked contract already says KHQR remains online-only
- but real outage handling can still support customer-paid static QR as a
  **manual external payment claim** lane

Required business rule:

- when connectivity is down and customer pays via static QR / external transfer,
  staff must capture a photo of the customer transaction proof
- that photo becomes required evidence for later claim submission/review when
  connectivity returns

Important distinction:

- this is **not** offline KHQR settlement
- this is an offline capture of a later-reviewed payment claim

Current backend shape:

- backend has the online manual-claim endpoints needed after reconnect
- backend now supports the reconnect-submit proof flow:
  - upload proof via media with `area = payment-proof`
  - create `MANUAL_EXTERNAL_PAYMENT_CLAIM` order
  - create manual payment claim with `proofImageUrl`
- backend does not provide a replayable offline claim-capture operation, which
  is not required for the current scope

## Push-sync/offline reality check

Current docs and code agree on the following:

- general sale/order flow must not be routed through `pushSync` yet
- offline pay-first cash settlement is now supported through `checkout.cash.finalize`
- `sale.finalize` replay is still hard-rejected as unsupported

Implication:

- there is now a current offline pay-first cash settlement lane in backend
- online pay-first is solid
- outage external-payment-claim reconnect submission is backend-ready
- local outage capture on device remains a frontend/application responsibility

## Assessment by lane

### Cash

- online: ready
- offline: ready

### KHQR gateway

- online: ready
- offline: intentionally unsupported as verified gateway settlement

### External payment claim

- reconnect-submit path: ready on backend
- outage local capture: still a frontend/application responsibility

## Fulfillment continuity

For the current pay-first target, fulfillment continuity is already solved:

- quick cash checkout materializes a direct-checkout order anchor
- quick KHQR finalization materializes a direct-checkout order anchor
- both start with fulfillment status `PENDING`
- fulfillment queue reads can use `GET /v0/orders?view=FULFILLMENT_ACTIVE`

So fulfillment is not the blocker anymore.

## Main conclusion

If the release goal is:

- online pay-first via cash and KHQR

then backend is in good shape.

If the release goal is:

- online and offline pay-first with outage coverage

then the current situation is:

- cash offline is ready
- outage-mode external payment claim is supported as:
  - local capture during downtime
  - normal online proof upload + claim submission after reconnect
- KHQR gateway remains online-only

So the realistic target splits into:

1. pay-first online cash: ready
2. pay-first online KHQR: ready
3. pay-first offline cash settlement: ready
4. outage-mode external payment claim with photo evidence: backend-ready in reconnect-submit model
5. offline KHQR gateway settlement: not valid under current rules

## Recommended scope lock

### Increment 1 — ship now

- online cash quick checkout
- online KHQR quick checkout
- offline cash replay via `checkout.cash.finalize`
- outage external-payment-claim local capture + reconnect submit
- fulfillment for paid direct-checkout orders

### Increment 2 — future, only if explicitly needed

- replayable offline manual external payment claim operation
- automated queued claim submission instead of reconnect-time normal HTTP submit

### Explicit non-goal for current increment

- offline KHQR gateway settlement

## Decision guidance

If the team needs a clean deliverable quickly:

- lock current release as:
  - online pay-first cash
  - online pay-first KHQR
  - offline pay-first cash
  - outage external-payment-claim local capture + reconnect submit
- keep KHQR explicitly online-only
- do not promise offline KHQR gateway settlement

If the team insists on offline in the next increment:

- keep cash settlement as done and only add replayable offline claim capture if
  reconnect-submit proves insufficient
- keep KHQR gateway settlement out of offline scope

## Evidence anchors

- `api_contract/sale-order-v0.md`
- `api_contract/khqr-payment-v0.md`
- `api_contract/push-sync-v0.md`
- `src/modules/v0/platformSystem/pushSync/api/router.ts`
- `src/integration-tests/v0-sale-order.int.test.ts`
- `src/integration-tests/v0-push-sync.int.test.ts`

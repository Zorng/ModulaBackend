# Sale + Order Manual External-Claim Lane Restore Plan (v0)

Status: Implemented through R5; frontend notification pending  
Owner context: POS / Sale-Order / KHQR / Media

Related:
- `_refactor-artifact/05-pos/12_sale-order-pay-first-scope-assessment-v0.md`
- `_refactor-artifact/05-pos/13_sale-order-offline-pay-first-cash-plan-v0.md`
- `api_contract/sale-order-v0.md`
- `api_contract/khqr-payment-v0.md`
- `api_contract/push-sync-v0.md`
- `api_contract/media-v0.md`

## Goal

Re-enable the narrow outage/manual external-payment-claim exception lane without
reopening generic pay-later or open-ticket sale flow.

Locked interpretation:

- pay-first remains the default and primary operational model
- normal KHQR gateway settlement remains online-only
- outage static-QR / external-transfer handling is restored as a separate
  manual external-payment-claim lane
- generic open-ticket / pay-later stays disabled

This means the product regains outage recovery for non-cash proof capture
without undoing the pay-first rollback.

## Why this needs a separate restore

The pay-later rollback removed two different things together:

1. generic deferred settlement / open-ticket workflow
2. outage exception workflow for manual external payment claims

Those are not the same business lane.

The exception lane exists to handle:

- customer already paid via static QR / external transfer
- online provider confirmation cannot be completed at checkout time
- staff must capture proof and submit for review later

That is not equivalent to:

- unpaid order editing
- delayed customer payment
- normal pay-later settlement

## Current backend reality

Current implementation state:

- active final contract treats manual external-payment-claim as rolled back
- deferred order endpoints remain registered but return
  `422 ORDER_OPEN_TICKET_DISABLED`
- `GET /v0/orders` is narrowed to direct-checkout fulfillment reads
- `MANUAL_CLAIM_REVIEW` view is rejected
- `MANUAL_EXTERNAL_PAYMENT_CLAIM` source filtering is rejected
- push sync no longer exposes `order.manualExternalPaymentClaim.capture`

Important surviving scaffolding:

- manual-claim routes still exist in router
- sale-order repository and types still retain manual-claim structures
- `payment-proof` upload remains active in media module
- cashier upload for `payment-proof` remains allowed

So the lane is currently disabled in contract/service behavior, but not erased
from the codebase.

## Recommended restore scope

Restore only this exception lane:

- create a claim-order anchor for outage/manual-proof handling
- upload `payment-proof`
- submit manual payment claim when online
- reviewer approves or rejects claim

Keep these disabled:

- generic `STANDARD` pay-later order placement
- unpaid order editing for ordinary deferred settlement
- normal order checkout from open tickets
- pay-later queue surfaces such as `PAY_LATER_EDITABLE`

## Naming lock

Do not describe the restored lane as "offline KHQR settlement."

Correct wording:

- outage manual external-payment-claim
- outage static-QR / external-transfer proof lane
- reconnect-submit claim workflow

Reason:

- true KHQR gateway confirmation still depends on online provider truth
- the restored lane is a proof-review exception, not verified offline KHQR

## Recommended product/technical model

### During outage

Frontend/device should be able to:

1. capture local sale intent
2. record that customer claims to have paid externally
3. capture or queue transaction proof photo locally

### After connectivity returns

Frontend should:

1. upload proof via media
2. create or materialize the manual-claim order if needed
3. submit manual payment claim through normal online HTTP
4. let reviewer approve/reject later

### Recommended backend rule

For restore increment 1:

- keep outage capture local on frontend/device
- use normal online HTTP on reconnect
- do not reintroduce a push-sync replay operation yet

This keeps scope narrow and avoids conflating the exception lane with offline
checkout replay.

## Target active endpoints after restore

### Restore to active

- `POST /v0/orders` with `sourceMode = MANUAL_EXTERNAL_PAYMENT_CLAIM`
- `GET /v0/orders?view=MANUAL_CLAIM_REVIEW`
- `GET /v0/orders?sourceMode=MANUAL_EXTERNAL_PAYMENT_CLAIM`
- `GET /v0/orders/:orderId`
- `GET /v0/orders/:orderId/manual-payment-claims`
- `POST /v0/orders/:orderId/manual-payment-claims`
- `POST /v0/orders/:orderId/manual-payment-claims/:claimId/approve`
- `POST /v0/orders/:orderId/manual-payment-claims/:claimId/reject`
- `POST /v0/media/images/upload` with `area = payment-proof`

### Keep disabled

- `POST /v0/orders` with default/implicit `STANDARD`
- `POST /v0/orders/:orderId/items`
- `POST /v0/orders/:orderId/cancel`
- `POST /v0/orders/:orderId/checkout`
- `GET /v0/orders?view=PAY_LATER_EDITABLE`

## Contract lock to restore

### 1. Sale-order contract

Update `api_contract/sale-order-v0.md` so final scope becomes:

- pay-first primary lane
- outage manual external-payment-claim exception lane active
- generic pay-later/open-ticket lane still disabled

Required explicit clarifications:

- `MANUAL_EXTERNAL_PAYMENT_CLAIM` is an exception lane, not normal pay-later
- manual claim order creation does not imply general open-ticket support
- `MANUAL_CLAIM_REVIEW` is active again
- `payment-proof` upload is active for this lane
- push sync remains out of scope unless explicitly reintroduced

### 2. KHQR contract

Update `api_contract/khqr-payment-v0.md` only to clarify:

- normal KHQR flow remains online-only
- outage manual external-payment-claim is adjacent fallback handling
- it is not a KHQR provider settlement path

### 3. Push-sync contract

For restore increment 1, keep:

- `order.manualExternalPaymentClaim.capture` out of active scope

Only update docs to clarify:

- reconnect-submit claim workflow is active
- replay operation is still not part of current scope

### 4. Media contract

Keep `payment-proof` upload active and clarify:

- it is now active for the restored manual external-payment-claim lane
- cashier upload remains allowed for this area

## Backend implementation slices

### Phase R0 — Scope lock

Lock these non-negotiables:

- manual external-payment-claim is restored
- generic pay-later stays disabled
- no offline KHQR gateway settlement claim is implied
- no replay operation in this increment

Output:

- agreed wording for backend + frontend + report

### Phase R1 — Re-enable claim-order creation only

Restore `POST /v0/orders` for:

- `sourceMode = MANUAL_EXTERNAL_PAYMENT_CLAIM`

Keep default/implicit `STANDARD` disabled.

Service rule:

- `STANDARD` -> still `ORDER_OPEN_TICKET_DISABLED`
- `MANUAL_EXTERNAL_PAYMENT_CLAIM` -> active

Likely code touchpoints:

- `src/modules/v0/posOperation/saleOrder/app/service.ts`
- `src/modules/v0/posOperation/saleOrder/api/router.ts`

### Phase R2 — Restore manual-claim lifecycle

Re-enable:

- list manual claims for an order
- create manual claim
- approve manual claim
- reject manual claim

Required behavior:

- claim creation requires proof image URL
- proof upload can be linked to claim entity
- approve creates/finalizes the non-cash sale in one transaction
- approve must not append cash-session `SALE_IN`
- reject keeps order open in claim-review state

Likely code touchpoints:

- `src/modules/v0/posOperation/saleOrder/app/service.ts`
- `src/modules/v0/posOperation/saleOrder/infra/repository.ts`

### Phase R3 — Restore read surfaces narrowly

Restore:

- `view = MANUAL_CLAIM_REVIEW`
- `sourceMode = MANUAL_EXTERNAL_PAYMENT_CLAIM`

Do not restore:

- `view = PAY_LATER_EDITABLE`
- exposure of ordinary `STANDARD` open orders

Read-surface rule:

- `/v0/orders` stays direct-checkout + manual-claim-review only
- generic dormant non-direct rows remain hidden unless they belong to the
  restored claim lane

### Phase R4 — Media linkage confirmation

Confirm and test:

- `payment-proof` upload remains active
- upload URL can be consumed by manual-claim create
- upload is marked `LINKED` after claim creation

Likely code touchpoints:

- `src/modules/v0/platformSystem/media/app/service.ts`
- `src/modules/v0/posOperation/saleOrder/app/service.ts`

### Phase R5 — Contract + doc cutover

Update:

- `api_contract/sale-order-v0.md`
- `api_contract/khqr-payment-v0.md`
- `api_contract/push-sync-v0.md`
- `api_contract/media-v0.md`

Output:

- one clear frontend-facing scope message

## Access/policy expectations

Recommended lock:

- manual external-payment-claim should not depend on the old pay-later branch
  policy flag
- this lane is an outage exception path
- keep it independently controllable by backend rules if needed later, but do
  not bind it to generic pay-later enablement

Current preferred interpretation:

- generic pay-later policy remains irrelevant
- restored exception lane is allowed regardless of `saleAllowPayLater`

## Open decision: dedicated queue vs reused order list view

Recommended for increment 1:

- reuse `/v0/orders?view=MANUAL_CLAIM_REVIEW`

Reason:

- lower restore cost
- existing semantics already existed
- avoids inventing a new reviewer surface while re-enabling the lane

Optional future refinement:

- dedicated claim-review queue endpoint if review UX becomes large enough

## Test matrix

1. `POST /v0/orders` with `sourceMode = MANUAL_EXTERNAL_PAYMENT_CLAIM` succeeds.
2. `POST /v0/orders` with implicit/default `STANDARD` still returns
   `ORDER_OPEN_TICKET_DISABLED`.
3. `GET /v0/orders?view=MANUAL_CLAIM_REVIEW` returns restored claim-lane rows.
4. `GET /v0/orders?view=PAY_LATER_EDITABLE` still returns
   `ORDER_LIST_VIEW_INVALID`.
5. `POST /v0/media/images/upload` with `area = payment-proof` accepts cashier.
6. `POST /v0/orders/:orderId/manual-payment-claims` links proof upload and
   creates claim.
7. approving claim creates/finalizes non-cash sale and preserves correct audit /
   side effects.
8. approving claim does not append cash-session `SALE_IN`.
9. rejecting claim keeps order open and reviewable.
10. direct-checkout fulfillment surfaces continue working unchanged.

## Frontend communication gate

Do not notify frontend to restore the lane until all of the following are true:

- contract docs are updated
- service behavior is re-enabled
- read surface is working
- `payment-proof` lane is tested end to end
- generic pay-later remains disabled

Then send frontend a narrow restore message:

- outage/manual external-payment-claim lane is active again
- generic pay-later remains disabled
- no offline KHQR gateway settlement is implied
- reconnect-submit claim flow is the active expected model

## Tracking checklist

- [x] R0 scope lock approved
- [x] R1 claim-order create restored
- [x] R2 manual-claim lifecycle restored
- [x] R3 `MANUAL_CLAIM_REVIEW` read surface restored
- [x] R4 `payment-proof` upload/link flow validated
- [x] R5 contract docs updated
- [x] integration tests added/updated
- [ ] frontend notification prepared after restore

## Main decision

Recommended final direction:

- restore the outage/manual external-payment-claim exception lane
- keep pay-first as the main model
- keep generic pay-later disabled
- keep KHQR gateway settlement online-only
- use reconnect-time normal HTTP submission before considering replay support

# Sale + Order Offline Pay-First Cash + External Claim Plan (v0)

Status: Active (offline cash replay implemented; reconnect claim submission path ready)  
Owner context: POS / Sale-Order / Push Sync

## Goal

Make pay-first sale functional offline while preserving the current online model.

Locked interpretation:

- offline verified settlement target = **cash only**
- offline static-QR / external transfer handling = **manual external payment claim**
- KHQR gateway remains **online-only**

This keeps the goal coherent with current product rules and current backend
contracts.

## Why cash + external claim is the correct offline target

Cash can be settled locally and reconciled later.

Verified KHQR gateway settlement cannot.

Current rules already lock:

- KHQR confirmation depends on provider truth
- KHQR must not be reinterpreted as cash during outage
- current backend does not define offline KHQR settlement replay

So the offline implementation target is:

- offline cash quick checkout
- offline static-QR / external transfer capture as manual claim
- online cash quick checkout
- online KHQR quick checkout

Not:

- offline KHQR gateway settlement

## Target outcome

When the device is offline, cashier must still be able to complete a pay-first
cash sale from local cart, and later sync it safely to backend.

On replay, backend should create the same core truth as online cash finalize:

- `CHECKED_OUT order`
- `order lines`
- `FINALIZED sale`
- `sale lines`
- initial fulfillment batch `PENDING`
- normal inventory / audit / outbox / pull-sync side effects

For outage-mode static QR / external transfer, backend should support a separate
claim path:

- capture `OPEN` order
- capture proof metadata
- require photo evidence of customer transaction
- later submit claim when connectivity returns
- manager/reviewer approves or rejects later

This lane is not immediate finalized sale truth.

## Current implementation status

Implemented:

- push sync operation type `checkout.cash.finalize`
- immutable snapshot-based replay for offline cash checkout
- client-supplied `orderId` + `saleId` preserved on replay
- replayed `CHECKED_OUT order + FINALIZED sale + initial PENDING fulfillment batch`
- replayed sale-order audit / outbox / pull-sync side effects
- integration coverage for apply / duplicate / payload conflict / cash-session precondition

Still pending:

- frontend/device-local outage capture UX and reconnect submission orchestration

Backend-facing reconnect flow now ready:

- upload proof image through `/v0/media/images/upload` with `area = payment-proof`
- create `MANUAL_EXTERNAL_PAYMENT_CLAIM` order
- create manual payment claim with uploaded `proofImageUrl`
- backend links matching pending `payment-proof` upload to the created claim

## Resolved backend gaps and remaining optional gap

### Resolved 1 — replayable offline operation for direct cash checkout

Push sync now supports replay of pay-first cash checkout through:

- `checkout.cash.finalize`

The replay path creates the same core truth as the online path:

- `CHECKED_OUT order`
- `FINALIZED sale`
- initial `PENDING` fulfillment batch

This avoids forcing offline through `sale.finalize`, because the real unit of
work is checkout from local cart, not finalizing a pre-existing sale.

### Optional follow-on — replayable offline claim operation

Today the intended outage claim model is:

- capture proof photo locally while offline
- when connectivity returns, use the normal online manual-claim flow

So the current backend requirement is already met by the reconnect-submit path.

What does not exist is a separate replayable offline claim-capture operation.
That is optional future work only if the product later decides reconnect-time
normal submission is not enough.

### Resolved 2 — pricing drift

Online cash finalize reprices from live catalog and policy.

Offline replay cannot safely do that, because catalog/policy may have changed by
the time replay happens.

Implemented rule:

- offline cash replay uses immutable checkout snapshot payload

That snapshot must include enough pricing truth to replay deterministically:

- cart lines
- unit prices used at checkout time
- modifier pricing snapshot
- computed totals
- tender currency
- cash received
- sale type
- fx / rounding snapshot if applicable
- pricing basis / snapshot version if available

### Resolved 3 — deterministic identity for offline-created truth

If checkout happens offline, frontend may need to reference the created order in
local UI before replay completes.

Implemented direction:

- client generates deterministic UUIDs for:
  - `orderId`
  - `saleId`
- payload sends those IDs
- replay persists them as authoritative IDs if unused

Why this matters:

- later queued operations can refer to the same order deterministically
- local UI can keep one identity before and after replay

Optional follow-up:

- line IDs may also be client-generated if later offline line-level operations
  are needed

### Resolved 4 — fulfillment after offline checkout

Current backend creates initial `PENDING` fulfillment batch for direct checkout.

That now also happens on offline cash replay.

Implemented rule:

- replayed offline cash checkout creates initial fulfillment batch

Decision still needed:

- do we need offline replay for later fulfillment status updates too?

If current increment is only “offline sale completion”, we can defer offline
fulfillment updates and still create the initial `PENDING` batch on replay.

If kitchen/service actions must also work offline, then a second replayable
operation is needed:

- `order.fulfillment.status.update`

## Proposed implementation slice

### Phase O1 — Scope + contract lock

Lock the following:

- offline verified settlement = cash only
- offline static-QR / transfer handling = manual external payment claim
- KHQR gateway remains online-only
- new replay operation type = `checkout.cash.finalize`
- replay payload uses immutable checkout snapshot
- replay creates checked-out order + finalized sale atomically
- outage claim lane requires photo evidence capture during downtime and later
  submission when connectivity returns

Artifacts to update:

- `api_contract/push-sync-v0.md`
- `api_contract/sale-order-v0.md`
- rollout trackers

### Phase O2 — Push-sync operation contract

Extend push sync operation types with:

- `checkout.cash.finalize`

Add a separate outage-claim contract decision:

- either a replayable operation like `order.manualPaymentClaim.capture`
- or a staged local-only capture that later submits through normal HTTP once
  connectivity returns

Recommendation:

- keep offline cash replay in push sync
- keep outage claim submission as normal online submit after reconnect unless
  true offline claim replay is explicitly required

Define payload shape with:

- `orderId`
- `saleId`
- `items`
- priced line snapshot
- `saleType`
- `tenderCurrency`
- `cashReceivedTenderAmount`
- totals snapshot
- fx / rounding snapshot where needed

Optional:

- `deviceCreatedAt`
- `pricingSnapshotVersion`

### Phase O3 — Replay handler implementation

Implement replay handler in push sync:

1. validate payload
2. validate open cash session precondition
3. create order + lines
4. create initial `PENDING` fulfillment batch
5. create finalized sale + sale lines
6. emit normal side effects in same transaction
7. append pull deltas in same transaction
8. return `APPLIED` with `resultRefId = saleId` or agreed primary ref

Idempotency requirements:

- same `clientOpId` + same payload => `DUPLICATE`
- same `clientOpId` + different payload => `OFFLINE_SYNC_PAYLOAD_CONFLICT`
- duplicate replay must not create duplicate inventory/cash/outbox writes

### Phase O4 — Service extraction / orchestration reuse

Avoid replay-only business logic drift.

Refactor so both paths can use the same core orchestration:

- online HTTP path: `POST /v0/checkout/cash/finalize`
- offline replay path: `checkout.cash.finalize`

Best direction:

- extract a shared "finalize direct cash checkout from snapshot" routine

Two entry modes:

- online mode: snapshot built by server from current catalog/policy
- offline replay mode: snapshot supplied by payload and validated

### Phase O5 — Pull sync convergence

Replay success must append the same sale/order pull deltas as online writes.

Must verify:

- `sale`
- `sale_line`
- `order_ticket`
- `order_fulfillment_batch`

all appear through normal pull sync after replay.

### Phase O6 — Test matrix

Required tests:

1. offline `checkout.cash.finalize` applies once
2. duplicate replay is `DUPLICATE`
3. payload conflict returns `OFFLINE_SYNC_PAYLOAD_CONFLICT`
4. replay creates:
   - checked-out order
   - finalized sale
   - initial `PENDING` fulfillment batch
5. replay emits inventory deduction once
6. replay emits correct pull deltas
7. replay fails deterministically when no open cash session exists
8. replay preserves offline snapshot pricing instead of live repricing
9. KHQR gateway remains unsupported offline
10. outage claim reconnect-submit path requires photo evidence before
    submission/approval

## Decision points still requiring explicit lock

### D1 — Pricing truth source

Choose one:

1. client-supplied immutable pricing snapshot is authoritative for offline replay
2. backend stores historical pricing snapshot versions and replays against those

Recommendation:

- choose `1` for the current increment

Reason:

- much smaller implementation
- aligns with offline reality
- avoids historical pricing-version infrastructure

### D2 — Entity IDs

Choose one:

1. client supplies `orderId` and `saleId`
2. backend derives IDs from `clientOpId`
3. backend generates IDs only at replay time

Recommendation:

- choose `1`

Reason:

- simplest for local UI continuity
- easiest path if later offline dependent operations are needed

### D3 — Offline fulfillment updates

Choose one:

1. current increment stops at offline sale replay only
2. current increment also enables offline fulfillment status replay

Recommendation:

- choose `1` unless operations explicitly require offline kitchen progression now

Reason:

- keeps the increment smaller
- still delivers offline sale completion
- fulfillment continuity on replay is preserved by creating initial `PENDING`

### D4 — Outage manual-claim capture mode

Choose one:

1. capture proof photo locally offline, then submit normal manual claim online after reconnect
2. add replayable offline claim-capture operation too

Locked choice:

- choose `1` for the current increment

Reason:

- smaller scope than full offline claim replay
- still enforces the photo-evidence requirement
- keeps manual review semantics unchanged on backend

## Recommended immediate next step

Lock these decisions now:

- offline verified settlement = cash only
- outage external payment = manual external payment claim with required photo evidence
- operation type = `checkout.cash.finalize`
- pricing model = immutable client snapshot
- IDs = client-supplied `orderId` + `saleId`
- offline fulfillment updates = deferred unless explicitly required
- outage claim capture = local photo capture offline, submit claim online after reconnect

Once those are locked, implementation can start without drifting back into
pay-later or offline KHQR complexity.

## Tracking

| Phase | Status | Notes |
|---|---|---|
| O1 Scope + contract lock | Completed | Locked cash settlement plus outage manual-claim handling scope. |
| O2 Push-sync operation contract | Completed | Added `checkout.cash.finalize` replay contract. |
| O3 Replay handler implementation | Completed | Offline cash checkout now replays atomically via push sync. |
| O4 Shared orchestration extraction | Completed | Direct cash finalize logic is shared between online and offline paths. |
| O5 Pull sync convergence | Completed | Replayed checkout emits normal sale/order deltas. |
| O6 Test matrix | Active | Offline cash replay coverage is in place; reconnect-submit outage claim backend path is ready; only true offline claim replay would need new coverage if later required. |

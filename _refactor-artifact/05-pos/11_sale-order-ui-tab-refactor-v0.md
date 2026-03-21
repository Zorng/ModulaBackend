# Sale + Order UI Tab Refactor (v0)

Status: Active (backend tab queries ready, frontend cutover pending)  
Owner context: Frontend POS / Sale-Order UI

## Why this tracker exists

The current order UI is being asked to represent three different concerns in one
mixed list:

- fulfillment work
- pay-later open-ticket management
- manual-claim payment reconciliation

Those are different operational queues with different row actions, different
chips, and different operator questions. One overloaded screen makes the UI
hard to understand and hard to filter correctly.

## Locked direction

Do not squeeze all order-related work into one mixed list.

Use three tabs:

1. `Fulfillment`
2. `Pay Later`
3. `Manual Claims`

Each tab should own:

- its own list query strategy
- its own empty state
- its own chips
- its own row actions

## Mental model

- `Fulfillment` answers: "what needs kitchen/service action now?"
- `Pay Later` answers: "which unpaid open tickets can still be edited or checked out?"
- `Manual Claims` answers: "which orders need payment-proof review or reconciliation follow-up?"

## Current backend mapping

### Tab 1 — Fulfillment

Purpose:

- all fulfillable work, regardless of whether customer paid first or later

Current backend query:

- `GET /v0/orders?view=FULFILLMENT_ACTIVE&limit=<n>&offset=<n>`

Current backend behavior:

- includes `OPEN` orders still in fulfillment flow
- includes `CHECKED_OUT` `DIRECT_CHECKOUT` orders still in fulfillment flow
- excludes `CANCELLED`
- excludes latest fulfillment status `COMPLETED` / `CANCELLED`

Primary UI chip:

- `fulfillmentStatus`

Recommended row actions:

- open detail
- update fulfillment status

## Tab 2 — Pay Later

Purpose:

- mutable unpaid tickets

Current backend query:

- `GET /v0/orders?view=PAY_LATER_EDITABLE&limit=<n>&offset=<n>`

Current backend behavior:

- includes only `OPEN` orders
- includes only `sourceMode = STANDARD`
- excludes orders whose latest manual payment claim already exists

Optional narrowing:

- `status=OPEN`
- `sourceMode=STANDARD`

Primary UI chip:

- this tab does not need payment chips to explain itself
- the tab itself already means "unpaid open ticket"

Recommended row actions:

- add items
- checkout
- cancel

## Tab 3 — Manual Claims

Purpose:

- payment reconciliation / review queue

Current backend query:

- `GET /v0/orders?view=MANUAL_CLAIM_REVIEW&limit=<n>&offset=<n>`

Current backend behavior:

- includes only `OPEN` orders
- includes `sourceMode = MANUAL_EXTERNAL_PAYMENT_CLAIM`
- also includes open orders whose latest manual payment claim already exists
- excludes direct-checkout paid orders

Recommended row focus:

- proof review
- claim status
- customer reference / note if shown in detail

Recommended row actions:

- open detail
- approve claim
- reject claim

## Chip guidance

Do not mix all three concepts into one chip model.

### Fulfillment tab

Main chip:

- `PENDING`
- `PREPARING`
- `READY`
- `COMPLETED`

Context chip if useful:

- `Direct checkout`
- `Pay later`

Avoid:

- `Pending payment` for already-paid direct-checkout rows

### Pay Later tab

Main chip:

- optional lifecycle chip if useful

Context:

- the tab already explains this is unpaid/open-ticket workflow

Avoid:

- mixing claim-review states into this tab

### Manual Claims tab

Main chip:

- `Claim pending`
- `Claim rejected`
- `Claim approved` only if historical visibility is desired

Avoid:

- using fulfillment lifecycle as the main meaning of this tab

## Recommended frontend query strategy (now)

### Backend-ready implementation

Run one query per tab:

- Fulfillment: `GET /v0/orders?view=FULFILLMENT_ACTIVE`
- Pay Later: `GET /v0/orders?view=PAY_LATER_EDITABLE`
- Manual Claims: `GET /v0/orders?view=MANUAL_CLAIM_REVIEW`

Optional extra narrowing:

- `status` can still be combined when useful
- `sourceMode=STANDARD|DIRECT_CHECKOUT|MANUAL_EXTERNAL_PAYMENT_CLAIM|ALL` is now supported for list reads

## Backend support status

The main backend read-side support for the three-tab UI is now in place.

### Backend filter 1 — `sourceMode`

Implemented on `GET /v0/orders`:

- `sourceMode=STANDARD|DIRECT_CHECKOUT|MANUAL_EXTERNAL_PAYMENT_CLAIM|ALL`

Benefit:

- allows extra narrowing without custom frontend inference
- useful for diagnostics and secondary admin views

### Backend filter 2 — `manualPaymentClaimStatus`

Not implemented:

- `manualPaymentClaimStatus=PENDING|REJECTED|APPROVED|NONE|ANY`

Benefit:

- `Manual Claims` becomes a first-class review queue
- removes client-side inference from summary rows

### Backend filter 3 — dedicated claim-review view

Implemented:

- `GET /v0/orders?view=MANUAL_CLAIM_REVIEW`

Benefit:

- mirrors the fulfillment queue model
- easier for frontend than combining multiple conditions

### Backend filter 4 — dedicated pay-later editable view

Implemented:

- `GET /v0/orders?view=PAY_LATER_EDITABLE`

Benefit:

- removes client-side partitioning of normal editable tickets
- keeps standard unpaid edit flow separate from claim-review flow

## Suggested phase plan

### U1 — IA lock

- lock the three-tab direction
- lock tab names
- lock row purpose per tab

### U2 — Fulfillment tab cutover

- move kitchen/counter flow to `GET /v0/orders?view=FULFILLMENT_ACTIVE`
- remove incorrect `Pending payment` chip from paid direct-checkout rows

### U3 — Pay Later tab cutover

- move unpaid mutable open tickets into dedicated tab
- use `GET /v0/orders?view=PAY_LATER_EDITABLE`

### U4 — Manual Claims tab cutover

- dedicate claim review screen/tab
- use `GET /v0/orders?view=MANUAL_CLAIM_REVIEW`
- separate reconciliation chips from fulfillment chips

### U5 — Optional backend filter uplift

- backend list uplift is already in place:
  - `sourceMode` filter
  - `view=PAY_LATER_EDITABLE`
  - `view=MANUAL_CLAIM_REVIEW`
- only `manualPaymentClaimStatus` remains optional if frontend later needs finer review filtering

## Tracking

| Phase | Status | Notes |
|---|---|---|
| U1 IA lock | Proposed | 3-tab split proposed: `Fulfillment`, `Pay Later`, `Manual Claims`. |
| U2 Fulfillment tab cutover | Proposed | Use `GET /v0/orders?view=FULFILLMENT_ACTIVE`; lifecycle-first UI. |
| U3 Pay Later tab cutover | Proposed | Backend-ready: use `GET /v0/orders?view=PAY_LATER_EDITABLE`. |
| U4 Manual Claims tab cutover | Proposed | Backend-ready: use `GET /v0/orders?view=MANUAL_CLAIM_REVIEW`. |
| U5 Optional backend filter uplift | Completed | `sourceMode` filter plus dedicated `PAY_LATER_EDITABLE` and `MANUAL_CLAIM_REVIEW` views are implemented. |

# Sale Checkout Remodel Spec (v0)

Status: Draft (design locked, no implementation yet)  
Owner context: POSOperation + PlatformSystem(KHQR)

## Purpose

Define a flow-first remodel so checkout no longer depends on server-side cart/order ticket for normal cashier payment flow.

## Problem statement

Current live flow persists:
- `order_tickets` + `order_ticket_lines` before payment, and
- `sales(status=PENDING)` before KHQR confirmation.

This causes:
- abandoned pending sales when KHQR is never paid,
- mismatch with target UX (cart should stay local until payment commit),
- extra server-side pre-payment state noise.

## Locked decisions

1. **Webhook-first KHQR confirmation** is primary.
2. `POST /v0/payments/khqr/confirm` remains as **secondary/manual fallback**.
3. If webhook is missed, successful manual confirm must reconcile and finalize.
4. **Late webhook is accepted** and must converge idempotently.
5. Unpaid/expired/cancelled KHQR flow must **not** create sale.

## Target UX flow

### Path A: Successful KHQR
1. Cashier builds cart locally.
2. Cashier initiates KHQR.
3. Customer scans/pays.
4. Backend confirms (webhook or manual confirm fallback).
5. Backend writes finalized sale.

### Path B: Unsuccessful KHQR
1. Cashier builds cart locally.
2. Cashier initiates KHQR.
3. Payment is never made / expires / cancelled.
4. Backend records only payment intent/attempt lifecycle and audit, **no sale row**.

## Target domain model

### Sale lifecycle
```ts
type SaleStatus = "FINALIZED" | "VOID_PENDING" | "VOIDED";
```

Rule:
- `sale` is a committed business event, never a pre-payment placeholder.

### Payment intent lifecycle
```ts
type PaymentIntentStatus =
  | "WAITING_FOR_PAYMENT"
  | "PAID_CONFIRMED"
  | "FINALIZED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED_PROOF";
```

Transition intent:
- `WAITING_FOR_PAYMENT -> EXPIRED`
- `WAITING_FOR_PAYMENT -> CANCELLED`
- `WAITING_FOR_PAYMENT -> PAID_CONFIRMED -> FINALIZED`
- `EXPIRED -> PAID_CONFIRMED -> FINALIZED` (late payment accepted)
- `FAILED_PROOF -> PAID_CONFIRMED -> FINALIZED` (after later valid proof)

## State transition rules

### Payment intent events
- `khqr.initiate` creates `WAITING_FOR_PAYMENT`.
- `khqr.webhook.confirmed` or `khqr.confirm.manual.confirmed`:
  - verifies proof,
  - moves to `PAID_CONFIRMED`,
  - runs finalize transaction,
  - moves to `FINALIZED` and links `saleId`.
- `khqr.reconcile.expired` sets `EXPIRED` when unpaid and past TTL.
- `khqr.intent.cancel` sets `CANCELLED` if not finalized.
- Proof mismatch sets `FAILED_PROOF` (or keeps retryable status based on policy).

### Sale creation trigger
- Sale is created only in finalize transaction after confirmed proof (or immediate cash finalization).

## Endpoint remodel (target contract)

### New checkout-first endpoints
- `POST /v0/checkout/cash/finalize`
- `POST /v0/checkout/khqr/initiate`
- `GET /v0/checkout/khqr/intents/:intentId`
- `POST /v0/checkout/khqr/intents/:intentId/cancel`

### KHQR confirmation
- Keep `POST /v0/payments/khqr/webhooks/provider` as primary.
- Keep `POST /v0/payments/khqr/confirm` as secondary/manual fallback.

### Existing order endpoints
- `/v0/orders*` moves out of default cashier checkout lane.
- Can remain for explicit order/fulfillment workflows if product still needs them.

## Data model delta (target)

Add `v0_payment_intents` (name can vary, concept is fixed) with:
- identity/context: `id`, `tenant_id`, `branch_id`, `created_by_account_id`
- lifecycle: `status`, `expires_at`, `finalized_at`, `cancelled_at`, `reason_code`
- settlement refs: `sale_id`, `active_attempt_id`
- immutable checkout snapshot:
  - cart lines snapshot (`menu_item_id`, name snapshot, modifiers snapshot, qty),
  - computed totals snapshot,
  - currency/fx snapshot,
  - pricing metadata/policy version
- audit fields: `created_at`, `updated_at`

Rewire KHQR attempts/evidences to reference `payment_intent_id` (not `sale_id`) in target model.

## Atomicity and idempotency contract

Finalization (KHQR confirmed) must be single routine shared by webhook/manual-confirm:
1. lock payment intent row,
2. if already finalized, return existing sale (idempotent),
3. create `sale + sale_lines + side effects` in one transaction,
4. link `sale_id` on intent and set `FINALIZED`,
5. append audit + outbox in same transaction.

## Error taxonomy (target additions)

- `PAYMENT_INTENT_NOT_FOUND`
- `PAYMENT_INTENT_NOT_FINALIZABLE`
- `PAYMENT_INTENT_ALREADY_FINALIZED`
- `PAYMENT_INTENT_ALREADY_CANCELLED`
- `PAYMENT_INTENT_EXPIRED`
- `KHQR_CONFIRMATION_REQUIRED`
- `KHQR_PROOF_MISMATCH`

## Cutover strategy

### Phase R1 — Contract + model lock
- Lock this spec and draft API contracts as pending-remodel sections.

### Phase R2 — KHQR intent lane
- Implement intent table and KHQR initiate/confirm/webhook finalization.
- Keep old flow alive until parity tests pass.

### Phase R3 — Cash finalize lane
- Add direct cash finalize checkout from local cart payload.

### Phase R4 — Deprecate server-cart checkout lane
- Stop using `/v0/orders*` for cashier payment path.
- Keep or remove order endpoints based on explicit fulfillment requirements.

## Test matrix (must-pass before cutover)

1. KHQR webhook confirmed -> sale finalized once.
2. Webhook missed -> manual confirm succeeds -> sale finalized.
3. Duplicate webhook/manual confirm -> no duplicate sale.
4. Expired unpaid intent -> no sale.
5. Late webhook after expired -> sale finalized once (accepted).
6. Cancelled intent -> no sale, cannot finalize.
7. Cash finalize -> sale finalized atomically with side effects.
8. Pull sync emits finalized sale changes only for committed sale writes.


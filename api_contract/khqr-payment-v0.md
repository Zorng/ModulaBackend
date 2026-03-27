# KHQR Payment Foundation (`/v0`) — API Contract

This document locks the KHQR payment foundation contract used by the active checkout-intent KHQR flow and legacy pending-sale compatibility endpoints.

Base path: `/v0/payments/khqr`

Implementation status:
- K1-K6 completed (`K5` webhook ingest + `K6` reconciliation scheduler baseline).
- Active final checkout lane uses `POST /v0/checkout/khqr/initiate` plus confirm/webhook convergence.
- Legacy pending-sale endpoints remain available for compatibility, but are not part of the final active sale-order lane.

---

## Checkout-Intent Finalization Model

Status:
- implemented for the direct checkout lane
- webhook and manual confirm converge on the same payment-intent finalization behavior

Primary confirmation path:

### 1) Provider webhook (primary)
`POST /v0/payments/khqr/webhooks/provider`

Target behavior:
- Verify webhook proof.
- If confirmed: reconcile + finalize sale atomically (idempotent).
- If duplicate webhook delivery: return idempotent success without duplicate finalization.

Secondary confirmation path:

### 2) Manual confirm by cashier (fallback)
`POST /v0/payments/khqr/confirm`  
Action key: `payment.khqr.confirm`

Body:
```json
{
  "md5": "khqr-md5"
}
```

Target response `200`:
```json
{
  "success": true,
  "data": {
    "verificationStatus": "CONFIRMED",
    "intent": {
      "id": "uuid",
      "status": "FINALIZED",
      "saleId": "uuid"
    },
    "sale": {
      "id": "uuid",
      "orderId": "uuid",
      "status": "FINALIZED",
      "saleType": "DINE_IN"
    }
  }
}
```

Rules:
- If webhook never arrives but manual confirm succeeds, backend must reconcile + finalize.
- Endpoint remains available for frontend as secondary/manual action.
- Late webhook is accepted and must converge idempotently.
- For checkout-intent KHQR flows:
  - frontend should keep the initiate `attempt.md5`
  - if `GET /v0/checkout/khqr/intents/:intentId` later shows `status = PAID_CONFIRMED` but `saleId = null`, call this endpoint as the cashier fallback to materialize the finalized sale/order

Intent lifecycle (target):
```ts
type PaymentIntentStatus =
  | "WAITING_FOR_PAYMENT"
  | "PAID_CONFIRMED"
  | "FINALIZED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED_PROOF";
```

Locked outcomes:
- Unpaid/expired/cancelled intent never creates `sale`.
- Finalization path is shared/idempotent for both webhook and manual confirm.

---

## Current Implemented Contract (Live)

The sections below (`Conventions`, `Types`, and `Endpoints`) describe the current implemented `/v0/payments/khqr` behavior.

---

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` / `branchId` come from working-context token.
  - no context override via query/body/headers.
- Idempotency:
  - write endpoints require `Idempotency-Key`.
  - replay returns stored result with `Idempotency-Replayed: true`.
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`

## Types

```ts
type KhqrCurrency = "USD" | "KHR";

type KhqrAttemptStatus =
  | "WAITING_FOR_PAYMENT"
  | "PAID_CONFIRMED"
  | "EXPIRED"
  | "SUPERSEDED"
  | "CANCELLED"
  | "PENDING_CONFIRMATION";

type KhqrVerificationStatus =
  | "CONFIRMED"
  | "UNPAID"
  | "MISMATCH"
  | "EXPIRED"
  | "NOT_FOUND";

type KhqrAttempt = {
  attemptId: string;
  paymentIntentId: string;
  saleId: string | null;
  md5: string;
  status: KhqrAttemptStatus;
  amount: number;
  currency: KhqrCurrency;
  toAccountId: string;
  expiresAt: string | null;
  paidConfirmedAt: string | null;
  supersededByAttemptId: string | null;
  createdAt: string;
  updatedAt: string;
};

type KhqrPayloadType = "DEEPLINK_URL" | "EMV_KHQR_STRING" | "TEXT";
```

## Endpoints

### Generation

#### 1) Generate KHQR for pending sale

`POST /v0/payments/khqr/sales/:saleId/generate`

Action key: `payment.khqr.generate`

Headers:
- `Idempotency-Key: <client key>`

Body:
```json
{
  "expiresInSeconds": 180
}
```

Success `201`:
```json
{
  "success": true,
  "data": {
    "attempt": {
      "attemptId": "uuid",
      "paymentIntentId": "uuid",
      "saleId": "uuid",
      "md5": "khqr-md5",
      "status": "WAITING_FOR_PAYMENT",
      "amount": 3.5,
      "currency": "USD",
      "toAccountId": "bakong-account-id",
      "expiresAt": "2026-02-21T10:30:00.000Z",
      "paidConfirmedAt": null,
      "supersededByAttemptId": null,
      "createdAt": "2026-02-21T10:00:00.000Z",
      "updatedAt": "2026-02-21T10:00:00.000Z"
    },
    "paymentRequest": {
      "md5": "khqr-md5",
      "payload": "khqr://...",
      "payloadFormat": "RAW_TEXT",
      "payloadType": "DEEPLINK_URL",
      "deepLinkUrl": "khqr://...",
      "amount": 3.5,
      "currency": "USD",
      "toAccountId": "bakong-account-id",
      "receiverName": "Main Branch Receiver",
      "expiresAt": "2026-02-21T10:30:00.000Z",
      "provider": "STUB",
      "providerReference": "stub:..."
    }
  }
}
```

Notes:
- `toAccountId` is resolved by backend from current branch KHQR receiver configuration.
- `receiverName` is also resolved by backend from current branch KHQR receiver configuration.
- Frontend must not supply receiver account during generation.
- `payloadType` indicates how client should consume `payload`:
  - `DEEPLINK_URL`: launch/link flow
  - `EMV_KHQR_STRING`: render as QR image
  - `TEXT`: fallback plain text mode
- `payload` is the primary QR data; for scanner-compatible mode it should be `EMV_KHQR_STRING`.
- `deepLinkUrl` is optional helper URL when provider supplies deeplink-style launch flow.

Errors:
- `404` `KHQR_SALE_NOT_FOUND`
- `422` `KHQR_SALE_PAYMENT_METHOD_INVALID`
- `422` `KHQR_SALE_STATUS_INVALID`
- `422` `KHQR_GENERATE_REQUIRES_OPEN_CASH_SESSION`
- `422` `KHQR_BRANCH_RECEIVER_NOT_CONFIGURED`
- `409` idempotency conflict/in-progress

### Payment Attempts

#### 2) Register KHQR payment attempt

`POST /v0/payments/khqr/attempts`

Action key: `payment.khqr.attempt.register`

Headers:
- `Idempotency-Key: <client key>`

Body:
```json
{
  "saleId": "uuid",
  "md5": "khqr-md5",
  "amount": 2.5,
  "currency": "USD",
  "expiresAt": "2026-02-21T10:30:00.000Z"
}
```

Success `201`:
```json
{
  "success": true,
  "data": {
    "attemptId": "uuid",
    "paymentIntentId": "uuid",
    "saleId": "uuid",
    "md5": "khqr-md5",
    "status": "WAITING_FOR_PAYMENT",
    "amount": 2.5,
    "currency": "USD",
    "toAccountId": "bakong-account-id",
    "expiresAt": "2026-02-21T10:30:00.000Z",
    "paidConfirmedAt": null,
    "supersededByAttemptId": null,
    "createdAt": "2026-02-21T10:00:00.000Z",
    "updatedAt": "2026-02-21T10:00:00.000Z"
  }
}
```

Notes:
- Registering a new active attempt for same sale marks older active attempt as `SUPERSEDED`.
- This endpoint only records attempt truth; it does not finalize sale.
- `toAccountId` is resolved by backend from current branch KHQR receiver configuration.
- `saleId` can be `null` for checkout-intent initiated KHQR flows until payment confirmation finalizes sale.
- For checkout-intent initiated KHQR flows, successful finalization now also materializes a `DIRECT_CHECKOUT` order anchor and an initial `PENDING` fulfillment batch; the order link is exposed as `sale.orderId` on finalize responses.

Errors:
- `422` validation errors (`KHQR_ATTEMPT_PAYLOAD_INVALID`)
- `409` `KHQR_ATTEMPT_ALREADY_TERMINAL` (if sale already finalized/voided when integrated)
- `409` idempotency conflict/in-progress

#### 2.1) Cancel KHQR payment attempt

`POST /v0/payments/khqr/attempts/:attemptId/cancel`

Action key: `payment.khqr.attempt.cancel`

Headers:
- `Idempotency-Key: <client key>`

Body (optional):
```json
{
  "reasonCode": "KHQR_CANCELLED_BY_CASHIER"
}
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "cancelled": true,
    "attempt": {
      "attemptId": "uuid",
      "paymentIntentId": "uuid",
      "saleId": "uuid",
      "md5": "khqr-md5",
      "status": "CANCELLED",
      "amount": 2.5,
      "currency": "USD",
      "toAccountId": "bakong-account-id",
      "expiresAt": "2026-02-21T10:30:00.000Z",
      "paidConfirmedAt": null,
      "supersededByAttemptId": null,
      "createdAt": "2026-02-21T10:00:00.000Z",
      "updatedAt": "2026-02-21T10:01:00.000Z"
    },
    "paymentIntent": {
      "paymentIntentId": "uuid",
      "saleId": "uuid",
      "status": "CANCELLED",
      "paymentMethod": "KHQR",
      "tenderCurrency": "USD",
      "tenderAmount": 2.5,
      "expectedToAccountId": "bakong-account-id",
      "activeAttemptId": null,
      "expiresAt": "2026-02-21T10:30:00.000Z",
      "paidConfirmedAt": null,
      "finalizedAt": null,
      "cancelledAt": "2026-02-21T10:01:00.000Z",
      "reasonCode": "KHQR_CANCELLED_BY_CASHIER",
      "createdAt": "2026-02-21T10:00:00.000Z",
      "updatedAt": "2026-02-21T10:01:00.000Z"
    }
  }
}
```

Errors:
- `404` `KHQR_ATTEMPT_NOT_FOUND`
- `404` `PAYMENT_INTENT_NOT_FOUND`
- `409` `KHQR_ATTEMPT_NOT_CANCELLABLE`
- `409` `PAYMENT_INTENT_ALREADY_FINALIZED`
- `409` `PAYMENT_INTENT_NOT_CANCELLABLE`
- `409` idempotency conflict/in-progress

#### 3) Get KHQR payment attempt by id

`GET /v0/payments/khqr/attempts/:attemptId`

Action key: `payment.khqr.attempt.read`

Success `200`:
```json
{
  "success": true,
  "data": {
    "attemptId": "uuid",
    "paymentIntentId": "uuid",
    "saleId": "uuid",
    "md5": "khqr-md5",
    "status": "WAITING_FOR_PAYMENT",
    "amount": 2.5,
    "currency": "USD",
    "toAccountId": "bakong-account-id",
    "expiresAt": "2026-02-21T10:30:00.000Z",
    "paidConfirmedAt": null,
    "supersededByAttemptId": null,
    "createdAt": "2026-02-21T10:00:00.000Z",
    "updatedAt": "2026-02-21T10:00:00.000Z"
  }
}
```

Errors:
- `404` `KHQR_ATTEMPT_NOT_FOUND`

#### 4) Get KHQR payment attempt by md5

`GET /v0/payments/khqr/attempts/by-md5/:md5`

Action key: `payment.khqr.attempt.readByMd5`

Response shape and errors are the same as endpoint #2.

### Confirmation

#### 5) Confirm KHQR payment by md5 (backend verification)

`POST /v0/payments/khqr/confirm`

Action key: `payment.khqr.confirm`

Headers:
- `Idempotency-Key: <client key>`

Body:
```json
{
  "md5": "khqr-md5"
}
```

Success `200` (proof confirmed):
```json
{
  "success": true,
  "data": {
    "verificationStatus": "CONFIRMED",
    "saleFinalized": true,
    "attempt": {
      "attemptId": "uuid",
      "paymentIntentId": "uuid",
      "saleId": "uuid",
      "md5": "khqr-md5",
      "status": "PAID_CONFIRMED",
      "amount": 2.5,
      "currency": "USD",
      "toAccountId": "bakong-account-id",
      "expiresAt": "2026-02-21T10:30:00.000Z",
      "paidConfirmedAt": "2026-02-21T10:02:10.000Z",
      "supersededByAttemptId": null,
      "createdAt": "2026-02-21T10:00:00.000Z",
      "updatedAt": "2026-02-21T10:02:10.000Z"
    },
    "sale": {
      "saleId": "uuid",
      "orderId": "uuid",
      "status": "FINALIZED",
      "saleType": "DINE_IN"
    },
    "receipt": {
      "receiptId": "uuid",
      "saleId": "uuid",
      "statusDisplay": "NORMAL",
      "issuedAt": "2026-02-21T10:02:10.000Z",
      "saleSnapshot": {
        "paymentMethod": "KHQR",
        "tenderCurrency": "USD",
        "subtotalUsd": 2.5,
        "subtotalKhr": 10250,
        "discountUsd": 0,
        "discountKhr": 0,
        "vatUsd": 0,
        "vatKhr": 0,
        "grandTotalUsd": 2.5,
        "grandTotalKhr": 10250,
        "tenderAmount": 2.5,
        "paidAmount": 2.5
      },
      "lines": []
    }
  }
}
```

Success `200` (not yet paid):
```json
{
  "success": true,
  "data": {
    "verificationStatus": "UNPAID",
    "saleFinalized": false,
    "attempt": {
      "attemptId": "uuid",
      "paymentIntentId": "uuid",
      "saleId": "uuid",
      "md5": "khqr-md5",
      "status": "WAITING_FOR_PAYMENT",
      "amount": 2.5,
      "currency": "USD",
      "toAccountId": "bakong-account-id",
      "expiresAt": "2026-02-21T10:30:00.000Z",
      "paidConfirmedAt": null,
      "supersededByAttemptId": null,
      "createdAt": "2026-02-21T10:00:00.000Z",
      "updatedAt": "2026-02-21T10:00:00.000Z"
    },
    "sale": null
  }
}
```

Success `200` (proof mismatch):
```json
{
  "success": true,
  "data": {
    "verificationStatus": "MISMATCH",
    "saleFinalized": false,
    "attempt": {
      "attemptId": "uuid",
      "paymentIntentId": "uuid",
      "saleId": "uuid",
      "md5": "khqr-md5",
      "status": "PENDING_CONFIRMATION",
      "amount": 2.5,
      "currency": "USD",
      "toAccountId": "bakong-account-id",
      "expiresAt": "2026-02-21T10:30:00.000Z",
      "paidConfirmedAt": null,
      "supersededByAttemptId": null,
      "createdAt": "2026-02-21T10:00:00.000Z",
      "updatedAt": "2026-02-21T10:02:10.000Z"
    },
    "sale": null,
    "mismatchReasonCode": "KHQR_PROOF_MISMATCH"
  }
}
```

Errors:
- `404` `KHQR_ATTEMPT_NOT_FOUND`
- `422` `KHQR_ATTEMPT_PAYLOAD_INVALID`
- `503` `KHQR_PROVIDER_UNAVAILABLE`
- `409` idempotency conflict/in-progress

### Webhook Ingestion

#### 6) Ingest provider webhook event (open route)

`POST /v0/payments/khqr/webhooks/provider`

Headers:
- `x-khqr-webhook-secret: <shared-secret>`

Body:
```json
{
  "tenantId": "uuid",
  "branchId": "uuid",
  "md5": "khqr-md5",
  "providerEventId": "evt-123",
  "providerTxHash": "tx-abc",
  "providerReference": "bakong-ref",
  "verificationStatus": "CONFIRMED",
  "confirmedAmount": 2.5,
  "confirmedCurrency": "USD",
  "confirmedToAccountId": "bakong-account-id",
  "occurredAt": "2026-02-21T10:05:00.000Z"
}
```

Success `200` (applied):
```json
{
  "success": true,
  "data": {
    "status": "APPLIED",
    "verificationStatus": "CONFIRMED",
    "mismatchReasonCode": null,
    "saleFinalized": true,
    "providerEventId": "evt-123",
    "attempt": {
      "attemptId": "uuid",
      "paymentIntentId": "uuid",
      "saleId": "uuid",
      "md5": "khqr-md5",
      "status": "PAID_CONFIRMED",
      "amount": 2.5,
      "currency": "USD",
      "toAccountId": "bakong-account-id",
      "expiresAt": null,
      "paidConfirmedAt": "2026-02-21T10:05:00.000Z",
      "supersededByAttemptId": null,
      "createdAt": "2026-02-21T10:00:00.000Z",
      "updatedAt": "2026-02-21T10:05:00.000Z"
    },
    "sale": {
      "saleId": "uuid",
      "orderId": "uuid",
      "status": "FINALIZED",
      "saleType": "DINE_IN"
    }
  }
}
```

Success `200` (duplicate provider event id):
```json
{
  "success": true,
  "data": {
    "status": "DUPLICATE",
    "verificationStatus": "CONFIRMED",
    "mismatchReasonCode": null,
    "saleFinalized": false,
    "providerEventId": "evt-123",
    "attempt": { "attemptId": "uuid", "paymentIntentId": "uuid" },
    "sale": null
  }
}
```

Success `202` (attempt not found for provided md5/context):
```json
{
  "success": true,
  "data": {
    "status": "IGNORED",
    "verificationStatus": null,
    "mismatchReasonCode": null,
    "saleFinalized": false,
    "providerEventId": "evt-123",
    "attempt": null,
    "sale": null
  }
}
```

Notes:
- Webhook ingestion is idempotent by `(tenantId, branchId, provider, providerEventId)`.
- `verificationStatus = CONFIRMED` is proof-checked against attempt expectation; mismatch becomes:
  - `verificationStatus = MISMATCH`
  - `attempt.status = PENDING_CONFIRMATION`
  - `mismatchReasonCode = KHQR_PROOF_MISMATCH`
- Provider verify response accepts both contracts:
  - explicit `verificationStatus` response shape
  - Bakong Open API shape (`responseCode` + `data`) mapped by backend to verification truth

Errors:
- `401` `KHQR_WEBHOOK_UNAUTHORIZED`
- `422` `KHQR_WEBHOOK_PAYLOAD_INVALID`

### Reconciliation Scheduler (no HTTP endpoint)

Runtime dispatcher periodically re-checks `WAITING_FOR_PAYMENT` and `PENDING_CONFIRMATION` attempts:
- verifies payment proof via provider adapter
- marks stale attempts `EXPIRED` when `expiresAt` has elapsed
- records confirmation evidence and updates attempt status

Runtime env controls:
- `V0_KHQR_PROVIDER` (`stub` | `bakong` | `bakong_http`)
- `V0_KHQR_PROVIDER_BASE_URL`
- `V0_KHQR_PROVIDER_GENERATE_URL` (optional explicit URL)
- `V0_KHQR_PROVIDER_VERIFY_URL` (optional explicit URL)
- `V0_KHQR_ENABLE_SDK_GENERATION` (optional boolean; when enabled, generate uses local Bakong SDK EMV builder)
- `V0_KHQR_PROVIDER_API_KEY` (optional provider API key)
- `V0_KHQR_PROVIDER_API_KEY_HEADER` (default `x-api-key`)
- `V0_KHQR_PROVIDER_TIMEOUT_MS` (default `5000`)
- `V0_KHQR_WEBHOOK_SECRET`
- `V0_KHQR_WEBHOOK_SECRET_HEADER` (default `x-khqr-webhook-secret`)
- `V0_KHQR_ATTEMPT_TTL_SECONDS` (default `300`)
- `V0_KHQR_RECONCILIATION_ENABLED` (default `true`)
- `V0_KHQR_RECONCILIATION_INTERVAL_MS` (default `30000`)
- `V0_KHQR_RECONCILIATION_BATCH_SIZE` (default `50`)
- `V0_KHQR_RECONCILIATION_RECHECK_WINDOW_MINUTES` (default `2`)

## Sale-Order dependency (locked)

When `sale-order` finalize path uses KHQR:
- finalize request must include KHQR reference (`md5` or resolved `attemptId`).
- finalize must be rejected when confirmation is missing:
  - `SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED`
- finalize must be rejected when proof mismatches expected amount/currency/receiver:
  - `SALE_FINALIZE_KHQR_PROOF_MISMATCH`

These denial codes are intentionally owned by sale-order orchestration, while this KHQR module provides confirmation truth.

## Frontend Notes

- Generation of KHQR payload/QR is frontend-side; payment truth is backend confirmation.
- Register every attempt before waiting for payment confirmation.
- For checkout-intent KHQR:
  - keep both `paymentIntentId` and `md5` from initiate
  - poll `GET /v0/checkout/khqr/intents/:intentId`
  - if intent becomes `FINALIZED` with non-null `saleId`, finalization is already complete
  - if intent becomes `PAID_CONFIRMED` with `saleId = null`, call `POST /v0/payments/khqr/confirm` with `md5`
- `GET /v0/checkout/khqr/intents/:intentId` is payment-intent status truth, but it is not itself a finalize command.
- On reconnect, re-confirm by `md5` and then continue finalize flow.
- Treat `UNPAID` as retryable polling; treat `MISMATCH` as manual intervention required.

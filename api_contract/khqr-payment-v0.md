# KHQR Payment Foundation (`/v0`) — API Contract

This document locks the KHQR payment foundation contract used by sale-order finalize flow.

Base path: `/v0/payments/khqr`

Implementation status:
- K1-K6 completed (`K5` webhook ingest + `K6` reconciliation scheduler baseline).
- Endpoints below are implemented for KHQR generation, attempt registration/read, confirm-by-md5, and webhook ingestion.
- Sale finalize gate is enforced on online `/v0/sales/:saleId/finalize`.

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
  | "PENDING_CONFIRMATION";

type KhqrVerificationStatus =
  | "CONFIRMED"
  | "UNPAID"
  | "MISMATCH"
  | "EXPIRED"
  | "NOT_FOUND";

type KhqrAttempt = {
  attemptId: string;
  saleId: string;
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
      "expiresAt": "2026-02-21T10:30:00.000Z",
      "provider": "STUB",
      "providerReference": "stub:..."
    }
  }
}
```

Notes:
- `toAccountId` is resolved by backend from current branch KHQR receiver configuration.
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

Errors:
- `422` validation errors (`KHQR_ATTEMPT_PAYLOAD_INVALID`)
- `409` `KHQR_ATTEMPT_ALREADY_TERMINAL` (if sale already finalized/voided when integrated)
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
    "attempt": {
      "attemptId": "uuid",
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
    "attempt": {
      "attemptId": "uuid",
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
}
```

Success `200` (proof mismatch):
```json
{
  "success": true,
  "data": {
    "verificationStatus": "MISMATCH",
    "attempt": {
      "attemptId": "uuid",
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
    "providerEventId": "evt-123",
    "attempt": {
      "attemptId": "uuid",
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
    "providerEventId": "evt-123",
    "attempt": { "attemptId": "uuid" }
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
    "providerEventId": "evt-123",
    "attempt": null
  }
}
```

Notes:
- Webhook ingestion is idempotent by `(tenantId, branchId, provider, providerEventId)`.
- `verificationStatus = CONFIRMED` is proof-checked against attempt expectation; mismatch becomes:
  - `verificationStatus = MISMATCH`
  - `attempt.status = PENDING_CONFIRMATION`
  - `mismatchReasonCode = KHQR_PROOF_MISMATCH`

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
- On reconnect, re-confirm by `md5` and then continue finalize flow.
- Treat `UNPAID` as retryable polling; treat `MISMATCH` as manual intervention required.

# Offline Sync Module — API Contract (Frontend)

This document describes the **current** Offline Sync HTTP contract exposed by the backend.

**Base path:** `/v1/sync`  
**Auth header:** `Authorization: Bearer <accessToken>`  
**Scope (demo):** Offline Sale + Cash Session Open/Close only

---

## Conventions

### IDs
- All IDs are UUID strings.

### Error shape (HTTP-level)
Validation/auth errors return:
```json
{ "error": "Human readable message" }
```

### Operation-level failures
Operational failures (e.g., frozen branch) are returned **inside** the `200` response as per-operation `status: "FAILED"` with `error_code`.

### Casing
- Offline Sync uses `snake_case` in request/response bodies.

---

## Types

### `OfflineSyncOperationType`
```ts
type OfflineSyncOperationType =
  | "SALE_FINALIZED"
  | "CASH_SESSION_OPENED"
  | "CASH_SESSION_CLOSED";
```

### `OfflineSyncOperationStatus`
```ts
type OfflineSyncOperationStatus = "APPLIED" | "FAILED";
```

### `OfflineSyncErrorCode`
```ts
type OfflineSyncErrorCode =
  | "BRANCH_FROZEN"
  | "VALIDATION_FAILED"
  | "DEPENDENCY_MISSING"
  | "NOT_IMPLEMENTED"
  | "UNKNOWN";
```

### `OfflineSyncOperation`
```ts
type OfflineSyncOperation = {
  client_op_id: string; // UUID (idempotency key)
  type: OfflineSyncOperationType;
  payload: unknown;     // shape depends on `type`
  occurred_at?: string; // ISO date-time (client timestamp; audit only)
  branch_id?: string;   // optional; must match authenticated branch if provided
};
```

### `ApplyOperationsRequest`
```ts
type ApplyOperationsRequest = {
  operations: OfflineSyncOperation[]; // 1..100, processed FIFO
};
```

### `AppliedResult` (per operation type)
```ts
type AppliedResult =
  | { type: "SALE_FINALIZED"; sale_id: string }
  | { type: "CASH_SESSION_OPENED"; session_id: string }
  | { type: "CASH_SESSION_CLOSED"; session_id: string; status: string };
```

### `ApplyOperationsResultItem`
```ts
type ApplyOperationsResultItem = {
  client_op_id: string;
  type: OfflineSyncOperationType;
  status: OfflineSyncOperationStatus;
  deduped: boolean;               // true when `client_op_id` already processed
  result?: AppliedResult;         // present when status=APPLIED
  error_code?: OfflineSyncErrorCode;     // present when status=FAILED
  error_message?: string;         // present when status=FAILED
};
```

### `ApplyOperationsResponse`
```ts
type ApplyOperationsResponse = {
  results: ApplyOperationsResultItem[];
  stopped_at?: number; // index in input `operations` where processing stopped (first failure)
};
```

---

## Payload Shapes (Demo-supported)

### 1) `SALE_FINALIZED` payload
```ts
type SaleFinalizedPayload = {
  client_sale_uuid: string; // UUID
  sale_type: "dine_in" | "take_away" | "delivery";
  items: Array<{
    menu_item_id: string; // UUID
    quantity: number;     // int >= 1
    modifiers?: any[];    // accepted but not deeply validated in demo
  }>;
  tender_currency: "KHR" | "USD";
  payment_method: "cash" | "qr"; // demo scope
  cash_received?: { khr?: number; usd?: number }; // optional (recommended for cash)
};
```

Notes:
- Backend pricing is **server-authoritative** (menu/policy read at apply time).
- Client timestamps are **audit-only**; integrity ordering is backend/DB-transaction order.

### 2) `CASH_SESSION_OPENED` payload
```ts
type CashSessionOpenedPayload = {
  register_id?: string;       // UUID (optional)
  opening_float_usd: number;  // >= 0
  opening_float_khr: number;  // >= 0
  note?: string;              // max 500 chars
};
```

### 3) `CASH_SESSION_CLOSED` payload
```ts
type CashSessionClosedPayload = {
  session_id: string;        // UUID
  counted_cash_usd: number;  // >= 0
  counted_cash_khr: number;  // >= 0
  note?: string;             // max 500 chars
};
```

---

## Endpoints

### 1) Apply queued offline operations (Authenticated)
`POST /v1/sync/apply`

Behavior:
- Processes operations in **FIFO** order.
- Stops at the **first failure** and returns `stopped_at` (index in the submitted array).
- Ensures exactly-once semantics via `(tenant_id, client_op_id)`:
  - If `client_op_id` already processed, returns the stored result with `deduped: true` (no re-apply).
- Frozen branch enforcement:
  - Operations for a frozen branch fail deterministically with `error_code: "BRANCH_FROZEN"`.

Request body:
```json
{
  "operations": [
    {
      "client_op_id": "11111111-1111-4111-8111-111111111111",
      "type": "CASH_SESSION_OPENED",
      "occurred_at": "2025-01-01T10:00:00.000Z",
      "payload": { "opening_float_usd": 10, "opening_float_khr": 0 }
    },
    {
      "client_op_id": "22222222-2222-4222-8222-222222222222",
      "type": "SALE_FINALIZED",
      "occurred_at": "2025-01-01T10:05:00.000Z",
      "payload": {
        "client_sale_uuid": "33333333-3333-4333-8333-333333333333",
        "sale_type": "dine_in",
        "items": [{ "menu_item_id": "uuid", "quantity": 1, "modifiers": [] }],
        "tender_currency": "USD",
        "payment_method": "cash",
        "cash_received": { "usd": 10 }
      }
    }
  ]
}
```

Response `200` (all applied):
```json
{
  "results": [
    {
      "client_op_id": "11111111-1111-4111-8111-111111111111",
      "type": "CASH_SESSION_OPENED",
      "status": "APPLIED",
      "deduped": false,
      "result": { "type": "CASH_SESSION_OPENED", "session_id": "uuid" }
    },
    {
      "client_op_id": "22222222-2222-4222-8222-222222222222",
      "type": "SALE_FINALIZED",
      "status": "APPLIED",
      "deduped": false,
      "result": { "type": "SALE_FINALIZED", "sale_id": "uuid" }
    }
  ]
}
```

Response `200` (stops on first failure):
```json
{
  "results": [
    {
      "client_op_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "type": "CASH_SESSION_OPENED",
      "status": "FAILED",
      "deduped": false,
      "error_code": "BRANCH_FROZEN",
      "error_message": "Branch is frozen"
    }
  ],
  "stopped_at": 0
}
```

Errors:
- `401` if missing/invalid auth
- `422` if body is invalid (e.g., operations empty, >100, invalid UUIDs, unknown type)
- `500` on unexpected server errors

---

## Notes for Frontend
- Retrying the same operation **must** reuse the same `client_op_id`.
- When `status=FAILED` and `error_code="BRANCH_FROZEN"`, the operation should be marked as **permanent failure** (do not retry).
- Only the 3 demo operation types above are supported; all other ModSpec offline operations remain TODO.


# Push Sync Module (`/v0`) — API Contract

This document locks the replay (push-sync) HTTP contract for server-side processing of offline operation batches.

Base path: `/v0/sync`

Compatibility alias (transitional):
- `POST /v0/sync/replay`
- `GET /v0/sync/replay/batches/:batchId`

Implementation status:
- replay lane is active for selected offline-safe operations
- final sale-order scope supports offline replay only for direct cash checkout finalize
- reconnect-submit manual-claim workflow is active in sale-order, but its capture/replay operation is still out of push-sync scope

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` and `branchId` come from working-context token
  - per-operation `tenantId` / `branchId` are optional for backward compatibility but mismatches are rejected

## Types

```ts
type PushSyncOperationType =
  | "checkout.cash.finalize"
  | "sale.finalize" // accepted legacy compatibility type; currently unsupported at replay
  | "cashSession.open"
  | "cashSession.movement"
  | "cashSession.close"
  | "attendance.startWork"
  | "attendance.endWork";

type PushSyncReplayStatus = "APPLIED" | "DUPLICATE" | "FAILED";

type PushSyncOperationEnvelope = {
  clientOpId: string;
  operationType: PushSyncOperationType;
  deviceId?: string;
  dependsOn?: string[];
  occurredAt: string;
  payload: Record<string, unknown>;
};
```

## Endpoints

### 1) Push queued operations

`POST /v0/sync/push`

Action key: `pushSync.apply`

Body:

```json
{
  "deviceId": "tablet-front-counter-01",
  "operations": [
    {
      "clientOpId": "7b6c62d2-4f68-4125-a6e6-8e8dce0e2f36",
      "operationType": "checkout.cash.finalize",
      "occurredAt": "2026-02-19T10:00:00.000Z",
      "dependsOn": [],
      "payload": {
        "items": [
          {
            "menuItemId": "uuid",
            "quantity": 1,
            "modifierSelections": [],
            "note": null
          }
        ],
        "saleType": "DINE_IN",
        "tenderCurrency": "USD",
        "cashReceivedTenderAmount": 10
      }
    }
  ],
  "haltOnFailure": true
}
```

Behavior:
- operations are processed in request order
- replay is idempotent by `(tenantId, branchId, clientOpId)`
- `haltOnFailure=true` stops at first permanent failure
- `dependsOn` requires earlier successful application

Response `200`:

```json
{
  "success": true,
  "data": {
    "batchId": "uuid",
    "results": [
      {
        "index": 0,
        "clientOpId": "7b6c62d2-4f68-4125-a6e6-8e8dce0e2f36",
        "operationType": "checkout.cash.finalize",
        "status": "APPLIED",
        "resultRefId": "sale-uuid"
      }
    ],
    "stoppedAt": null
  }
}
```

### 2) Get push batch detail

`GET /v0/sync/push/batches/:batchId`

Action key: `pushSync.read`

## Operation Scope

Active replay-enabled operations:
- `checkout.cash.finalize`
- `cashSession.open`
- `cashSession.movement`
- `cashSession.close`
- `attendance.startWork`
- `attendance.endWork`

Legacy compatibility operation type:
- `sale.finalize`
  - still accepted by parser
  - currently returns `OFFLINE_SYNC_OPERATION_NOT_SUPPORTED`

Still not replay-enabled in the active push-sync scope:
- `order.manualExternalPaymentClaim.capture`

## Deterministic Failure Codes

- `OFFLINE_SYNC_CONTEXT_MISMATCH`
- `OFFLINE_SYNC_OPERATION_NOT_SUPPORTED`
- `OFFLINE_SYNC_DEPENDENCY_MISSING`
- `OFFLINE_SYNC_PAYLOAD_INVALID`
- `OFFLINE_SYNC_PAYLOAD_CONFLICT`
- `OFFLINE_SYNC_IN_PROGRESS`

Propagated from underlying commands:
- `BRANCH_FROZEN`
- `SUBSCRIPTION_FROZEN`
- `ENTITLEMENT_BLOCKED`
- `ENTITLEMENT_READ_ONLY`
- `NO_MEMBERSHIP`
- `NO_BRANCH_ACCESS`
- `PERMISSION_DENIED`

## Notes

- Final sale-order offline scope is intentionally narrow: replay is supported for pay-first cash checkout only.
- Manual external-payment-claim is active again through normal online HTTP after reconnect.
- Deferred open-order/manual-claim replay is still not part of the active push-sync contract.

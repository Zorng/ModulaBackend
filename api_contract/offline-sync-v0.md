# Offline Sync Module (`/v0`) — API Contract

This document locks the target `/v0/offline-sync` HTTP contract for server-side replay of offline operation batches.

Base path: `/v0/offline-sync`

Implementation status:
- Phase S1 contract lock completed.
- Endpoints below are target contract for S2-S5 rollout.

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` and `branchId` come from working-context token.
  - each replay operation also includes `tenantId` and `branchId`; backend rejects mismatches.
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`

## Types

```ts
type OfflineOperationType =
  | "sale.finalize"
  | "cashSession.open"
  | "cashSession.movement"
  | "cashSession.close"
  | "attendance.startWork"
  | "attendance.endWork";

type OfflineReplayStatus = "APPLIED" | "DUPLICATE" | "FAILED";

type OfflineOperationEnvelope = {
  clientOpId: string; // idempotency identity from client queue
  operationType: OfflineOperationType;
  tenantId: string;
  branchId: string;
  occurredAt: string; // ISO datetime (client timestamp, informational)
  payload: Record<string, unknown>;
};

type OfflineReplayResult = {
  index: number;
  clientOpId: string;
  operationType: OfflineOperationType;
  status: OfflineReplayStatus;
  code?: string; // failure code
  message?: string; // failure message
  resultRefId?: string; // created/affected aggregate id (if APPLIED)
};
```

## Endpoints

### 1) Replay queued operations

`POST /v0/offline-sync/replay`

Action key: `offlineSync.replay.apply`

Body:
```json
{
  "operations": [
    {
      "clientOpId": "7b6c62d2-4f68-4125-a6e6-8e8dce0e2f36",
      "operationType": "cashSession.open",
      "tenantId": "uuid",
      "branchId": "uuid",
      "occurredAt": "2026-02-19T10:00:00.000Z",
      "payload": {
        "openingFloatUsd": 20,
        "openingFloatKhr": 50000,
        "note": "offline open"
      }
    }
  ],
  "haltOnFailure": true
}
```

Behavior:
- operations are processed in request order (FIFO)
- replay is idempotent by `(tenantId, branchId, clientOpId)`
- `haltOnFailure=true` (default) stops at first permanent failure

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
        "operationType": "cashSession.open",
        "status": "APPLIED",
        "resultRefId": "session-uuid"
      }
    ],
    "stoppedAt": null
  }
}
```

Failure result example (still `200`, operation-level failure):
```json
{
  "success": true,
  "data": {
    "batchId": "uuid",
    "results": [
      {
        "index": 0,
        "clientOpId": "op-uuid",
        "operationType": "sale.finalize",
        "status": "FAILED",
        "code": "OFFLINE_SYNC_DEPENDENCY_MISSING",
        "message": "required cash session not found"
      }
    ],
    "stoppedAt": 0
  }
}
```

Errors:
- `401` missing/invalid token
- `403` context/membership/branch access denial
- `422` `OFFLINE_SYNC_CONTEXT_MISMATCH`
- `422` `OFFLINE_SYNC_PAYLOAD_INVALID`

### 2) Get replay batch detail

`GET /v0/offline-sync/replay/batches/:batchId`

Action key: `offlineSync.replay.read`

Response `200`:
```json
{
  "success": true,
  "data": {
    "batchId": "uuid",
    "tenantId": "uuid",
    "branchId": "uuid",
    "createdAt": "2026-02-19T10:30:00.000Z",
    "results": [
      {
        "index": 0,
        "clientOpId": "op-uuid",
        "operationType": "cashSession.close",
        "status": "DUPLICATE",
        "resultRefId": "session-uuid"
      }
    ]
  }
}
```

Errors:
- `404` `OFFLINE_SYNC_BATCH_NOT_FOUND`
- `403` access denial for non-owned context

## Deterministic Failure Codes

Module-specific:
- `OFFLINE_SYNC_CONTEXT_MISMATCH`
- `OFFLINE_SYNC_OPERATION_NOT_SUPPORTED`
- `OFFLINE_SYNC_DEPENDENCY_MISSING`
- `OFFLINE_SYNC_PAYLOAD_INVALID`

Propagated from underlying command checks:
- `BRANCH_FROZEN`
- `SUBSCRIPTION_FROZEN`
- `ENTITLEMENT_BLOCKED`
- `ENTITLEMENT_READ_ONLY`
- `NO_MEMBERSHIP`
- `NO_BRANCH_ACCESS`
- `PERMISSION_DENIED`

## Frontend Notes

- Reuse the same `clientOpId` on retries of the same local op.
- Treat `DUPLICATE` as successful replay (already applied).
- For `FAILED` with deterministic codes (for example `BRANCH_FROZEN`), mark op as permanent failure and stop blind retries.


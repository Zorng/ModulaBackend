# Offline Sync Module (`/v0`) — API Contract

This document locks the target `/v0/offline-sync` HTTP contract for server-side replay of offline operation batches.

Base path: `/v0/offline-sync`

Implementation status:
- Phase S1-S5 completed (contract + schema + replay/query command surface + ACL mapping + reliability coverage + close-out sync).

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` and `branchId` come from working-context token.
  - canonical v0 envelope does not require per-operation `tenantId`/`branchId`.
  - backward compatibility: if per-operation `tenantId`/`branchId` are provided, backend validates and rejects mismatches.
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
  deviceId?: string; // optional per-op override; otherwise top-level deviceId
  dependsOn?: string[]; // optional list of prior clientOpIds
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
  resolution?: {
    category: "RETRYABLE" | "PERMANENT" | "MANUAL";
    retryAfterMs: number | null;
    action: string;
  };
};
```

## Endpoints

### 1) Replay queued operations

`POST /v0/offline-sync/replay`

Action key: `offlineSync.replay.apply`

Body:
```json
{
  "deviceId": "tablet-front-counter-01",
  "operations": [
    {
      "clientOpId": "7b6c62d2-4f68-4125-a6e6-8e8dce0e2f36",
      "operationType": "cashSession.open",
      "occurredAt": "2026-02-19T10:00:00.000Z",
      "dependsOn": [],
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
- replay is idempotent by `(token.tenantId, token.branchId, clientOpId)`
- `haltOnFailure=true` (default) stops at first permanent failure
- in-progress operations are lease-based:
  - if same `clientOpId` is still actively leased, backend returns `OFFLINE_SYNC_IN_PROGRESS`
  - if lease is stale/expired, backend can reclaim and continue replay for the same payload
- optional envelope fields:
  - top-level `deviceId` (recommended for parity with sync pull checkpoints)
  - per-op `dependsOn` enforces dependency precondition:
    - each dependency must resolve to an `APPLIED`/`DUPLICATE` op (either prior in same batch or already persisted from previous replay)
    - if unresolved, op fails with `OFFLINE_SYNC_DEPENDENCY_MISSING`
    - if dependency is present in same batch, it must appear earlier than dependent op; otherwise request is rejected as `OFFLINE_SYNC_PAYLOAD_INVALID`

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
        "message": "required cash session not found",
        "resolution": {
          "category": "MANUAL",
          "retryAfterMs": null,
          "action": "requires_user_intervention"
        }
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
- `OFFLINE_SYNC_PAYLOAD_CONFLICT`
- `OFFLINE_SYNC_IN_PROGRESS`

Propagated from underlying command checks:
- `BRANCH_FROZEN`
- `SUBSCRIPTION_FROZEN`
- `ENTITLEMENT_BLOCKED`
- `ENTITLEMENT_READ_ONLY`
- `NO_MEMBERSHIP`
- `NO_BRANCH_ACCESS`
- `PERMISSION_DENIED`

### Resolution Hint Taxonomy

- `RETRYABLE`
  - `OFFLINE_SYNC_IN_PROGRESS`
  - `OFFLINE_SYNC_OPERATION_FAILED`
- `MANUAL`
  - `OFFLINE_SYNC_DEPENDENCY_MISSING`
  - `CASH_SESSION_NOT_FOUND`
  - `CASH_SESSION_ALREADY_OPEN`
  - `CASH_SESSION_NOT_OPEN`
  - `ATTENDANCE_ALREADY_CHECKED_IN`
  - `ATTENDANCE_NO_ACTIVE_CHECKIN`
  - `BRANCH_FROZEN`
  - `SUBSCRIPTION_FROZEN`
  - `ENTITLEMENT_BLOCKED`
  - `ENTITLEMENT_READ_ONLY`
  - `NO_MEMBERSHIP`
  - `NO_BRANCH_ACCESS`
  - `PERMISSION_DENIED`
- `PERMANENT`
  - payload/context/validation mismatches such as:
    - `OFFLINE_SYNC_PAYLOAD_CONFLICT`
    - `OFFLINE_SYNC_PAYLOAD_INVALID`
    - `OFFLINE_SYNC_CONTEXT_MISMATCH`
    - `OFFLINE_SYNC_OPERATION_NOT_SUPPORTED`
  - and other deterministic invariant denials not marked retryable/manual

## Frontend Notes

- Reuse the same `clientOpId` on retries of the same local op.
- Treat `DUPLICATE` as successful replay (already applied).
- For `FAILED` with deterministic codes (for example `BRANCH_FROZEN`), mark op as permanent failure and stop blind retries.
- Current implementation note:
  - `sale.finalize` is accepted as a replay operation type but currently returns `OFFLINE_SYNC_OPERATION_NOT_SUPPORTED` until sale-order module rollout is complete.

## Frontend Retry Policy (Recommended)

### Queue states

- `PENDING`: not yet sent
- `RETRYABLE`: failed with transient reason; can retry later
- `PERMANENT_FAILED`: do not auto-retry; requires user action
- `DONE`: applied or duplicate

### Response handling

- `status = APPLIED` -> mark operation `DONE`
- `status = DUPLICATE` -> mark operation `DONE`
- `status = FAILED`:
  - use `resolution.category` as primary decision input:
    - `RETRYABLE` -> mark `RETRYABLE` and honor `resolution.retryAfterMs` (or default backoff)
    - `MANUAL` -> mark `PERMANENT_FAILED` (requires user/system action)
    - `PERMANENT` -> mark `PERMANENT_FAILED`
  - fallback when `resolution` is missing:
    - keep previous code-based mapping

### Backoff strategy

- For `RETRYABLE`:
  - exponential backoff with jitter, e.g. `2s -> 4s -> 8s -> ...` capped at `60s`
  - cap attempts per op (e.g. 10)
  - after cap reached, move to `PERMANENT_FAILED`

### Batch behavior

- Keep `haltOnFailure = true` by default.
- If backend returns `stoppedAt`, do not send later operations in the same local sequence until the failed op is resolved.
- After reconnect/restart, replay from first non-`DONE` op in order.

### Pseudocode state machine

```ts
async function replayQueue(queue: OfflineOp[]) {
  const pending = queue.filter((op) => op.state !== "DONE");
  if (pending.length === 0) return;

  const response = await postReplay({
    operations: pending.map(toEnvelope),
    haltOnFailure: true,
  });

  for (const result of response.data.results) {
    const op = queue.find((x) => x.clientOpId === result.clientOpId);
    if (!op) continue;

    if (result.status === "APPLIED" || result.status === "DUPLICATE") {
      op.state = "DONE";
      op.lastErrorCode = null;
      continue;
    }

    // FAILED
    op.lastErrorCode = result.code ?? "OFFLINE_SYNC_OPERATION_FAILED";

    if (isRetryable(op.lastErrorCode)) {
      op.retryCount += 1;
      if (op.retryCount > 10) {
        op.state = "PERMANENT_FAILED";
      } else {
        op.state = "RETRYABLE";
        op.nextAttemptAt = nowPlusBackoffWithJitter(op.retryCount);
      }
    } else {
      op.state = "PERMANENT_FAILED";
    }

    // haltOnFailure=true means backend stopped here
    break;
  }
}

function isRetryable(code: string): boolean {
  return code === "OFFLINE_SYNC_IN_PROGRESS" || code === "OFFLINE_SYNC_OPERATION_FAILED";
}
```

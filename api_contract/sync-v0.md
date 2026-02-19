# Sync Module (`/v0`) — API Contract

This document defines the `/v0/sync` read-sync contract used for offline-first state hydration and incremental catch-up.

Base path: `/v0/sync`

Implementation status:
- OF1 contract locked.
- OF2 initial implementation shipped:
  - `POST /v0/sync/pull`
  - sync change/checkpoint schema migrations
  - cursor progression and scope validation.
  - producer integrations live for:
    - branch-wide: `policy`, `cashSession`, `menu`, `discount`
    - account-scoped: `attendance`, `operationalNotification`
  - tenant-wide menu writes are fanned out to all active branch streams.
  - account-scoped sync changes are filtered by token account in pull query.

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` and `branchId` come from working-context token
  - no tenant/branch override in body/query
  - tenant-wide entities are still emitted in branch streams (fan-out by backend)
  - private entities can be account-scoped and are visible only to the matching account

## Why this exists

- Offline queue replay (`/v0/offline-sync/replay`) handles **writes**.
- `/v0/sync/pull` handles **read model hydration**:
  - initial bootstrap
  - incremental updates
  - tombstones for archive/delete state

## Types

```ts
type SyncModuleKey =
  | "policy"
  | "menu"
  | "discount"
  | "cashSession"
  | "attendance"
  | "operationalNotification";

type SyncOperation = "UPSERT" | "TOMBSTONE";

type SyncChange = {
  changeId: string;      // UUID, globally unique change event id
  sequence: string;      // monotonic server sequence, encoded as string
  moduleKey: SyncModuleKey;
  entityType: string;    // e.g. "menu_item", "cash_session"
  entityId: string;      // UUID or stable ID string
  operation: SyncOperation;
  changedAt: string;     // ISO datetime
  revision: string;      // opaque revision/version for merge safety
  data: Record<string, unknown> | null; // null when operation = TOMBSTONE
};
```

## Endpoint

### Pull changes

`POST /v0/sync/pull`

Body:
```json
{
  "deviceId": "tablet-front-counter-01",
  "cursor": null,
  "limit": 200,
  "moduleScopes": ["menu", "policy", "cashSession"]
}
```

Body rules:
- `cursor`:
  - `null` or omitted: bootstrap pull
  - opaque string from previous response: incremental pull
- `limit`:
  - optional, default `200`, max `1000`
- `moduleScopes`:
  - optional
  - if omitted, backend returns all supported sync modules
- `deviceId`:
  - optional, recommended
  - when provided, backend upserts checkpoint by `(accountId, deviceId, tenantId, branchId, moduleScopeHash)`
  - when `cursor` is omitted and checkpoint exists, backend resumes from stored checkpoint sequence

Response `200`:
```json
{
  "success": true,
  "data": {
    "cursor": "opaque-next-cursor",
    "hasMore": true,
    "serverTime": "2026-02-19T09:00:00.000Z",
    "changes": [
      {
        "changeId": "uuid",
        "sequence": "1042031",
        "moduleKey": "menu",
        "entityType": "menu_item",
        "entityId": "uuid",
        "operation": "UPSERT",
        "changedAt": "2026-02-19T08:59:59.000Z",
        "revision": "rv-001042031",
        "data": {
          "name": "Iced Latte",
          "basePrice": 2.5,
          "status": "ACTIVE"
        }
      },
      {
        "changeId": "uuid",
        "sequence": "1042032",
        "moduleKey": "menu",
        "entityType": "menu_item",
        "entityId": "uuid",
        "operation": "TOMBSTONE",
        "changedAt": "2026-02-19T09:00:00.000Z",
        "revision": "rv-001042032",
        "data": null
      }
    ]
  }
}
```

Errors:
- `401` missing/invalid token
- `403` no valid tenant/branch access
- `422` `SYNC_PAYLOAD_INVALID`
- `422` `SYNC_CURSOR_INVALID`
- `422` `SYNC_SCOPE_INVALID`
- `422` `SYNC_LIMIT_INVALID`

## Client merge rules (required)

1. Apply changes in ascending `sequence` order as returned.
2. Keep a local dedupe set by `changeId` (at-least-once safe).
3. For `UPSERT`: upsert by `entityId` + `entityType`.
4. For `TOMBSTONE`: remove/mark deleted locally.
5. Persist returned `cursor` only after all listed changes are applied atomically.
6. If apply fails mid-batch, retry using previous persisted cursor.

## Offline-first runtime flow (recommended)

1. App start or context switch:
   - call `POST /v0/sync/pull` with `cursor = null` for bootstrap.
2. Background sync loop:
   - pull incremental deltas with latest cursor.
3. After `/v0/offline-sync/replay` success:
   - immediately run pull sync to converge local read model.
4. On `SYNC_CURSOR_INVALID`:
   - reset local cursor for current context and perform bootstrap pull.

# Operational Notification Module (`/v0`) — API Contract

This document locks the target `/v0/notifications` HTTP contract for in-app operational notifications.

Base path: `/v0/notifications`

Implementation status:
- Phase N1-N5 completed (contract + schema + query/command surface + ACL mapping + cash-session close emission integration + reliability close-out).

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` and `branchId` come from working-context token.
  - no `tenantId` / `branchId` overrides in query/body.
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`

## Types

```ts
type NotificationType =
  | "VOID_APPROVAL_NEEDED"
  | "VOID_APPROVED"
  | "VOID_REJECTED"
  | "CASH_SESSION_CLOSED";

type NotificationSubjectType = "SALE" | "CASH_SESSION";

type NotificationItem = {
  id: string;
  tenantId: string;
  branchId: string;
  type: NotificationType;
  subjectType: NotificationSubjectType;
  subjectId: string;
  title: string;
  body: string;
  dedupeKey: string;
  payload: Record<string, unknown> | null;
  createdAt: string; // ISO datetime
  isRead: boolean;
  readAt: string | null; // ISO datetime
};
```

## Trigger Semantics (Locked)

- Workforce OFF (solo mode):
  - void is direct (no separate approval loop).
- Workforce ON (team mode):
  - void uses request/approve workflow.
- `VOID_PENDING` in sale state is not approval-specific.
  - It may represent pending approval or in-progress reversal execution.
- Therefore:
  - `VOID_APPROVAL_NEEDED` (ON-01) must be emitted only when a `VoidRequest` is created with `status=PENDING`.
  - Do not emit ON-01 purely from `sale.status=VOID_PENDING`.

## Endpoints

### 1) List inbox

`GET /v0/notifications/inbox?unreadOnly=true|false&type=...&limit=50&offset=0`

Action key: `operationalNotification.inbox.list`

Response `200`:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "tenantId": "uuid",
        "branchId": "uuid",
        "type": "CASH_SESSION_CLOSED",
        "subjectType": "CASH_SESSION",
        "subjectId": "uuid",
        "title": "Cash session closed",
        "body": "Variance: USD 1.00, KHR 0",
        "dedupeKey": "CASH_SESSION_CLOSED:branch:session",
        "payload": { "varianceUsd": 1, "varianceKhr": 0 },
        "createdAt": "2026-02-19T12:00:00.000Z",
        "isRead": false,
        "readAt": null
      }
    ],
    "limit": 50,
    "offset": 0
  }
}
```

Errors:
- `401` missing/invalid token
- `403` context/membership/branch access denial

### 2) Get unread count

`GET /v0/notifications/unread-count`

Action key: `operationalNotification.inbox.unreadCount`

Response `200`:
```json
{
  "success": true,
  "data": {
    "unreadCount": 3
  }
}
```

### 3) Read notification detail

`GET /v0/notifications/:notificationId`

Action key: `operationalNotification.read`

Errors:
- `404` `NOTIFICATION_NOT_FOUND`
- `403` `NOTIFICATION_ACCESS_DENIED` or standard access-control denial

### 4) Mark notification as read

`POST /v0/notifications/:notificationId/read`

Action key: `operationalNotification.read.mark`

Response `200`:
```json
{
  "success": true,
  "data": {
    "notificationId": "uuid",
    "isRead": true,
    "readAt": "2026-02-19T12:30:00.000Z"
  }
}
```

Notes:
- idempotent command; re-marking an already-read row returns current read state.

### 5) Mark all as read (current context)

`POST /v0/notifications/read-all`

Action key: `operationalNotification.read.markAll`

Response `200`:
```json
{
  "success": true,
  "data": {
    "updatedCount": 5
  }
}
```

## Behavior Notes

- Emission is best-effort. Failure to emit notification does not rollback source business writes.
- Recipients are resolved in `(tenantId, branchId)` scope with access checks to avoid leakage.
- Deep-link actions remain state-authoritative; stale notifications do not bypass current permissions/state.

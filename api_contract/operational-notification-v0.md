# Operational Notification Module (`/v0`) — API Contract

This document locks the target `/v0/notifications` HTTP contract for in-app operational notifications.

Base path: `/v0/notifications`

Implementation status:
- Account-scoped inbox/count/detail/read/read-all/stream is implemented using `(accountId)`.
- Tenant and branch remain notification origin metadata and optional filter dimensions.
- Existing recipient resolution remains branch-aware at emit time.

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - notification reads work with any valid account access token
  - selected `tenantId` / `branchId` context is not required
  - `tenantId` and `branchId` may be provided only as optional inbox narrowing filters
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
  tenantName: string;
  branchId: string;
  branchName: string | null;
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
  - `VOID_APPROVED` must be emitted when a `VoidRequest` transitions to `status=APPROVED`.
  - `VOID_REJECTED` must be emitted when a `VoidRequest` transitions to `status=REJECTED`.

Recipient semantics:
- `VOID_APPROVAL_NEEDED` targets branch managerial reviewers (`OWNER|ADMIN|MANAGER` assigned to the branch).
- `VOID_APPROVED` and `VOID_REJECTED` target the original void requester.

## Endpoints

### 0) Realtime stream (SSE)

`GET /v0/notifications/stream`

Action key: `operationalNotification.inbox.stream`

Headers:
- `Accept: text/event-stream`

SSE events:
- `ready`
  - sent immediately after stream is established
  - payload: `{ unreadCount, serverTime }`
- `notification.created`
  - target behavior: sent when a new in-app notification is emitted for the current `(accountId)` recipient scope
  - payload includes: `notificationId`, `tenantId`, `tenantName`, `branchId`, `branchName`, `notificationType`, `subjectType`, `subjectId`, `title`, `body`, `payload`, `createdAt`, `unreadCount`

Notes:
- stream is account scoped and does not require selected tenant/branch context
- backend sends keep-alive comments periodically
- recommended frontend behavior:
  - keep one active connection for current authenticated account shell session
  - reconnect on network drop
  - on reconnect, refresh inbox via `GET /inbox` to recover missed events

Errors:
- `401` missing/invalid token
- `403` access denial

### 1) List inbox

`GET /v0/notifications/inbox?tenantId=<uuid?>&branchId=<uuid?>&unreadOnly=true|false&type=...&limit=50&offset=0`

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
        "tenantName": "Demo Cafe",
        "branchId": "uuid",
        "branchName": "Main Branch",
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
    "offset": 0,
    "total": 1,
    "hasMore": false
  }
}
```

Notes:
- target inbox scope is `(accountId)` and does not require selected tenant/branch context
- `tenantId` and `branchId` are optional narrowing filters only

Errors:
- `401` missing/invalid token
- `403` access denial

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

Notes:
- target unread-count scope is `(accountId)` and does not require selected tenant/branch context

### 3) Read notification detail

`GET /v0/notifications/:notificationId`

Action key: `operationalNotification.read`

Response `200`:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "tenantName": "Demo Cafe",
    "branchId": "uuid",
    "branchName": "Main Branch",
    "type": "VOID_APPROVAL_NEEDED",
    "subjectType": "SALE",
    "subjectId": "uuid",
    "title": "Void approval needed",
    "body": "Sale #S-1024 requires review",
    "dedupeKey": "VOID_APPROVAL_NEEDED:void-request:uuid",
    "payload": {
      "saleId": "uuid",
      "voidRequestId": "uuid"
    },
    "createdAt": "2026-02-19T12:00:00.000Z",
    "isRead": false,
    "readAt": null
  }
}
```

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

### 5) Mark all as read (current account inbox)

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
- Recipients are still resolved at emit time using existing branch-aware business rules.
- Account-level inbox scope does not broaden access; an account sees only notification rows for which it has a recipient row and current active access to that branch-origin notification.
- Tenant and branch remain origin metadata and optional filter dimensions on the account-level inbox.
- Deep-link actions remain state-authoritative; stale notifications do not bypass current permissions/state.

## Frontend Wiring Guide (Recommended)

### 1) Initial page load flow

1. Call `GET /v0/notifications/unread-count` for badge bootstrap.
2. Call `GET /v0/notifications/inbox` for initial list.
3. Open `GET /v0/notifications/stream` with current access token.

### 2) Stream lifecycle rules

1. Keep exactly one stream per active authenticated account shell session.
2. On `ready`, update badge from `unreadCount`.
3. On `notification.created`:
   - increment/update badge using `unreadCount`
   - prepend/update inbox item locally, or trigger refetch of first page
4. On disconnect/network error:
   - reconnect with exponential backoff (e.g. 1s, 2s, 4s, max 30s)
   - after reconnect, refetch inbox page 1 to recover missed events
5. On token refresh, tenant switch, branch switch, or logout:
   - close previous stream
   - open a new stream with the new access token/context

### 3) Auth/header requirement

- Stream requires `Authorization: Bearer <accessToken>`.
- If your SSE client cannot send headers, use a client library that supports header-based SSE over fetch/streaming HTTP.
- Do not move access tokens to query string.

### 4) Minimal event handling shape

`ready` example:
```json
{
  "unreadCount": 2,
  "serverTime": "2026-02-19T08:40:00.000Z"
}
```

`notification.created` example:
```json
{
  "notificationId": "uuid",
  "tenantId": "uuid",
  "tenantName": "Demo Cafe",
  "branchId": "uuid",
  "branchName": "Main Branch",
  "notificationType": "CASH_SESSION_CLOSED",
  "subjectType": "CASH_SESSION",
  "subjectId": "uuid",
  "title": "Cash session closed",
  "body": "Variance USD 1.00, KHR 0.00",
  "payload": { "varianceUsd": 1, "varianceKhr": 0 },
  "createdAt": "2026-02-19T08:40:10.000Z",
  "unreadCount": 3
}
```

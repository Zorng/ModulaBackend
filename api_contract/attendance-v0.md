# Attendance Module (`/v0`) — API Contract

This document describes the current `/v0/attendance` HTTP contract.

Base path: `/v0/attendance`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - Attendance is branch-scoped.
  - `tenantId` and `branchId` must come from the access token context.
  - These endpoints do not accept `tenantId`/`branchId` overrides.
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`

## Types

```ts
type AttendanceType = "CHECK_IN" | "CHECK_OUT";

type AttendanceRecord = {
  id: string;
  tenantId: string;
  branchId: string;
  accountId: string;
  type: AttendanceType;
  occurredAt: string; // ISO datetime
  createdAt: string; // ISO datetime
};
```

## Endpoints

### 1) Check in

`POST /v0/attendance/check-in`

Body:

```json
{
  "occurredAt": "2026-02-13T08:00:00.000Z"
}
```

`occurredAt` is optional. If omitted, backend uses current time.

Success `201`:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "branchId": "uuid",
    "accountId": "uuid",
    "type": "CHECK_IN",
    "occurredAt": "2026-02-13T08:00:00.000Z",
    "createdAt": "2026-02-13T08:00:01.000Z"
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `BRANCH_CONTEXT_REQUIRED` (token context missing)
- `403` `NO_MEMBERSHIP` or `NO_BRANCH_ACCESS` (access control deny)
- `403` `TENANT_NOT_ACTIVE` or `SUBSCRIPTION_FROZEN` or `BRANCH_FROZEN` (status gates for writes)
- `409` already checked in
- `422` invalid `occurredAt`

### 2) Check out

`POST /v0/attendance/check-out`

Body:

```json
{
  "occurredAt": "2026-02-13T17:00:00.000Z"
}
```

`occurredAt` is optional. If omitted, backend uses current time.

Success `201`:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "branchId": "uuid",
    "accountId": "uuid",
    "type": "CHECK_OUT",
    "occurredAt": "2026-02-13T17:00:00.000Z",
    "createdAt": "2026-02-13T17:00:01.000Z"
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `BRANCH_CONTEXT_REQUIRED`
- `403` `NO_MEMBERSHIP` or `NO_BRANCH_ACCESS`
- `403` `TENANT_NOT_ACTIVE` or `SUBSCRIPTION_FROZEN` or `BRANCH_FROZEN`
- `409` no active check-in
- `422` invalid `occurredAt`

### 3) List own attendance

`GET /v0/attendance/me?limit=50`

Query:
- `limit` optional, default `50`, max `200`

Success `200`:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "branchId": "uuid",
      "accountId": "uuid",
      "type": "CHECK_OUT",
      "occurredAt": "2026-02-13T17:00:00.000Z",
      "createdAt": "2026-02-13T17:00:01.000Z"
    }
  ]
}
```

Order:
- Newest first (`occurredAt DESC`, then `createdAt DESC`).

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `BRANCH_CONTEXT_REQUIRED`
- `403` `NO_MEMBERSHIP` or `NO_BRANCH_ACCESS`

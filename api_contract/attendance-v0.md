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
- Idempotency:
  - Critical writes require `Idempotency-Key` header.
  - Duplicate replay with same key + same payload returns stored response and header `Idempotency-Replayed: true`.
- Audit:
  - state-changing attendance writes emit immutable audit events (see `api_contract/audit-v0.md`).
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`

## Types

```ts
type AttendanceType = "CHECK_IN" | "CHECK_OUT";

type AttendanceObservedLocationInput = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  capturedAt?: string | null; // ISO datetime
};

type AttendanceLocationVerification = {
  observedLatitude: number | null;
  observedLongitude: number | null;
  observedAccuracyMeters: number | null;
  capturedAt: string | null; // ISO datetime
  status: "MATCH" | "MISMATCH" | "UNKNOWN" | null;
  reason: string | null;
  distanceMeters: number | null;
};

type AttendanceRecord = {
  id: string;
  tenantId: string;
  branchId: string;
  accountId: string;
  type: AttendanceType;
  occurredAt: string; // ISO datetime
  createdAt: string; // ISO datetime
  locationVerification: AttendanceLocationVerification | null;
  forceEndedByAccountId: string | null;
  forceEndReason: string | null;
};

type AttendanceScopedRecord = AttendanceRecord & {
  account: {
    id: string;
    phone: string;
    firstName: string | null;
    lastName: string | null;
  };
  branch: {
    id: string;
    name: string;
  };
};
```

Location verification behavior:
- branch configuration controls verification mode:
  - `disabled`
  - `checkin_only`
  - `checkin_and_checkout`
- when verification is enabled and location evidence is missing/unusable, status is `UNKNOWN` (write still succeeds).
- force-end metadata fields:
  - normal check-in/check-out: `forceEndedByAccountId = null`, `forceEndReason = null`
  - manager/admin force-end: both fields are populated.

## Endpoints

### 1) Check in

`POST /v0/attendance/check-in`

Headers:
- `Idempotency-Key: <client generated key>`

Body:

```json
{
  "occurredAt": "2026-02-13T08:00:00.000Z",
  "location": {
    "latitude": 11.5564,
    "longitude": 104.9282,
    "accuracyMeters": 12.5,
    "capturedAt": "2026-02-13T07:59:58.000Z"
  }
}
```

`occurredAt` and `location` are optional. If omitted, backend uses current time and records no observed location.

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
    "createdAt": "2026-02-13T08:00:01.000Z",
    "locationVerification": {
      "observedLatitude": 11.5564,
      "observedLongitude": 104.9282,
      "observedAccuracyMeters": 12.5,
      "capturedAt": "2026-02-13T07:59:58.000Z",
      "status": "MATCH",
      "reason": null,
      "distanceMeters": 8.21
    }
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `BRANCH_CONTEXT_REQUIRED` (token context missing)
- `403` `NO_MEMBERSHIP` or `NO_BRANCH_ACCESS` (access control deny)
- `403` `TENANT_NOT_ACTIVE` or `SUBSCRIPTION_FROZEN` or `BRANCH_FROZEN` (status gates for writes)
- `422` `IDEMPOTENCY_KEY_REQUIRED`
- `409` `IDEMPOTENCY_CONFLICT` (same key with different payload)
- `409` `IDEMPOTENCY_IN_PROGRESS` (same key currently being processed)
- `409` already checked in
- `422` invalid `occurredAt`
- `422` invalid location payload (`location`, `location.latitude`, `location.longitude`, `location.accuracyMeters`, `location.capturedAt`)

### 2) Check out

`POST /v0/attendance/check-out`

Headers:
- `Idempotency-Key: <client generated key>`

Body:

```json
{
  "occurredAt": "2026-02-13T17:00:00.000Z",
  "location": {
    "latitude": 11.5565,
    "longitude": 104.9281,
    "accuracyMeters": 9.3
  }
}
```

`occurredAt` and `location` are optional. If omitted, backend uses current time and records no observed location.

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
    "createdAt": "2026-02-13T17:00:01.000Z",
    "locationVerification": {
      "observedLatitude": 11.5565,
      "observedLongitude": 104.9281,
      "observedAccuracyMeters": 9.3,
      "capturedAt": "2026-02-13T17:00:00.000Z",
      "status": "MATCH",
      "reason": null,
      "distanceMeters": 7.64
    }
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `BRANCH_CONTEXT_REQUIRED`
- `403` `NO_MEMBERSHIP` or `NO_BRANCH_ACCESS`
- `403` `TENANT_NOT_ACTIVE` or `SUBSCRIPTION_FROZEN` or `BRANCH_FROZEN`
- `422` `IDEMPOTENCY_KEY_REQUIRED`
- `409` `IDEMPOTENCY_CONFLICT`
- `409` `IDEMPOTENCY_IN_PROGRESS`
- `409` no active check-in
- `422` invalid `occurredAt`
- `422` invalid location payload (`location`, `location.latitude`, `location.longitude`, `location.accuracyMeters`, `location.capturedAt`)

### 3) List own attendance

`GET /v0/attendance/me?limit=50&offset=0`

Query:
- `limit` optional, default `50`, max `200`
- `offset` optional, default `0`

Success `200`:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "tenantId": "uuid",
        "branchId": "uuid",
        "accountId": "uuid",
        "type": "CHECK_OUT",
        "occurredAt": "2026-02-13T17:00:00.000Z",
        "createdAt": "2026-02-13T17:00:01.000Z",
        "locationVerification": null
      }
    ],
    "limit": 50,
    "offset": 0,
    "total": 1,
    "hasMore": false
  }
}
```

Order:
- Newest first (`occurredAt DESC`, then `createdAt DESC`).

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `BRANCH_CONTEXT_REQUIRED`
- `403` `NO_MEMBERSHIP` or `NO_BRANCH_ACCESS`

### 4) Force end work (manager/admin)

`POST /v0/attendance/force-end`

Headers:
- `Idempotency-Key: <client generated key>`

Body:

```json
{
  "targetAccountId": "uuid",
  "reason": "cashier forgot to check out",
  "occurredAt": "2026-02-13T17:30:00.000Z",
  "location": {
    "latitude": 11.5565,
    "longitude": 104.9281,
    "accuracyMeters": 10.1
  }
}
```

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
    "occurredAt": "2026-02-13T17:30:00.000Z",
    "createdAt": "2026-02-13T17:30:01.000Z",
    "locationVerification": null,
    "forceEndedByAccountId": "uuid",
    "forceEndReason": "cashier forgot to check out"
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `BRANCH_CONTEXT_REQUIRED`
- `403` `NO_MEMBERSHIP` or `NO_BRANCH_ACCESS`
- `403` role deny (manager/admin/owner only)
- `403` `TENANT_NOT_ACTIVE` or `SUBSCRIPTION_FROZEN` or `BRANCH_FROZEN`
- `422` `IDEMPOTENCY_KEY_REQUIRED`
- `409` `IDEMPOTENCY_CONFLICT`
- `409` `IDEMPOTENCY_IN_PROGRESS`
- `422` `targetAccountId` invalid
- `422` `reason` missing/invalid
- `409` target has no active check-in

### 5) List branch attendance (manager/admin)

`GET /v0/attendance/branch?accountId=<uuid>&occurredFrom=<iso>&occurredTo=<iso>&limit=50&offset=0`

Notes:
- Branch context in token is required.
- `accountId`, `occurredFrom`, `occurredTo`, `limit`, and `offset` are optional.

Success `200`:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "tenantId": "uuid",
        "branchId": "uuid",
        "accountId": "uuid",
        "type": "CHECK_IN",
        "occurredAt": "2026-02-13T08:00:00.000Z",
        "createdAt": "2026-02-13T08:00:01.000Z",
        "locationVerification": null,
        "account": {
          "id": "uuid",
          "phone": "+85512000001",
          "firstName": "Sok",
          "lastName": "Dara"
        },
        "branch": {
          "id": "uuid",
          "name": "Main Branch"
        }
      }
    ],
    "limit": 50,
    "offset": 0,
    "total": 1,
    "hasMore": false
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `BRANCH_CONTEXT_REQUIRED`
- `403` `NO_MEMBERSHIP` or `NO_BRANCH_ACCESS`
- `403` role deny (manager/admin/owner only)
- `422` invalid `accountId`, `occurredFrom`, `occurredTo`, or date range

### 6) List tenant attendance (admin/owner)

`GET /v0/attendance/tenant?branchId=<uuid>&accountId=<uuid>&occurredFrom=<iso>&occurredTo=<iso>&limit=50&offset=0`

Notes:
- Tenant context in token is required.
- `branchId`, `accountId`, `occurredFrom`, `occurredTo`, `limit`, and `offset` are optional.

Success `200`:
- Same paginated response shape as branch list (`items + limit + offset + total + hasMore`).

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED`
- `403` `NO_MEMBERSHIP`
- `403` role deny (admin/owner only)
- `422` invalid `branchId`, `accountId`, `occurredFrom`, `occurredTo`, or date range

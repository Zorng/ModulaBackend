# Audit Module (`/v0`) — API Contract

This document describes the current `/v0/audit` HTTP contract.

Base path: `/v0/audit`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - audit reads are tenant-scoped
  - tenant context comes from token
  - `tenantId` override in query/body is not supported
- Access:
  - `OWNER` and `ADMIN` can read tenant audit events
  - other roles are denied with `PERMISSION_DENIED`

## Types

```ts
type AuditOutcome = "SUCCESS" | "REJECTED" | "FAILED";

type AuditEvent = {
  id: string;
  tenantId: string;
  branchId: string | null;
  actorAccountId: string | null;
  actionKey: string;
  outcome: AuditOutcome;
  reasonCode: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string; // ISO datetime
};
```

## Endpoints

### 1) List tenant audit events

`GET /v0/audit/events?branchId=uuid&actionKey=string&outcome=SUCCESS|REJECTED|FAILED&limit=50&offset=0`

Query:
- `branchId` optional
- `actionKey` optional
- `outcome` optional (`SUCCESS | REJECTED | FAILED`)
- `limit` optional, default `50`, max `200`
- `offset` optional, default `0`

Success `200`:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "branchId": "uuid",
      "actorAccountId": "uuid",
      "actionKey": "attendance.checkIn",
      "outcome": "SUCCESS",
      "reasonCode": null,
      "entityType": "attendance_record",
      "entityId": "uuid",
      "metadata": {
        "replayed": false,
        "endpoint": "/v0/attendance/check-in"
      },
      "createdAt": "2026-02-15T12:00:00.000Z"
    }
  ]
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `NO_MEMBERSHIP`
- `403` `PERMISSION_DENIED` for roles outside owner/admin
- `422` invalid `outcome` or `branchId`

## Current Write Coverage (Internal)

Audit events are written internally by state-changing modules.
Current F5 baseline:
- `POST /v0/attendance/check-in`
- `POST /v0/attendance/check-out`

For idempotent attendance writes, audit ingestion is dedupe-safe using outcome-specific dedupe keys.

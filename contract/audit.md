# Audit Module — API Contract (Frontend)

This document describes the **current** Audit HTTP contract exposed by the backend.

**Base path:** `/v1/audit`  
**Auth header:** `Authorization: Bearer <accessToken>`  
**Access control:** Read endpoints are **Admin only**; offline ingestion is **authenticated** (any role)

---

## Conventions

### IDs
- All IDs are UUID strings.

### Error shape (common)
Most audit endpoints return errors like:
```json
{ "error": "Human readable message" }
```

### Casing
- Audit module uses `snake_case` in request/response bodies (e.g. `tenant_id`, `denial_reason`).

---

## Types

### `AuditOutcome`
```ts
type AuditOutcome = "SUCCESS" | "REJECTED" | "FAILED";
```

### `AuditDenialReason`
```ts
type AuditDenialReason =
  | "PERMISSION_DENIED"
  | "POLICY_BLOCKED"
  | "VALIDATION_FAILED"
  | "BRANCH_FROZEN"
  | "TENANT_FROZEN"
  | "DEPENDENCY_MISSING";
```

### `AuditActorType`
```ts
type AuditActorType = "EMPLOYEE" | "SYSTEM";
```

### `AuditLogEntry`
```ts
type AuditLogEntry = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  employee_id: string | null;
  actor_role: string | null;
  actor_type: AuditActorType;
  action_type: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  outcome: AuditOutcome;
  denial_reason: AuditDenialReason | null;
  occurred_at: string; // ISO date-time
  created_at: string; // ISO date-time
  client_event_id: string | null;
};
```

Notes:
- `actor_type` is derived from whether `employee_id` is present (`EMPLOYEE`) or absent (`SYSTEM`).
- `action_type` is a string event name. Some legacy values may exist in early dev DBs (e.g. `AUTH_LOGIN_SUCCESS`) while the system is being standardized to ModSpec names.

---

## Endpoints

### 0) Ingest offline audit events (Authenticated)
`POST /v1/audit/ingest`

Notes:
- Tenant/branch/actor context is derived from the authenticated user (request body cannot override it).
- Idempotency is enforced via `(tenant_id, client_event_id)`; retries must not create duplicates.

Request body:
```json
{
  "events": [
    {
      "client_event_id": "string",
      "occurred_at": "2025-01-01T00:00:00.000Z",
      "action_type": "SYNC_OPERATION_APPLIED",
      "resource_type": "SYNC",
      "resource_id": "uuid",
      "outcome": "SUCCESS",
      "denial_reason": null,
      "details": { "source": "offline_queue" }
    }
  ]
}
```

Response `200`:
```json
{ "ingested": 1, "deduped": 0 }
```

Errors:
- `401` if missing/invalid auth
- `422` if body is invalid

### 1) List audit logs (Admin only)
`GET /v1/audit/logs`

Query params (all optional):
- `from` (ISO date-time) — filter `occurred_at >= from`
- `to` (ISO date-time) — filter `occurred_at <= to`
- `branch_id` (uuid)
- `employee_id` (uuid)
- `action_type` (string)
- `outcome` (`SUCCESS|REJECTED|FAILED`)
- `denial_reason` (see `AuditDenialReason`)
- `page` (int, default `1`)
- `limit` (int, default `50`, max `100`)

Response `200`:
```json
{
  "logs": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "branch_id": "uuid",
      "employee_id": "uuid",
      "actor_role": "ADMIN",
      "actor_type": "EMPLOYEE",
      "action_type": "BRANCH_FROZEN",
      "resource_type": "BRANCH",
      "resource_id": "uuid",
      "details": { "previous_status": "ACTIVE" },
      "ip_address": null,
      "user_agent": null,
      "outcome": "SUCCESS",
      "denial_reason": null,
      "occurred_at": "2025-12-22T00:00:00.000Z",
      "created_at": "2025-12-22T00:00:00.000Z",
      "client_event_id": null
    }
  ],
  "page": 1,
  "limit": 50,
  "total": 1
}
```

Errors:
- `401` if missing/invalid auth
- `403` if not an admin
- `422` if query params are invalid

---

### 2) Get a single audit log entry (Admin only)
`GET /v1/audit/logs/:id`

Response `200`:
```json
{
  "log": {
    "id": "uuid",
    "tenant_id": "uuid",
    "branch_id": "uuid",
    "employee_id": "uuid",
    "actor_role": "CASHIER",
    "actor_type": "EMPLOYEE",
    "action_type": "ACTION_REJECTED_BRANCH_FROZEN",
    "resource_type": "BRANCH",
    "resource_id": "uuid",
    "details": { "reason": "BRANCH_FROZEN", "operation": "sales.finalize" },
    "ip_address": null,
    "user_agent": null,
    "outcome": "REJECTED",
    "denial_reason": "BRANCH_FROZEN",
    "occurred_at": "2025-12-22T00:00:00.000Z",
    "created_at": "2025-12-22T00:00:00.000Z",
    "client_event_id": null
  }
}
```

Errors:
- `401` if missing/invalid auth
- `403` if not an admin
- `404` if not found

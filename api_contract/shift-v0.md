# Shift Module (`/v0`) — API Contract

This document describes the `/v0/hr/shifts` HTTP contract for v0.

Base path: `/v0/hr/shifts`

Implementation status:
- Phase 4 reliability baseline shipped:
  - commands + queries + access-control wiring
  - rejected write outcomes are persisted and idempotency-replayable
  - rollback safety verified for forced outbox failure path
  - shift pull-sync convergence checks are covered in integration tests
- Phase 5 close-out complete for v0 online lane.
- Offline push-sync command mapping remains pending in Shift Phase 0 gate.

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId`/`branchId` come from working-context token.
  - no tenant/branch override in query/body.
- Idempotency:
  - all write commands require `Idempotency-Key`.
  - write rejections are persisted as outbox/audit `REJECTED` outcomes (`HR_SHIFT_COMMAND_REJECTED`).

## Access Control

- Write roles: `OWNER | ADMIN | MANAGER`
- Read roles: `OWNER | ADMIN | MANAGER`
- Self read roles: any active tenant member (`OWNER | ADMIN | MANAGER | CASHIER | CLERK`)
- Action namespaces:
  - `hr.shift.pattern.*`
  - `hr.shift.instance.*`
  - `hr.shift.schedule.read`

## Types

```ts
type ShiftPatternStatus = "ACTIVE" | "INACTIVE";
type ShiftInstanceStatus = "PLANNED" | "UPDATED" | "CANCELLED";

type ShiftPattern = {
  id: string;
  tenantId: string;
  membershipId: string;
  branchId: string;
  daysOfWeek: number[]; // 0..6
  plannedStartTime: string; // HH:mm
  plannedEndTime: string; // HH:mm
  status: ShiftPatternStatus;
  effectiveFrom: string | null; // YYYY-MM-DD
  effectiveTo: string | null; // YYYY-MM-DD
  note: string | null;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
};

type ShiftInstance = {
  id: string;
  tenantId: string;
  membershipId: string;
  branchId: string;
  patternId: string | null;
  date: string; // YYYY-MM-DD
  plannedStartTime: string; // HH:mm
  plannedEndTime: string; // HH:mm
  status: ShiftInstanceStatus;
  note: string | null;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
};
```

## Endpoints

### Patterns

#### 1) Create shift pattern
`POST /v0/hr/shifts/patterns`

Headers:
- `Idempotency-Key: <string>`

Body:
```json
{
  "membershipId": "uuid",
  "branchId": "uuid",
  "daysOfWeek": [1, 2, 3, 4, 5],
  "plannedStartTime": "08:00",
  "plannedEndTime": "17:00",
  "effectiveFrom": "2026-03-01",
  "effectiveTo": null,
  "note": null
}
```

Success `201`: `ShiftPattern`

Action key: `hr.shift.pattern.create`  
Event: `HR_SHIFT_PATTERN_CREATED`

#### 2) Update shift pattern
`PATCH /v0/hr/shifts/patterns/:patternId`

Headers:
- `Idempotency-Key: <string>`

Body (subset):
```json
{
  "daysOfWeek": [1, 2, 3, 4, 5, 6],
  "plannedStartTime": "09:00",
  "plannedEndTime": "18:00",
  "effectiveTo": "2026-06-30",
  "note": "Ramadan schedule"
}
```

Success `200`: `ShiftPattern`

Action key: `hr.shift.pattern.update`  
Event: `HR_SHIFT_PATTERN_UPDATED`

#### 3) Deactivate shift pattern
`POST /v0/hr/shifts/patterns/:patternId/deactivate`

Headers:
- `Idempotency-Key: <string>`

Body:
```json
{
  "reason": "schedule retired"
}
```

Success `200`: `ShiftPattern` with `status = "INACTIVE"`

Action key: `hr.shift.pattern.deactivate`  
Event: `HR_SHIFT_PATTERN_DEACTIVATED`

### Instances

#### 4) Create shift instance (ad-hoc)
`POST /v0/hr/shifts/instances`

Headers:
- `Idempotency-Key: <string>`

Body:
```json
{
  "membershipId": "uuid",
  "branchId": "uuid",
  "date": "2026-03-08",
  "plannedStartTime": "10:00",
  "plannedEndTime": "14:00",
  "note": "event support"
}
```

Success `201`: `ShiftInstance`

Action key: `hr.shift.instance.create`  
Event: `HR_SHIFT_INSTANCE_CREATED`

#### 5) Update shift instance
`PATCH /v0/hr/shifts/instances/:instanceId`

Headers:
- `Idempotency-Key: <string>`

Body:
```json
{
  "date": "2026-03-09",
  "plannedStartTime": "11:00",
  "plannedEndTime": "15:00",
  "note": "updated by manager"
}
```

Success `200`: `ShiftInstance` with `status = "UPDATED"`

Action key: `hr.shift.instance.update`  
Event: `HR_SHIFT_INSTANCE_UPDATED`

#### 6) Cancel shift instance
`POST /v0/hr/shifts/instances/:instanceId/cancel`

Headers:
- `Idempotency-Key: <string>`

Body:
```json
{
  "reason": "staff day off approved"
}
```

Success `200`: `ShiftInstance` with `status = "CANCELLED"`

Action key: `hr.shift.instance.cancel`  
Event: `HR_SHIFT_INSTANCE_CANCELLED`

### Queries

#### 7) Schedule view (branch/team)
`GET /v0/hr/shifts/schedule?branchId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD&membershipId=<uuid?>`

Response `200`:
```json
{
  "success": true,
  "data": {
    "patterns": [],
    "instances": []
  }
}
```

Action key: `hr.shift.schedule.read`

#### 8) Membership shift view
`GET /v0/hr/shifts/memberships/:membershipId?from=YYYY-MM-DD&to=YYYY-MM-DD`

Response `200`:
```json
{
  "success": true,
  "data": {
    "membershipId": "uuid",
    "patterns": [],
    "instances": []
  }
}
```

Action key: `hr.shift.schedule.read`

#### 9) My active shifts
`GET /v0/hr/shifts/me`

Response `200`:
```json
{
  "success": true,
  "data": {
    "membershipId": "uuid",
    "patterns": [],
    "instances": []
  }
}
```

Action key: `hr.shift.schedule.readSelf`

Notes:
- Self-service endpoint for staff to read only their own assigned shift schedule.
- Caller must have tenant context.
- Caller does not provide `membershipId`; backend resolves it from the active tenant membership in token context.
- Response is simplified to active assignments only:
  - active patterns effective today
  - non-cancelled instances from today onward
- Historical, inactive, and cancelled shift rows are not returned by this endpoint.

#### 10) Shift instance detail
`GET /v0/hr/shifts/instances/:instanceId`

Response `200`: `ShiftInstance`

Action key: `hr.shift.schedule.read`

## Frontend Integration Notes (v0 baseline)

- Send `Idempotency-Key` on every write request.
- If response header `Idempotency-Replayed: true` is present, frontend should treat the response as replayed successful/failed outcome for the same intent.
- Validation/business rejections are deterministic and idempotent (for example `SHIFT_TIME_RANGE_INVALID`, `SHIFT_OVERLAP_CONFLICT`).
- For offline hydration, use `/v0/sync/pull` with `moduleScopes: ["shift"]` to receive `shift_pattern` and `shift_instance` changes.
- Shift writes emit work-review trigger outbox event `HR_WORK_REVIEW_EVALUATION_REQUESTED`; this is backend-internal and not required for direct frontend invocation.

## Reason codes (current baseline)

- `SHIFT_PATTERN_NOT_FOUND`
- `SHIFT_INSTANCE_NOT_FOUND`
- `SHIFT_MEMBERSHIP_INVALID`
- `SHIFT_BRANCH_INVALID`
- `SHIFT_TIME_RANGE_INVALID`
- `SHIFT_DATE_RANGE_INVALID`
- `SHIFT_OVERLAP_CONFLICT`
- `IDEMPOTENCY_KEY_REQUIRED`
- `IDEMPOTENCY_CONFLICT`
- `IDEMPOTENCY_IN_PROGRESS`

# Work Review Module (`/v0`) — API Contract

This document defines the planned `/v0/hr/work-reviews` HTTP contract for HR work-review insights.

Base path: `/v0/hr/work-reviews`

Implementation status:
- Phase 1 boundary + contract lock completed.
- Query/runtime implementation is not yet shipped.

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId`/`branchId` are resolved from working-context token.
  - no tenant/branch override via body/header.
  - branch filter query parameters must be subset-validated against accessible scope.
- Idempotency:
  - no public write endpoint in this contract baseline.

## Access Control

- Own review reads:
  - `hr.workReview.read.mine`
  - allowed roles: any active membership role
- Branch review reads:
  - `hr.workReview.read.branch`
  - `hr.workReview.summary.branch`
  - allowed roles: `OWNER | ADMIN | MANAGER`
- Tenant review reads:
  - `hr.workReview.read.tenant`
  - `hr.workReview.summary.tenant`
  - allowed roles: `OWNER | ADMIN | MANAGER`

## Types

```ts
type WorkReviewClassification =
  | "ON_TIME"
  | "LATE"
  | "EARLY_LEAVE"
  | "ABSENT"
  | "OVERTIME"
  | "UNSCHEDULED_WORK"
  | "INCOMPLETE_RECORD";

type WorkReviewComparison = {
  id: string;
  tenantId: string;
  branchId: string;
  membershipId: string;
  workDate: string; // YYYY-MM-DD
  shiftInstanceId: string | null;
  attendanceRecordId: string | null;
  expectedStartTime: string | null; // HH:mm
  expectedEndTime: string | null; // HH:mm
  actualStartAt: string | null; // ISO datetime
  actualEndAt: string | null; // ISO datetime
  classification: WorkReviewClassification;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  overtimeMinutes: number | null;
  evidenceNotes: string[];
  planningCoverage: "FULL" | "MISSING_PLAN";
  timezone: string; // default v0: Asia/Phnom_Penh
  evaluatedAt: string; // ISO datetime
  rulesetVersion: string;
};

type WorkReviewSummary = {
  scope: "MEMBERSHIP" | "BRANCH" | "TENANT";
  tenantId: string;
  branchId: string | null;
  membershipId: string | null;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  planningCoverage: "FULL" | "PARTIAL_OR_MISSING";
  totals: {
    plannedShifts: number;
    attendedShifts: number;
    absentCount: number;
    lateCount: number;
    earlyLeaveCount: number;
    overtimeCount: number;
    unscheduledWorkCount: number;
    incompleteRecordCount: number;
    totalLateMinutes: number;
    totalEarlyLeaveMinutes: number;
    totalOvertimeMinutes: number;
  };
};
```

## Endpoints

### 1) List my work-review records
`GET /v0/hr/work-reviews/me?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=<uuid?>&limit=50&offset=0`

Success `200`:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "c9af4e8e-c3d2-4f66-aaea-7d7d7c0d657a",
        "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
        "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
        "membershipId": "4dd4d1f4-7f89-4fbe-b7df-9b8ae5875b78",
        "workDate": "2026-02-24",
        "shiftInstanceId": "fd0315ef-9ce4-4e4e-acaf-1cc7daff85dc",
        "attendanceRecordId": "44f5ee9e-f613-4eb5-9667-6f729cb892c3",
        "expectedStartTime": "08:00",
        "expectedEndTime": "16:00",
        "actualStartAt": "2026-02-24T01:12:00.000Z",
        "actualEndAt": "2026-02-24T09:02:00.000Z",
        "classification": "LATE",
        "lateMinutes": 12,
        "earlyLeaveMinutes": null,
        "overtimeMinutes": 2,
        "evidenceNotes": [],
        "planningCoverage": "FULL",
        "timezone": "Asia/Phnom_Penh",
        "evaluatedAt": "2026-02-24T09:10:00.000Z",
        "rulesetVersion": "v1"
      }
    ],
    "limit": 50,
    "offset": 0
  }
}
```

### 2) List branch work-review records
`GET /v0/hr/work-reviews/branch?branchId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD&membershipId=<uuid?>&classification=<enum?>&limit=50&offset=0`

Success `200`: same envelope shape as endpoint 1.

### 3) List tenant work-review records
`GET /v0/hr/work-reviews/tenant?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=<uuid?>&membershipId=<uuid?>&classification=<enum?>&limit=50&offset=0`

Success `200`: same envelope shape as endpoint 1.

### 4) Branch summary
`GET /v0/hr/work-reviews/summary/branch?branchId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD`

Success `200`:
```json
{
  "success": true,
  "data": {
    "scope": "BRANCH",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "membershipId": null,
    "from": "2026-02-01",
    "to": "2026-02-29",
    "planningCoverage": "FULL",
    "totals": {
      "plannedShifts": 188,
      "attendedShifts": 182,
      "absentCount": 6,
      "lateCount": 14,
      "earlyLeaveCount": 3,
      "overtimeCount": 11,
      "unscheduledWorkCount": 2,
      "incompleteRecordCount": 1,
      "totalLateMinutes": 163,
      "totalEarlyLeaveMinutes": 47,
      "totalOvertimeMinutes": 221
    }
  }
}
```

### 5) Tenant summary
`GET /v0/hr/work-reviews/summary/tenant?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=<uuid?>`

Success `200`: same shape as endpoint 4, with `scope = "TENANT"` and `branchId = null` when all-branches.

## Read Semantics

- Missing shift plan data never fabricates `ABSENT`:
  - records should classify as attendance-led outcomes (for example `UNSCHEDULED_WORK`) when planning context is missing.
- Read behavior on frozen branches remains allowed for historical reporting.
- Day-boundary baseline for v0 is `Asia/Phnom_Penh`.

## Reason Codes (baseline lock)

- `WORK_REVIEW_WINDOW_INVALID`
- `WORK_REVIEW_SCOPE_INVALID`
- `WORK_REVIEW_CLASSIFICATION_INVALID`
- `WORK_REVIEW_NOT_AVAILABLE` (module not yet materialized / not ready)
- plus standard auth/access/context denials from `api_contract/access-control-v0.md`

## Internal Evaluation Trigger (not public contract)

- Internal/system action key lock: `hr.workReview.evaluate.run`
- Trigger event lock: `HR_WORK_REVIEW_EVALUATION_REQUESTED`
- Public HTTP command for recompute is intentionally deferred.

## Tracking

- `_refactor-artifact/06-hr/04_work-review-rollout-v0.md`
- `_refactor-artifact/02-boundary/work-review-boundary-v0.md`

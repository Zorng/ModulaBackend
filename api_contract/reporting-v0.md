# Reporting Module (`/v0`) — API Contract

This document defines the `/v0/reports` HTTP contract for v0 management reporting.

Base path: `/v0/reports`

Implementation status:
- Phase 1 boundary + contract lock completed.
- Phase 2 data model + repository scaffolding completed (`migrations/046_v0_reporting_phase2_read_model_support.sql`, `src/modules/v0/reporting/infra/repository.ts`).
- Phase 3 queries + access-control wiring completed (`src/modules/v0/reporting/api/router.ts`, `src/modules/v0/reporting/app/service.ts`, ACL route/action mappings).
- Phase 4 integration/reliability coverage completed (`src/integration-tests/v0-reporting.int.test.ts`).
- Phase 5 close-out completed (rollout tracking, event-catalog note, frontend integration guidance synchronized).
- Attendance endpoints are intentionally soft-blocked with `REPORT_NOT_AVAILABLE` until the HR reporting read-model is finalized.
- Runtime availability:
  - sales summary + drill-down: available
  - restock spend summary + drill-down: available
  - attendance summary + drill-down: contract locked, returns `REPORT_NOT_AVAILABLE` in current baseline
- Sales currency/category consistency rollout decisions are tracked in:
  - `_refactor-artifact/05-pos/09_reporting-sales-currency-category-consistency-v0.md`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "...", "details"?: {...} }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` always comes from working-context token.
  - Reporting queries accept explicit branch scope selectors (`branchScope`, optional `branchId`) for read aggregation.
  - Scope is validated by Access Control and membership branch access.
- Idempotency:
  - no public write endpoints in this module baseline.
- Timezone baseline:
  - report day/week boundaries use `Asia/Phnom_Penh` in v0.

## Access Control

- Permission gate: `reports.view`
- Allowed baseline roles: `OWNER | ADMIN | MANAGER`
- Scope rules:
  - manager: `BRANCH` scope only
  - owner/admin: `BRANCH` and `ALL_BRANCHES`
  - `ALL_BRANCHES` requires explicit access to all tenant branches
- Frozen branch rule:
  - historical reporting remains readable (read-only), and frozen branches must be labeled in scope metadata

## Query Scope Parameters

Common query parameters used across report endpoints:

```ts
type ReportWindow = "day" | "week" | "month" | "custom";
type ReportBranchScope = "BRANCH" | "ALL_BRANCHES";
```

- `window`: `day | week | month | custom`
- `from`: `YYYY-MM-DD` (required when `window=custom`)
- `to`: `YYYY-MM-DD` (required when `window=custom`)
- `branchScope`: `BRANCH | ALL_BRANCHES`
- `branchId`: optional UUID
  - when `branchScope=BRANCH`, backend uses `branchId` if provided; otherwise current token branch
  - when `branchScope=ALL_BRANCHES`, `branchId` is ignored/rejected by validator policy

Common response scope echo:

```ts
type ReportScopeEcho = {
  tenantId: string;
  branchScope: "BRANCH" | "ALL_BRANCHES";
  branchId: string | null;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  timezone: "Asia/Phnom_Penh";
  frozenBranchIds: string[];
};
```

## Sales Reporting

### Types

```ts
type SalesSummaryReport = {
  scope: ReportScopeEcho;
  confirmed: {
    transactionCount: number; // FINALIZED only
    totalGrandUsd: number; // stored v0_sales grand_total_usd aggregate
    totalGrandKhr: number; // stored v0_sales grand_total_khr aggregate
    totalVatUsd: number; // stored v0_sales vat_usd aggregate
    totalVatKhr: number; // stored v0_sales vat_khr aggregate
    totalDiscountUsd: number; // stored v0_sales discount_usd aggregate
    totalDiscountKhr: number; // stored v0_sales discount_khr aggregate
    averageTicketUsd: number | null; // totalGrandUsd / transactionCount
    averageTicketKhr: number | null; // totalGrandKhr / transactionCount
    totalItemsSold: number;
  };
  paymentBreakdown: Array<{
    paymentMethod: "CASH" | "KHQR";
    transactionCount: number;
    totalUsd: number; // stored v0_sales grand_total_usd aggregate within paymentMethod
    totalKhr: number; // stored v0_sales grand_total_khr aggregate within paymentMethod
  }>;
  cashTenderBreakdown: Array<{
    tenderCurrency: "USD" | "KHR";
    transactionCount: number;
    totalTenderAmount: number; // stored v0_sales tender_amount aggregate for CASH sales in this tenderCurrency only
  }>;
  saleTypeBreakdown: Array<{
    saleType: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
    transactionCount: number;
    totalUsd: number; // stored v0_sales grand_total_usd aggregate within saleType
    totalKhr: number; // stored v0_sales grand_total_khr aggregate within saleType
    totalItemsSold: number;
  }>;
  topItems: Array<{
    menuItemId: string;
    itemNameSnapshot: string;
    quantity: number;
    revenueUsd: number; // stored v0_sale_lines line_total_amount aggregate
    revenueKhr: number; // stored sale-line line_total_khr_snapshot aggregate; historical rows may fall back to FX-derived runtime value until backfill decision lands
  }>;
  categoryBreakdown: Array<{
    categoryNameSnapshot: string; // groups by sale-line category snapshot; includes "Uncategorized"
    quantity: number;
    revenueUsd: number; // stored v0_sale_lines line_total_amount aggregate
    revenueKhr: number; // stored sale-line line_total_khr_snapshot aggregate; historical rows may fall back to FX-derived runtime value until backfill decision lands
  }>;
  exceptions: {
    voidPending: {
      count: number;
      totalUsd: number; // stored v0_sales grand_total_usd aggregate for VOID_PENDING
      totalKhr: number; // stored v0_sales grand_total_khr aggregate for VOID_PENDING
    };
    voided: {
      count: number;
      totalUsd: number; // stored v0_sales grand_total_usd aggregate for VOIDED
      totalKhr: number; // stored v0_sales grand_total_khr aggregate for VOIDED
    };
  };
};

type SalesDrillDownItem = {
  saleId: string;
  branchId: string;
  status: "FINALIZED" | "VOID_PENDING" | "VOIDED";
  paymentMethod: "CASH" | "KHQR";
  saleType: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  finalizedAt: string | null; // ISO datetime
  totalItems: number;
  grandTotalUsd: number; // stored v0_sales grand_total_usd snapshot
  grandTotalKhr: number; // stored v0_sales grand_total_khr snapshot
  vatUsd: number; // stored v0_sales vat_usd snapshot
  vatKhr: number; // stored v0_sales vat_khr snapshot
  discountUsd: number; // stored v0_sales discount_usd snapshot
  discountKhr: number; // stored v0_sales discount_khr snapshot
};
```

### Sales Currency Semantics (Locked)

Use these rules when interpreting the response:

- `confirmed.*`, `paymentBreakdown.*`, `saleTypeBreakdown.*`, `exceptions.*`, and drill-down monetary fields are sale-value aggregates/snapshots, not tender-collection aggregates.
- stored sale-level KHR snapshot fields (`grandTotalKhr`, `vatKhr`, `discountKhr`, related aggregates) now reflect the persisted sale rounding policy when `saleKhrRoundingEnabled = true`.
- `cashTenderBreakdown` is the only object that represents tender-collected amounts separated by tender currency.
- `cashTenderBreakdown.totalTenderAmount` is not converted across currencies.
  - `USD` rows are total USD cash tender received for cash-finalized sales tendered in USD.
  - `KHR` rows are total KHR cash tender received for cash-finalized sales tendered in KHR.
- `topItems.revenueUsd` and `categoryBreakdown.revenueUsd` are aggregated from stored sale-line USD totals.
- `topItems.revenueKhr` and `categoryBreakdown.revenueKhr` now read the stored line-level KHR snapshot when present.
- v0 baseline rollout decision: no automatic historical backfill is performed for old line-level KHR snapshots.
- Historical rows without `lineTotalKhrSnapshot` therefore continue to fall back to report-time FX derivation from USD line totals using each sale's `saleFxRateKhrPerUsd`.
- Therefore, `revenueKhr` in `topItems` and `categoryBreakdown` is:
  - not a tender-collected amount
  - intended to reflect the canonical stored line-level KHR snapshot for new rows
  - but may remain mixed for older historical rows because v0 does not auto-backfill them
- `categoryNameSnapshot` is sourced from the stored sale-line category snapshot.
  - v0 baseline rollout decision: no automatic historical category snapshot backfill is performed.
  - historical rows created before the sale-line category snapshot fix may therefore still fall through to `"Uncategorized"`.

### 1) Sales summary

`GET /v0/reports/sales/summary?window=day|week|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&branchScope=BRANCH|ALL_BRANCHES&branchId=<uuid?>&topN=10`

Action key: `reports.sales.summary`

Success `200`:

```json
{
  "success": true,
  "data": {
    "scope": {
      "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
      "branchScope": "BRANCH",
      "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
      "from": "2026-02-01",
      "to": "2026-02-29",
      "timezone": "Asia/Phnom_Penh",
      "frozenBranchIds": []
    },
    "confirmed": {
      "transactionCount": 124,
      "totalGrandUsd": 682.5,
      "totalGrandKhr": 2802000,
      "totalVatUsd": 0,
      "totalVatKhr": 0,
      "totalDiscountUsd": 12,
      "totalDiscountKhr": 49200,
      "averageTicketUsd": 5.5,
      "averageTicketKhr": 22596.77,
      "totalItemsSold": 301
    },
    "paymentBreakdown": [
      { "paymentMethod": "CASH", "transactionCount": 72, "totalUsd": 341, "totalKhr": 1398100 },
      { "paymentMethod": "KHQR", "transactionCount": 52, "totalUsd": 341.5, "totalKhr": 1403900 }
    ],
    "cashTenderBreakdown": [
      { "tenderCurrency": "USD", "transactionCount": 61, "totalTenderAmount": 310 },
      { "tenderCurrency": "KHR", "transactionCount": 11, "totalTenderAmount": 1270000 }
    ],
    "saleTypeBreakdown": [
      { "saleType": "DINE_IN", "transactionCount": 56, "totalUsd": 301, "totalKhr": 1234100, "totalItemsSold": 137 },
      { "saleType": "TAKEAWAY", "transactionCount": 63, "totalUsd": 359.5, "totalKhr": 1475950, "totalItemsSold": 154 },
      { "saleType": "DELIVERY", "transactionCount": 5, "totalUsd": 22, "totalKhr": 90250, "totalItemsSold": 10 }
    ],
    "topItems": [
      {
        "menuItemId": "28fb8c60-c016-403e-a748-1ca7f998a787",
        "itemNameSnapshot": "Iced Latte",
        "quantity": 84,
        "revenueUsd": 210,
        "revenueKhr": 861000
      }
    ],
    "categoryBreakdown": [
      { "categoryNameSnapshot": "Coffee", "quantity": 211, "revenueUsd": 510, "revenueKhr": 2091000 },
      { "categoryNameSnapshot": "Uncategorized", "quantity": 90, "revenueUsd": 172.5, "revenueKhr": 711000 }
    ],
    "exceptions": {
      "voidPending": { "count": 2, "totalUsd": 8, "totalKhr": 32800 },
      "voided": { "count": 1, "totalUsd": 3.5, "totalKhr": 14350 }
    }
  }
}
```

Rules:
- Confirmed totals are aggregated from `FINALIZED` only.
- `VOID_PENDING` and `VOIDED` are shown separately in `exceptions`.
- `confirmed`, `paymentBreakdown`, `saleTypeBreakdown`, `exceptions`, and drill-down monetary fields use stored sale snapshots (no retroactive recompute from current menu/policy).
- `cashTenderBreakdown` is tender-separated and should not be interpreted as the same shape as sale-value totals.
- `topItems.revenueKhr` and `categoryBreakdown.revenueKhr` use stored sale-line `lineTotalKhrSnapshot` for new rows, with historical FX fallback for older rows where that snapshot is absent.
- `categoryBreakdown` groups by stored sale-line category snapshot, but historical rows written before the snapshot fix may still appear as `"Uncategorized"`.

### 2) Sales drill-down

`GET /v0/reports/sales/drill-down?window=day|week|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&branchScope=BRANCH|ALL_BRANCHES&branchId=<uuid?>&status=ALL|FINALIZED|VOID_PENDING|VOIDED&limit=50&offset=0`

Action key: `reports.sales.drillDown`

Success `200`:

```json
{
  "success": true,
  "data": {
    "scope": {
      "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
      "branchScope": "BRANCH",
      "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
      "from": "2026-02-01",
      "to": "2026-02-29",
      "timezone": "Asia/Phnom_Penh",
      "frozenBranchIds": []
    },
    "items": [
      {
        "saleId": "9cf4727d-3bad-4e2f-af63-4664cdeb7e23",
        "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
        "status": "FINALIZED",
        "paymentMethod": "KHQR",
        "saleType": "TAKEAWAY",
        "finalizedAt": "2026-02-24T04:11:15.814Z",
        "totalItems": 3,
        "grandTotalUsd": 7.5,
        "grandTotalKhr": 30750,
        "vatUsd": 0,
        "vatKhr": 0,
        "discountUsd": 0,
        "discountKhr": 0
      }
    ],
    "limit": 50,
    "offset": 0,
    "total": 1,
    "hasMore": false
  }
}
```

## Restock Spend Reporting

### Types

```ts
type RestockSpendSummary = {
  scope: ReportScopeEcho;
  totals: {
    knownCostSpendUsd: number;
    knownCostBatchCount: number;
    unknownCostBatchCount: number;
  };
  monthlyBreakdown: Array<{
    month: string; // YYYY-MM
    knownCostSpendUsd: number;
    knownCostBatchCount: number;
    unknownCostBatchCount: number;
  }>;
};

type RestockSpendDrillDownItem = {
  restockBatchId: string;
  branchId: string;
  stockItemId: string;
  stockItemName: string;
  quantityInBaseUnit: number;
  purchaseCostUsd: number | null; // null => unknown
  receivedAt: string; // ISO datetime
};
```

### 3) Restock spend summary

`GET /v0/reports/restock-spend/summary?window=month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&branchScope=BRANCH|ALL_BRANCHES&branchId=<uuid?>`

Action key: `reports.restockSpend.summary`

Success `200`:

```json
{
  "success": true,
  "data": {
    "scope": {
      "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
      "branchScope": "ALL_BRANCHES",
      "branchId": null,
      "from": "2026-02-01",
      "to": "2026-02-29",
      "timezone": "Asia/Phnom_Penh",
      "frozenBranchIds": []
    },
    "totals": {
      "knownCostSpendUsd": 1420.5,
      "knownCostBatchCount": 38,
      "unknownCostBatchCount": 4
    },
    "monthlyBreakdown": [
      {
        "month": "2026-02",
        "knownCostSpendUsd": 1420.5,
        "knownCostBatchCount": 38,
        "unknownCostBatchCount": 4
      }
    ]
  }
}
```

Rules:
- Unknown purchase cost is tracked as unknown (`null`) and never treated as zero.

### 4) Restock spend drill-down

`GET /v0/reports/restock-spend/drill-down?window=month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&branchScope=BRANCH|ALL_BRANCHES&branchId=<uuid?>&costFilter=ALL|KNOWN|UNKNOWN&limit=50&offset=0`

Action key: `reports.restockSpend.drillDown`

Success `200`:

```json
{
  "success": true,
  "data": {
    "scope": {
      "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
      "branchScope": "BRANCH",
      "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
      "from": "2026-02-01",
      "to": "2026-02-29",
      "timezone": "Asia/Phnom_Penh",
      "frozenBranchIds": []
    },
    "items": [
      {
        "restockBatchId": "f5d56ef9-2b9f-40f0-8ac0-c8f6607c9354",
        "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
        "stockItemId": "8eb0452f-8d32-434d-bd09-f0b97258ae4c",
        "stockItemName": "Milk",
        "quantityInBaseUnit": 5000,
        "purchaseCostUsd": 15,
        "receivedAt": "2026-02-24T10:14:22.101Z"
      }
    ],
    "limit": 50,
    "offset": 0,
    "total": 1,
    "hasMore": false
  }
}
```

## Attendance Insight Reporting

### Types

```ts
type AttendanceInsightClassificationCount = {
  onTime: number;
  late: number;
  earlyLeave: number;
  absent: number;
  overtime: number;
  unscheduledWork: number;
  incompleteRecord: number;
};

type AttendanceInsightStaffSummary = {
  membershipId: string;
  accountId: string;
  firstName: string | null;
  lastName: string | null;
  plannedShiftCount: number | null;
  attendedCount: number;
  classificationCounts: AttendanceInsightClassificationCount;
  totalScheduledHours: number | null;
  totalWorkedHours: number;
  totalLateMinutes: number;
  totalEarlyLeaveMinutes: number;
  totalOvertimeMinutes: number;
  planningCoverage: "FULL" | "PARTIAL_OR_MISSING";
};

type AttendanceInsightSummary = {
  scope: ReportScopeEcho;
  planningCoverage: "FULL" | "PARTIAL_OR_MISSING";
  branchTotals: {
    plannedShiftCount: number | null;
    attendedCount: number;
    classificationCounts: AttendanceInsightClassificationCount;
    totalScheduledHours: number | null;
    totalWorkedHours: number;
    totalLateMinutes: number;
    totalEarlyLeaveMinutes: number;
    totalOvertimeMinutes: number;
  };
  perStaff: AttendanceInsightStaffSummary[];
};
```

### 5) Attendance summary

`GET /v0/reports/attendance/summary?window=day|week|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&branchScope=BRANCH|ALL_BRANCHES&branchId=<uuid?>&membershipId=<uuid?>`

Action key: `reports.attendance.summary`

Success `200`:

```json
{
  "success": true,
  "data": {
    "scope": {
      "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
      "branchScope": "BRANCH",
      "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
      "from": "2026-02-01",
      "to": "2026-02-29",
      "timezone": "Asia/Phnom_Penh",
      "frozenBranchIds": []
    },
    "planningCoverage": "FULL",
    "branchTotals": {
      "plannedShiftCount": 188,
      "attendedCount": 182,
      "classificationCounts": {
        "onTime": 120,
        "late": 14,
        "earlyLeave": 3,
        "absent": 6,
        "overtime": 11,
        "unscheduledWork": 2,
        "incompleteRecord": 1
      },
      "totalScheduledHours": 1504,
      "totalWorkedHours": 1481.5,
      "totalLateMinutes": 163,
      "totalEarlyLeaveMinutes": 47,
      "totalOvertimeMinutes": 221
    },
    "perStaff": []
  }
}
```

Fair degradation rule:
- when planning data is missing, `plannedShiftCount` and `absent`-driven judgments must be `null`/degraded, not fabricated.

### 6) Attendance drill-down

`GET /v0/reports/attendance/drill-down?window=day|week|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&branchScope=BRANCH|ALL_BRANCHES&branchId=<uuid?>&membershipId=<uuid?>&classification=ON_TIME|LATE|EARLY_LEAVE|ABSENT|OVERTIME|UNSCHEDULED_WORK|INCOMPLETE_RECORD&limit=50&offset=0`

Action key: `reports.attendance.drillDown`

Success `200`:

```json
{
  "success": true,
  "data": {
    "scope": {
      "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
      "branchScope": "BRANCH",
      "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
      "from": "2026-02-01",
      "to": "2026-02-29",
      "timezone": "Asia/Phnom_Penh",
      "frozenBranchIds": []
    },
    "items": [
      {
        "workReviewId": "c9af4e8e-c3d2-4f66-aaea-7d7d7c0d657a",
        "membershipId": "4dd4d1f4-7f89-4fbe-b7df-9b8ae5875b78",
        "accountId": "caa1ad86-db02-4719-92f7-7bb574b51787",
        "firstName": "Dula",
        "lastName": "Owner",
        "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
        "workDate": "2026-02-24",
        "classification": "LATE",
        "expectedStartTime": "08:00",
        "expectedEndTime": "16:00",
        "actualStartAt": "2026-02-24T01:12:00.000Z",
        "actualEndAt": "2026-02-24T09:02:00.000Z",
        "lateMinutes": 12,
        "earlyLeaveMinutes": null,
        "overtimeMinutes": 2
      }
    ],
    "limit": 50,
    "offset": 0
  }
}
```

## Error Codes (baseline lock)

- `REPORT_SCOPE_INVALID`
- `REPORT_TIME_WINDOW_INVALID`
- `REPORT_BRANCH_SCOPE_FORBIDDEN`
- `REPORT_ALL_BRANCHES_REQUIRES_FULL_BRANCH_ACCESS`
- `REPORT_FILTER_INVALID`
- `REPORT_NOT_AVAILABLE`
- plus standard auth/access/context denials from `api_contract/access-control-v0.md`

## Audit / Observational Events

Reporting query handlers emit:
- `REPORT_VIEWED` with:
  - report type
  - scope metadata (`tenantId`, `branchScope`, `branchId`, `from`, `to`)
  - actor metadata

## Frontend Notes

- Prefer `/v0/reports/*` summary endpoints for dashboard cards/charts.
- Use drill-down endpoints only when users open detailed lists.
- Do not aggregate full raw sales/attendance/restock datasets on client as the primary management reporting path.
- Cash-session X/Z remain under `api_contract/cash-session-v0.md` (`/v0/cash/sessions/:sessionId/x|z`).
- Handle attendance routes as feature-gated:
  - `503` + `code=REPORT_NOT_AVAILABLE` => hide/defer attendance analytics UI in current release.
- Scope handling:
  - managers should send `branchScope=BRANCH`;
  - owner/admin may send `branchScope=ALL_BRANCHES` only when full-branch access exists.

## Tracking

- `_refactor-artifact/05-pos/08_reporting-rollout-v0.md`
- `_refactor-artifact/02-boundary/reporting-boundary-v0.md`
- `_refactor-artifact/01-platform/v0-command-outbox-event-catalog.md`

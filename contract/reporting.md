# Reporting Module — API Contract (Frontend)

This document describes the **current** Reporting HTTP contract exposed by the backend.

**Base path:** `/v1/reports`  
**Auth header:** `Authorization: Bearer <accessToken>`

---

## Conventions

### IDs
- All IDs are UUID strings.

### Casing
- Reporting module uses `camelCase` in request/response bodies.

### Access
- Reports are **read-only** (no mutations).
- Roles:
  - `ADMIN`: view all X/Z reports within a branch.
  - `MANAGER`: view all X reports within a branch.
  - `CASHIER`: view only their own X reports.

---

## Types

### `CashSessionStatus`
```ts
type CashSessionStatus = "OPEN" | "CLOSED" | "PENDING_REVIEW" | "APPROVED";
```
Hint: `PENDING_REVIEW` indicates a session closed with significant cash variance; `APPROVED` is reserved for a manager review outcome.

### `XReportListItem`
```ts
type XReportListItem = {
  id: string;
  status: CashSessionStatus;
  openedByName: string;
  openedAt: string; // ISO date-time
  closedAt: string | null; // ISO date-time
};
```

### `XReportDetail`
```ts
type XReportDetail = {
  id: string;
  status: CashSessionStatus;
  openedByName: string;
  openedAt: string; // ISO date-time
  closedAt: string | null; // ISO date-time
  openingFloatUsd: number;
  openingFloatKhr: number;
  totalSalesCashUsd: number;
  totalSalesCashKhr: number;
  totalPaidInUsd: number;
  totalPaidInKhr: number;
  totalPaidOutUsd: number;
  totalPaidOutKhr: number;
  expectedCashUsd: number;
  expectedCashKhr: number;
};
```

### `ZReportDetail`
```ts
type ZReportDetail = XReportDetail & {
  countedCashUsd: number;
  countedCashKhr: number;
  varianceUsd: number;
  varianceKhr: number;
};
```

---

## Endpoints

### 0) Z report summary (end of day, admin only)
`GET /v1/reports/cash/z?branchId=uuid&date=YYYY-MM-DD`

Query:
- `branchId` required (defaults to user branch if omitted)
- `date` required (YYYY-MM-DD or ISO date-time)

Response `200`:
```json
{
  "success": true,
  "data": {
    "date": "2025-12-23",
    "sessionCount": 2,
    "openingFloatUsd": 20,
    "openingFloatKhr": 0,
    "totalSalesCashUsd": 165,
    "totalSalesCashKhr": 0,
    "totalPaidInUsd": 0,
    "totalPaidInKhr": 0,
    "totalPaidOutUsd": 5,
    "totalPaidOutKhr": 0,
    "expectedCashUsd": 180,
    "expectedCashKhr": 0
  }
}
```

Errors:
- `400` if branchId or date is missing/invalid
- `401` if missing/invalid auth
- `403` if role cannot access the report
- `404` if branch not found

---

### 1) List X reports (branch-scoped)
`GET /v1/reports/cash/x?branchId=uuid&from=ISO&to=ISO&status=all|open|closed`

Query:
- `branchId` required (defaults to user branch if omitted)
- `from` optional (ISO date-time, filters `openedAt`)
- `to` optional (ISO date-time, filters `openedAt`)
- `status` optional: `all | open | closed` (default `all`)

Response `200`:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "status": "OPEN",
      "openedByName": "John Smith",
      "openedAt": "2025-12-23T08:00:00.000Z",
      "closedAt": null
    }
  ]
}
```

Errors:
- `400` if branchId is missing or date params are invalid
- `401` if missing/invalid auth
- `403` if role cannot access the requested branch
- `404` if branch not found

---

### 2) X report detail (session)
`GET /v1/reports/cash/x/:sessionId?branchId=uuid`

Response `200`:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "OPEN",
    "openedByName": "John Smith",
    "openedAt": "2025-12-23T08:00:00.000Z",
    "closedAt": null,
    "openingFloatUsd": 10,
    "openingFloatKhr": 0,
    "totalSalesCashUsd": 45,
    "totalSalesCashKhr": 0,
    "totalPaidInUsd": 0,
    "totalPaidInKhr": 0,
    "totalPaidOutUsd": 5,
    "totalPaidOutKhr": 0,
    "expectedCashUsd": 50,
    "expectedCashKhr": 0
  }
}
```

Errors:
- `400` if branchId is missing
- `401` if missing/invalid auth
- `403` if role cannot access the report
- `404` if report not found

---

### 3) Z report detail (session)
`GET /v1/reports/cash/z/:sessionId?branchId=uuid`

Response `200`:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "CLOSED",
    "openedByName": "John Smith",
    "openedAt": "2025-12-23T08:00:00.000Z",
    "closedAt": "2025-12-23T16:00:00.000Z",
    "openingFloatUsd": 10,
    "openingFloatKhr": 0,
    "totalSalesCashUsd": 120,
    "totalSalesCashKhr": 0,
    "totalPaidInUsd": 0,
    "totalPaidInKhr": 0,
    "totalPaidOutUsd": 5,
    "totalPaidOutKhr": 0,
    "expectedCashUsd": 125,
    "expectedCashKhr": 0,
    "countedCashUsd": 125,
    "countedCashKhr": 0,
    "varianceUsd": 0,
    "varianceKhr": 0
  }
}
```

Errors:
- `400` if session is still open
- `401` if missing/invalid auth
- `403` if role cannot access the report
- `404` if report not found

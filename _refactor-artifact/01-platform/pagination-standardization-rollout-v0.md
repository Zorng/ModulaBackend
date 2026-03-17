# Pagination Standardization Rollout (v0)

Status: Planned  
Owner: backend  
Started: 2026-03-17

## Goal

Standardize all offset-based list/read endpoints on one canonical pagination response envelope so frontend can implement paging and lazy-fetch behavior consistently across modules.

## Canonical standard (locked)

For every offset-based list/read endpoint, response shape should be:

```json
{
  "success": true,
  "data": {
    "items": [],
    "limit": 20,
    "offset": 0,
    "total": 47,
    "hasMore": true
  }
}
```

## Why this is needed

- Current backend is inconsistent:
  - some endpoints accept `limit`/`offset` but return only bare arrays
  - one upgraded endpoint already proves the stronger pattern:
    - `GET /v0/cash/sessions/:sessionId/sales`
- Frontend needs canonical metadata for:
  - page navigation
  - lazy fetch / load more
  - accurate count badges
  - restoring list position after refresh

## Locked rules

- `items`: current page/slice rows
- `limit`: normalized effective limit applied by backend
- `offset`: normalized effective offset applied by backend
- `total`: total number of matching rows after filters
- `hasMore`: `offset + items.length < total`

Optional later, not required for v0:
- `nextOffset`
- `previousOffset`
- `returnedCount`

Not canonical for v0:
- `currentPage`
- `totalPages`

Reason:
- current backend list APIs are offset-based, not page-number-based
- frontend can derive:
  - `currentPage = floor(offset / limit) + 1`
  - `totalPages = ceil(total / limit)`

## Explicit exclusions

Do not force this shape onto cursor-based endpoints.

Current exclusion:
- `POST /v0/sync/pull`
  - this already uses:
    - `cursor`
    - `hasMore`
    - `serverTime`

## Breaking-change note

This is a contract change for every endpoint that currently returns:

```json
{
  "success": true,
  "data": []
}
```

and will be upgraded to:

```json
{
  "success": true,
  "data": {
    "items": [],
    "limit": 20,
    "offset": 0,
    "total": 0,
    "hasMore": false
  }
}
```

Frontend cutover must be coordinated module by module or behind a clearly announced contract wave.

## Endpoint inventory

### Already aligned / reference implementation

- `GET /v0/cash/sessions/:sessionId/sales`

### Cash Session

- `GET /v0/cash/sessions`
- `GET /v0/cash/sessions/:sessionId/movements`

### Sale / Order

- `GET /v0/orders`
- `GET /v0/sales`

### Menu

- `GET /v0/menu/items`
- `GET /v0/menu/items/all`

### Inventory

- `GET /v0/inventory/items`
- `GET /v0/inventory/restock-batches`
- `GET /v0/inventory/journal`
- `GET /v0/inventory/journal/all`

### Discount

- `GET /v0/discount/rules`

### Attendance

- `GET /v0/attendance/me`
- `GET /v0/attendance/branch`
- `GET /v0/attendance/tenant`

### Staff / HR

- `GET /v0/hr/staff`
- `GET /v0/hr/work-reviews/me`
- `GET /v0/hr/work-reviews/branch`
- `GET /v0/hr/work-reviews/tenant`
- shift list/schedule read endpoints that already accept `limit`/`offset`

### Audit / Notifications

- `GET /v0/audit/events`
- `GET /v0/notifications/inbox`

### Reporting drill-downs

- `GET /v0/reports/sales/drill-down`
- `GET /v0/reports/restock-spend/drill-down`
- `GET /v0/reports/attendance/drill-down`

## Execution phases

### Phase PG1 — Contract lock + helper baseline

- lock the standard pagination envelope in API contracts
- add a shared internal pagination response helper/type
- define one naming rule:
  - `items`
  - never `rows`, `results`, or bare arrays for offset-based list reads

Output:
- one canonical pagination DTO pattern for backend services/contracts

### Phase PG2 — Reference cleanup on existing cash-session reads

- keep `GET /v0/cash/sessions/:sessionId/sales` as the reference endpoint
- align:
  - `GET /v0/cash/sessions`
  - `GET /v0/cash/sessions/:sessionId/movements`

Why first:
- same module
- pattern already proven
- low conceptual risk

### Phase PG3 — Core POS management lists

- `GET /v0/orders`
- `GET /v0/sales`
- `GET /v0/menu/items`
- `GET /v0/menu/items/all`
- `GET /v0/inventory/items`
- `GET /v0/inventory/restock-batches`
- `GET /v0/inventory/journal`
- `GET /v0/inventory/journal/all`
- `GET /v0/discount/rules`

Why next:
- highest frontend product impact
- largest list-surface inconsistency today

### Phase PG4 — HR operational lists

- `GET /v0/attendance/me`
- `GET /v0/attendance/branch`
- `GET /v0/attendance/tenant`
- `GET /v0/hr/staff`
- `GET /v0/hr/work-reviews/me`
- `GET /v0/hr/work-reviews/branch`
- `GET /v0/hr/work-reviews/tenant`
- shift list/schedule reads

Note:
- `attendance/me` should be aligned to accept `offset` as well if it does not already expose it consistently

### Phase PG5 — Audit, notifications, reporting drill-downs

- `GET /v0/audit/events`
- `GET /v0/notifications/inbox`
- reporting drill-down reads

Why later:
- useful, but lower operational urgency than POS/HR management screens

### Phase PG6 — Close-out

- update all affected API contracts
- update integration tests module by module
- publish frontend migration note:
  - bare array list reads are deprecated
  - pagination envelope is now standard

## Implementation pattern per endpoint

For each endpoint:

1. repository
- add `count...(...)` query if missing

2. service
- normalize `limit`
- normalize `offset`
- fetch `total`
- fetch page slice
- return:
  - `items`
  - `limit`
  - `offset`
  - `total`
  - `hasMore`

3. router
- keep query params the same unless the endpoint lacks `offset`

4. contract
- change response shape examples from bare arrays to paginated envelope

5. integration tests
- assert:
  - `limit`
  - `offset`
  - `total`
  - `hasMore`
  - filtered-count correctness where relevant

## Suggested sequencing by engineering risk

Lowest-risk first:
- cash session
- audit
- notifications

Highest product-value next:
- orders
- sales
- menu
- inventory
- discount

Broader support surface after:
- attendance
- staff
- work review
- shift

Last:
- reporting drill-downs

## Tracking

| Phase | Status | Notes |
|---|---|---|
| PG1 Contract lock + helper baseline | Planned | Standard locked in this artifact; code helper still pending. |
| PG2 Cash-session alignment | Planned | Existing reference endpoint is `GET /v0/cash/sessions/:sessionId/sales`. |
| PG3 Core POS management lists | Planned | Orders, sales, menu, inventory, discount. |
| PG4 HR operational lists | Planned | Attendance, staff, work review, shift. |
| PG5 Audit / notifications / reporting | Planned | Lower operational urgency but should converge on same envelope. |
| PG6 Close-out | Planned | Contracts, tests, frontend migration note. |

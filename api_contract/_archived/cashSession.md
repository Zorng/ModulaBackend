# Cash Session API Contract

Base path: `/v1/cash`
Auth: Bearer token required for all endpoints.
Branch guard: routes enforce active branch via middleware.

## Session Lifecycle

### Open session
`POST /v1/cash/sessions`

Body:
```json
{
  "branchId": "uuid (optional, defaults to user's branch)",
  "registerId": "uuid (optional)",
  "openingFloatUsd": 0,
  "openingFloatKhr": 0,
  "note": "string (optional, max 500)"
}
```

Responses:
- 201: `{ success: true, data: CashSession }`
- 400: `{ success: false, error: "..." }`

Rules:
- One OPEN session per user per branch.
- If `registerId` is provided, only one OPEN session per register.

### Force-close session (Manager/Admin)
`POST /v1/cash/sessions/:sessionId/force-close`

Body:
```json
{
  "countedCashUsd": 0,
  "countedCashKhr": 0,
  "reason": "string (required, min 3, max 500)",
  "note": "string (optional, max 500)"
}
```

Responses:
- 200: `{ success: true, data: CashSession }`
- 400/403: `{ success: false, error: "..." }`

Rules:
- Only `MANAGER` or `ADMIN`.
- If counted cash is omitted, defaults to expected cash.
- Produces `CASH_SESSION_FORCE_CLOSED` audit entry.

### Close session
`POST /v1/cash/sessions/:sessionId/close`

Body:
```json
{
  "countedCashUsd": 0,
  "countedCashKhr": 0,
  "note": "string (optional, max 500)"
}
```

Responses:
- 200: `{ success: true, data: CashSession }`
- 400: `{ success: false, error: "..." }`

Rules:
- Session must be OPEN.
- Variance computed and status set to `CLOSED` or `PENDING_REVIEW`.

### Get active session (per user)
`GET /v1/cash/sessions/active?branchId=uuid&registerId=uuid`

Query:
- `branchId` optional (defaults to user's branch)
- `registerId` optional (when provided, search for the user's OPEN session on that register)

Responses:
- 200: `{ success: true, data: CashSession }`
- 404: `{ success: false, error: "No active session found for this user in this branch" }`

## Movements

### Record manual movement
`POST /v1/cash/sessions/:sessionId/movements`

Body:
```json
{
  "branchId": "uuid (optional, defaults to user's branch)",
  "registerId": "uuid (optional)",
  "type": "PAID_IN | PAID_OUT | ADJUSTMENT",
  "amountUsd": 0,
  "amountKhr": 0,
  "reason": "string (required, 3-120)"
}
```

Responses:
- 201: `{ success: true, data: CashMovement }`
- 400: `{ success: false, error: "..." }`

Rules:
- Session must be OPEN.
- Approved movements update expected cash.

## Reports

### Z report
`GET /v1/cash/sessions/reports/z/:sessionId`

Response:
- 200: `{ success: true, data: ZReport }`

### X report
`GET /v1/cash/sessions/reports/x?registerId=uuid`

Response:
- 200: `{ success: true, data: XReport }`

## Events (Outbox)
- `cash.session_opened`
- `cash.session_closed`
- `cash.sale_cash_recorded`
- `cash.refund_cash_recorded`

## Notes
- Cash sales are attached to the cashier’s OPEN session at the branch.
- Policy `cashRequireSessionForSales` gates cart mutations and cash finalize.

# Cash Session Module (`/v0`) — API Contract

This document defines the canonical `/v0/cash` contract for Cash Session.

Base path: `/v0/cash`

Implementation status:
- Phase 1-4 completed (contract + schema/repo + command/query/ACL + reliability tests).
- X/Z totals now include finalized sale aggregates within the session window:
  - `totalSalesNonCash*` from finalized non-cash sales
  - `totalSalesKhqr*` from finalized KHQR sales

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` and `branchId` come from token.
  - no tenant/branch override in query/body.
- Idempotency:
  - all write endpoints require `Idempotency-Key`.

## Types

```ts
type CashSessionStatus = "OPEN" | "CLOSED" | "FORCE_CLOSED";

type CashMovementType =
  | "SALE_IN"
  | "REFUND_CASH"
  | "MANUAL_IN"
  | "MANUAL_OUT"
  | "ADJUSTMENT";

type CashSession = {
  id: string;
  tenantId: string;
  branchId: string;
  openedByAccountId: string;
  openedAt: string; // ISO datetime
  status: CashSessionStatus;
  openingFloatUsd: number;
  openingFloatKhr: number;
  closedAt: string | null;
  closedByAccountId: string | null;
  closeNote: string | null;
};

type CashMovement = {
  id: string;
  sessionId: string;
  tenantId: string;
  branchId: string;
  movementType: CashMovementType;
  amountUsd: number;
  amountKhr: number;
  reason: string | null;
  sourceRefType: "SALE" | "VOID" | "MANUAL";
  sourceRefId: string | null;
  recordedByAccountId: string;
  occurredAt: string; // ISO datetime
};

type XReport = {
  sessionId: string;
  status: CashSessionStatus; // OPEN for active X
  openedByName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloatUsd: number;
  openingFloatKhr: number;
  totalSalesNonCashUsd: number; // mandatory informational metric
  totalSalesNonCashKhr: number; // mandatory informational metric
  totalSalesKhqrUsd: number; // KHQR-specific informational metric
  totalSalesKhqrKhr: number; // KHQR-specific informational metric
  totalSaleInUsd: number;
  totalSaleInKhr: number;
  totalRefundOutUsd: number;
  totalRefundOutKhr: number;
  totalManualInUsd: number;
  totalManualInKhr: number;
  totalManualOutUsd: number;
  totalManualOutKhr: number;
  totalAdjustmentUsd: number;
  totalAdjustmentKhr: number;
  expectedCashUsd: number;
  expectedCashKhr: number;
};

type ZReport = XReport & {
  countedCashUsd: number;
  countedCashKhr: number;
  varianceUsd: number;
  varianceKhr: number;
  closedByName: string;
  closeReason: "NORMAL_CLOSE" | "FORCE_CLOSE";
};
```

## Endpoints

### 1) Open session

`POST /v0/cash/sessions`

Action key: `cashSession.open`

Headers:
- `Idempotency-Key: <key>`

Body:
```json
{
  "openingFloatUsd": 20,
  "openingFloatKhr": 50000,
  "note": "Shift start"
}
```

Rules:
- only one OPEN session per branch
- requires active branch context

---

### 2) Get active session (current branch)

`GET /v0/cash/sessions/active`

Action key: `cashSession.active.read`

Response `200`:
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "uuid",
      "tenantId": "uuid",
      "branchId": "uuid",
      "openedByAccountId": "uuid",
      "openedAt": "2026-02-19T01:00:00.000Z",
      "status": "OPEN",
      "openingFloatUsd": 20,
      "openingFloatKhr": 50000,
      "closedAt": null,
      "closedByAccountId": null,
      "closeNote": null
    }
  }
}
```

Response `200` (no active session):
```json
{
  "success": true,
  "data": {
    "session": null
  }
}
```

Notes:
- no active session is a normal state for this query endpoint (`200` with `session: null`)

---

### 3) Close session (normal)

`POST /v0/cash/sessions/:sessionId/close`

Action key: `cashSession.close`

Headers:
- `Idempotency-Key: <key>`

Body:
```json
{
  "countedCashUsd": 31,
  "countedCashKhr": 74000,
  "note": "End shift"
}
```

Rules:
- session must be OPEN
- close denied when branch has unpaid tickets

---

### 4) Force close session

`POST /v0/cash/sessions/:sessionId/force-close`

Action key: `cashSession.forceClose`

Headers:
- `Idempotency-Key: <key>`

Body:
```json
{
  "countedCashUsd": 31,
  "countedCashKhr": 74000,
  "reason": "Cashier left unexpectedly",
  "note": "Manager override"
}
```

Rules:
- manager/admin/owner only
- session becomes `FORCE_CLOSED`
- `reason` is required canonical close justification for audit.
- `note` is optional free-text context.

---

### 5) Record paid-in

`POST /v0/cash/sessions/:sessionId/movements/paid-in`

Action key: `cashSession.movement.paidIn`

Headers:
- `Idempotency-Key: <key>`

Body:
```json
{
  "amountUsd": 10,
  "amountKhr": 0,
  "reason": "Float top-up"
}
```

---

### 6) Record paid-out

`POST /v0/cash/sessions/:sessionId/movements/paid-out`

Action key: `cashSession.movement.paidOut`

Headers:
- `Idempotency-Key: <key>`

Body:
```json
{
  "amountUsd": 0,
  "amountKhr": 12000,
  "reason": "Small expense"
}
```

---

### 7) Record manual adjustment

`POST /v0/cash/sessions/:sessionId/movements/adjustment`

Action key: `cashSession.movement.adjustment`

Headers:
- `Idempotency-Key: <key>`

Body:
```json
{
  "amountUsdDelta": -2,
  "amountKhrDelta": 0,
  "reason": "Correction after count review"
}
```

Rules:
- manager/admin/owner only

---

### 8) List sessions

`GET /v0/cash/sessions?status=open|closed|force_closed|all&from=ISO&to=ISO&limit=50&offset=0`

Action key: `cashSession.list`

---

### 9) Get session detail

`GET /v0/cash/sessions/:sessionId`

Action key: `cashSession.read`

---

### 10) List movements for a session

`GET /v0/cash/sessions/:sessionId/movements?limit=100&offset=0`

Action key: `cashSession.movements.list`

---

### 11) X report (operational snapshot)

`GET /v0/cash/sessions/:sessionId/x`

Action key: `cashSession.x.view`

Rules:
- cashier may view own sessions only
- manager/admin/owner may view branch sessions
- includes mandatory non-cash totals (`totalSalesNonCash*`) and KHQR totals (`totalSalesKhqr*`) for session visibility.
- those totals are informational and excluded from cash reconciliation math.

---

### 12) Z report (close artifact)

`GET /v0/cash/sessions/:sessionId/z`

Action key: `cashSession.z.view`

Rules:
- session must be `CLOSED` or `FORCE_CLOSED`
- cashier may view own sessions only
- includes same non-cash informational totals as X, while close reconciliation remains cash-only.

## Internal Cross-Module Hooks (No Public Endpoint)

- `RecordSaleCashIn` (from finalize sale orchestration)
  - action key: `cashSession.saleIn.record`
  - idempotency anchor: `(branch_id, sale_id)`
- `RecordRefundCashOut` (from void/reversal orchestration)
  - action key: `cashSession.refund`
  - idempotency anchor: `(branch_id, sale_id)`

## Error Codes

- `CASH_SESSION_ALREADY_OPEN`
- `CASH_SESSION_NOT_FOUND`
- `CASH_SESSION_NOT_OPEN`
- `CASH_SESSION_ALREADY_CLOSED`
- `CASH_SESSION_UNPAID_TICKETS_EXIST`
- `CASH_SESSION_REFUND_REQUIRES_OPEN_SESSION`
- `CASH_SESSION_FORBIDDEN_SELF_SCOPE`
- `IDEMPOTENCY_KEY_REQUIRED`
- `IDEMPOTENCY_CONFLICT`
- `IDEMPOTENCY_IN_PROGRESS`
- plus standard access-control/context/subscription codes from `api_contract/access-control-v0.md`

## Frontend Notes

- Always refresh active session state after successful open/close/force-close/movement write.
- X and Z are operational artifacts for cash handling UX; reporting module may consume closed-session artifacts separately.
- For retry-safe writes, reuse the same `Idempotency-Key` for the same user action.
- `openingFloatUsd` and `openingFloatKhr` are separate physical cash buckets (no FX conversion between them in session math).
- `totalSalesNonCash*` / `totalSalesKhqr*` are informational totals from sale snapshots and do not mutate cash ledger.
- `expectedCash*`, `countedCash*`, and `variance*` must exclude non-cash payments (including KHQR).

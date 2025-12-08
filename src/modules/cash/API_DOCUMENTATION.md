# Cash Module API Documentation

## Overview

The Cash module provides endpoints for managing cash sessions, movements, and reporting for point-of-sale operations. It implements the Cash Session & Reconciliation specification with flexible session management supporting both:

- **Register-based sessions**: Tied to physical terminals/registers (traditional POS)
- **Device-agnostic sessions**: Branch-level sessions for web browsers and mobile apps

The module handles cash movement tracking, variance reporting, and session reconciliation.

## Base Path

All cash endpoints are prefixed with `/v1/cash`

## Authentication

All endpoints require authentication via Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

## Endpoints

### Session Management

#### 1. Open Cash Session

**POST** `/v1/cash/sessions`

Start a new cash session with an opening float.

**Request Body:**

```json
{
  "registerId": "uuid", // Optional - omit for device-agnostic sessions
  "openingFloatUsd": 20.0,
  "openingFloatKhr": 80000,
  "note": "Morning shift opening"
}
```

**Field Details:**

- `registerId` (optional): UUID of the register. Omit for web/mobile browser sessions.
- `openingFloatUsd` (required): Starting USD amount
- `openingFloatKhr` (required): Starting KHR amount
- `note` (optional): Additional context

**Response:** `201 Created`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "branchId": "uuid",
    "registerId": "uuid", // null for device-agnostic sessions
    "openedBy": "uuid",
    "openedAt": "2025-12-03T08:00:00Z",
    "openingFloatUsd": 20.0,
    "openingFloatKhr": 80000,
    "status": "OPEN",
    "expectedCashUsd": 20.0,
    "expectedCashKhr": 80000,
    "countedCashUsd": 0,
    "countedCashKhr": 0,
    "varianceUsd": 0,
    "varianceKhr": 0,
    "note": "Morning shift opening"
  }
}
```

**Error Responses:**

- `400 Bad Request` - Session already open (on this register or for this branch)
- `401 Unauthorized` - Invalid or missing token
- `422 Validation Error` - Invalid input data

---

#### 2. Take Over Session

**POST** `/v1/cash/sessions/take-over`

Manager/Admin can take over an existing open session (closes old, opens new).

**Request Body:**

```json
{
  "registerId": "uuid", // Optional - omit to take over branch-level session
  "reason": "Previous cashier forgot to close session",
  "openingFloatUsd": 20.0,
  "openingFloatKhr": 80000
}
```

**Field Details:**

- `registerId` (optional): UUID of the register. Omit to take over the active branch-level session.
- `reason` (required): Explanation for takeover (3-500 characters)

**Response:** `201 Created`

**Permissions:** Requires Manager or Admin role

---

#### 3. Close Cash Session

**POST** `/v1/cash/sessions/:sessionId/close`

Close a session with counted cash. Calculates variance and determines if review is needed.

**Request Body:**

```json
{
  "countedCashUsd": 185.5,
  "countedCashKhr": 742000,
  "note": "End of shift"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "CLOSED", // or "PENDING_REVIEW" if variance > $5
    "closedBy": "uuid",
    "closedAt": "2025-12-03T18:00:00Z",
    "expectedCashUsd": 180.0,
    "expectedCashKhr": 720000,
    "countedCashUsd": 185.5,
    "countedCashKhr": 742000,
    "varianceUsd": 5.5,
    "varianceKhr": 22000
  }
}
```

---

#### 4. Get Active Session

**GET** `/v1/cash/sessions/active?registerId=<uuid>`

Get the currently open session with all movements.

**Query Parameters:**

- `registerId` (optional) - UUID of the register. If omitted, returns the active branch-level session.

**Behavior:**

- With `registerId`: Returns the open session for that specific register
- Without `registerId`: Returns the open device-agnostic session for the authenticated user's branch

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "OPEN",
    "openingFloatUsd": 20.0,
    "expectedCashUsd": 185.5,
    "movements": [
      {
        "id": "uuid",
        "type": "SALE_CASH",
        "amountUsd": 15.0,
        "amountKhr": 60000,
        "status": "APPROVED",
        "refSaleId": "uuid",
        "createdAt": "2025-12-03T10:30:00Z"
      }
    ]
  }
}
```

**Error Responses:**

- `404 Not Found` - No active session found (for the register if specified, or for the branch)

---

### Cash Movements

#### 5. Record Manual Movement

**POST** `/v1/cash/sessions/:sessionId/movements`

Record a manual cash movement (Paid In, Paid Out, or Adjustment).

**Request Body:**

```json
{
  "type": "PAID_OUT",
  "amountUsd": 5.0,
  "amountKhr": 20000,
  "reason": "Petty cash for supplies"
}
```

**Movement Types:**

- `PAID_IN` - Add cash to drawer (increases expected)
- `PAID_OUT` - Remove cash from drawer (decreases expected)
- `ADJUSTMENT` - Manual correction (can be + or -)

**Response:** `201 Created`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "sessionId": "uuid",
    "type": "PAID_OUT",
    "status": "APPROVED",
    "amountUsd": 5.0,
    "amountKhr": 20000,
    "reason": "Petty cash for supplies",
    "actorId": "uuid",
    "createdAt": "2025-12-03T14:00:00Z"
  }
}
```

**Validation:**

- Reason must be 3-120 characters
- Amounts cannot be negative
- Session must be OPEN

---

### Reports

#### 6. Z Report (Closure Summary)

**GET** `/v1/cash/reports/z/:sessionId`

Generate a complete closure summary for a session.

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "session": {
      /* session object */
    },
    "movements": [
      /* array of movements */
    ],
    "summary": {
      "openingFloatUsd": 20.0,
      "openingFloatKhr": 80000,
      "totalSalesCashUsd": 165.5,
      "totalSalesCashKhr": 662000,
      "totalPaidInUsd": 0,
      "totalPaidInKhr": 0,
      "totalPaidOutUsd": 5.0,
      "totalPaidOutKhr": 20000,
      "totalRefundsUsd": 0,
      "totalRefundsKhr": 0,
      "expectedCashUsd": 180.5,
      "expectedCashKhr": 722000,
      "countedCashUsd": 185.5,
      "countedCashKhr": 742000,
      "varianceUsd": 5.0,
      "varianceKhr": 20000
    }
  }
}
```

---

#### 7. X Report (Live Summary)

**GET** `/v1/cash/reports/x?registerId=<uuid>`

Generate a live summary of the currently open session (same structure as Z Report).

**Query Parameters:**

- `registerId` (required) - UUID of the register

**Response:** `200 OK` - Same structure as Z Report

**Error Responses:**

- `404 Not Found` - No active session for this register

---

## Data Models

### Cash Session Status

- `OPEN` - Session is active and accepting movements
- `CLOSED` - Session closed with no significant variance
- `PENDING_REVIEW` - Session closed with variance > threshold ($5 USD)
- `APPROVED` - Reviewed and approved by manager

### Cash Movement Types

- `SALE_CASH` - Automatic from finalized cash sales
- `REFUND_CASH` - Automatic from voided cash sales
- `PAID_IN` - Manual addition to drawer
- `PAID_OUT` - Manual removal from drawer (petty cash)
- `ADJUSTMENT` - Manual correction

### Movement Status

- `APPROVED` - Movement accepted and applied
- `PENDING` - Awaiting manager approval (over-limit paid-outs)
- `DECLINED` - Rejected by manager

---

## Workflow Examples

### Normal Day Flow

1. **Morning**: Cashier opens session

   ```
   POST /v1/cash/sessions
   { "registerId": "...", "openingFloatUsd": 20, "openingFloatKhr": 80000 }
   ```

2. **During Shift**: Sales automatically create SALE_CASH movements

3. **Afternoon**: Cashier records paid-out

   ```
   POST /v1/cash/sessions/{sessionId}/movements
   { "type": "PAID_OUT", "amountUsd": 5, ... }
   ```

4. **End of Day**: Cashier closes session

   ```
   POST /v1/cash/sessions/{sessionId}/close
   { "countedCashUsd": 185.50, "countedCashKhr": 742000 }
   ```

5. **Review**: Manager views Z Report
   ```
   GET /v1/cash/reports/z/{sessionId}
   ```

---

### Take Over Flow (Forgot to Close)

1. **Next Morning**: Manager sees previous session still open

   ```
   GET /v1/cash/sessions/active?registerId=...
   ```

2. **Manager Takes Over**:
   ```
   POST /v1/cash/sessions/take-over
   { "registerId": "...", "reason": "Previous session left open", ... }
   ```

---

## Event Integration

The cash module automatically listens to sales events:

- **sales.sale_finalized** → Creates SALE_CASH movement
- **sales.sale_voided** → Creates REFUND_CASH movement

These movements are automatically applied to the active session's expected cash.

---

## Session Types: Register-Based vs Device-Agnostic

### Register-Based Sessions (Traditional POS)

For physical terminals and registers, include `registerId` in all session operations:

```json
// Opening a register-based session
POST /v1/cash/sessions
{
  "registerId": "abc-123-uuid",
  "openingFloatUsd": 100.0,
  "openingFloatKhr": 400000
}

// Getting active session for a register
GET /v1/cash/sessions/active?registerId=abc-123-uuid
```

**Constraints:**

- Only one OPEN session allowed per register at a time
- Register must exist and be ACTIVE
- Register must belong to the same tenant/branch

### Device-Agnostic Sessions (Web & Mobile)

For web browsers, mobile apps, or any non-terminal device, omit `registerId`:

```json
// Opening a device-agnostic session
POST /v1/cash/sessions
{
  "openingFloatUsd": 100.0,
  "openingFloatKhr": 400000
}

// Getting active branch-level session
GET /v1/cash/sessions/active
```

**Constraints:**

- Only one device-agnostic OPEN session allowed per branch at a time
- Authenticated user's tenant/branch is used automatically
- No register management required

### Use Cases

**Register-Based:**

- Traditional POS terminals
- Fixed cash drawers
- Multiple concurrent stations in a branch
- Hardware-specific setups

**Device-Agnostic:**

- Web-based POS in browsers
- Mobile POS apps
- Single-station operations
- Cloud-first implementations

---

## Error Handling

All endpoints return a consistent error format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**

- `200` - Success
- `201` - Resource created
- `400` - Bad request / Business logic error
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Resource not found
- `422` - Validation error
- `500` - Internal server error

---

## Best Practices

1. **Always check for active session** before starting a new one
2. **Close sessions at end of shift** to maintain accurate records
3. **Provide clear reasons** for all manual movements (3-120 chars)
4. **Review variance** when closing shows PENDING_REVIEW status
5. **Use X Report** throughout the day for real-time monitoring
6. **Use Z Report** after closing for final reconciliation

---

## Security Notes

- All endpoints require valid authentication
- Take-over operations require Manager/Admin role
- All actions are logged with actor tracking
- Session constraints prevent concurrent sessions per register
- Event outbox ensures atomic operations

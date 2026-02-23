# Receipt Module (`/v0`) — API Contract

This document locks the canonical `/v0` HTTP contract for receipt read + print/reprint operations.

Status:
- Phase 1-4 completed (boundary + data model + command/query/ACL + finalize-path integration/reliability)

Canonical base prefix:
- `/v0/receipts`

## Purpose

Receipt endpoints expose receipt projections generated directly from finalized/voided sale truth.

Rules:
- `receiptId` equals `saleId` (receipt APIs are sale-keyed).
- Receipt reads are served from sale + sale lines (no dedicated receipt snapshot table).
- Print/reprint are observational effects and do not mutate sale/cash/inventory truth.

## Conventions

- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Working context:
  - `tenantId` + `branchId` from token context only
  - no context override in body/query/header
- Idempotency:
  - all write endpoints require `Idempotency-Key`
  - replayed responses include `Idempotency-Replayed: true`

## Action Keys

- `receipt.read`
- `receipt.readBySale`
- `receipt.print`
- `receipt.reprint`

---

## Endpoints

### 1) Get receipt by receipt id
`GET /v0/receipts/:receiptId`  
Action key: `receipt.read`

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "receiptId": "f3193e7e-8e33-4d2f-af86-71bc77e5d566",
    "saleId": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "receiptNumber": "RCP-20260223-000000",
    "statusDisplay": "NORMAL",
    "issuedAt": "2026-02-23T08:20:33.000Z",
    "saleSnapshot": {
      "paymentMethod": "KHQR",
      "tenderCurrency": "USD",
      "subtotalUsd": 8,
      "discountUsd": 0,
      "vatUsd": 0,
      "grandTotalUsd": 8,
      "subtotalKhr": 32800,
      "discountKhr": 0,
      "vatKhr": 0,
      "grandTotalKhr": 32800
    },
    "lines": [
      {
        "lineId": "5c977953-e0ab-4f10-98e0-bce3cf0f44a6",
        "menuItemNameSnapshot": "Iced Latte",
        "unitPrice": 2.5,
        "quantity": 2,
        "lineDiscountAmount": 0,
        "lineTotalAmount": 5,
        "modifierSnapshot": []
      }
    ],
    "createdAt": "2026-02-23T08:20:33.000Z",
    "updatedAt": "2026-02-23T08:20:33.000Z"
  }
}
```

---

### 2) Get receipt by sale id
`GET /v0/receipts/sales/:saleId`  
Action key: `receipt.readBySale`

Response:
- same shape as `GET /v0/receipts/:receiptId`

---

### 3) Print receipt
`POST /v0/receipts/:receiptId/print`  
Action key: `receipt.print`

Headers:
- `Idempotency-Key: <client key>`

Body example:
```json
{
  "copies": 1,
  "target": "RECEIPT_PRINTER"
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "receiptId": "f3193e7e-8e33-4d2f-af86-71bc77e5d566",
    "requestedAt": "2026-02-23T08:30:12.000Z",
    "purpose": "AUTO_AFTER_FINALIZE",
    "dispatchStatus": "QUEUED"
  }
}
```

Notes:
- printing is best-effort operational effect
- `dispatchStatus` confirms request acceptance, not physical print success

---

### 4) Reprint receipt
`POST /v0/receipts/:receiptId/reprint`  
Action key: `receipt.reprint`

Headers:
- `Idempotency-Key: <client key>`

Body example:
```json
{
  "copies": 1,
  "target": "RECEIPT_PRINTER",
  "reason": "CUSTOMER_REQUESTED_COPY"
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "receiptId": "f3193e7e-8e33-4d2f-af86-71bc77e5d566",
    "requestedAt": "2026-02-23T08:32:10.000Z",
    "purpose": "MANUAL_REPRINT",
    "dispatchStatus": "QUEUED"
  }
}
```

---

## Locked Error Codes

- `RECEIPT_NOT_FOUND`
- `IDEMPOTENCY_KEY_REQUIRED`
- `IDEMPOTENCY_CONFLICT`
- `IDEMPOTENCY_IN_PROGRESS`
- plus standard context/access/subscription denial codes

---

## Frontend Rollout Note

Receipt APIs are live and should be used as the canonical render source for receipt workflows:
- `GET /v0/receipts/sales/:saleId`
- `GET /v0/receipts/:receiptId`
- `POST /v0/receipts/:receiptId/print`
- `POST /v0/receipts/:receiptId/reprint`

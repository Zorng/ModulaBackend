# Sale + Order Module (`/v0`) — API Contract

This document locks the canonical `/v0` sale/order HTTP contract and includes request/response examples.

Base prefixes:
- `/v0/orders`
- `/v0/sales`

Implementation status:
- Online command/query + ACL surface is implemented on `/v0/orders` and `/v0/sales`.
- Local-cart checkout bridge is implemented on `/v0/checkout/*`:
  - `POST /v0/checkout/cash/finalize`
  - `POST /v0/checkout/khqr/initiate`
  - `GET /v0/checkout/khqr/intents/:intentId`
  - `POST /v0/checkout/khqr/intents/:intentId/cancel`
- Pay-later lane remains on `/v0/orders*` (open ticket lifecycle).
- Push replay remains partial for sale/order writes.

Frontend rollout note:
- Treat all listed `/v0/orders` + `/v0/sales` endpoints as online-ready.
- Always send `Idempotency-Key` for write endpoints.
- Do not route full sale/order flow through `pushSync` yet.

Frontend cutover map (online lane):
- Cashier checkout:
  - `POST /v0/checkout/cash/finalize`
  - `POST /v0/checkout/khqr/initiate`
  - `GET /v0/checkout/khqr/intents/:intentId`
  - `POST /v0/checkout/khqr/intents/:intentId/cancel`
- Pay-later ticket lane:
  - `GET|POST /v0/orders*`
  - `PATCH /v0/orders/:orderId/fulfillment`
  - `POST /v0/orders/:orderId/cancel`
  - Requires branch policy `saleAllowPayLater = true` for place/add writes

## Checkout Rule (Locked)

Use this rule to avoid ambiguous behavior:

1) **Not pay-later (pay-now checkout)**
- Source: local cart
- Endpoints: `/v0/checkout/cash/finalize` or `/v0/checkout/khqr/*`
- Result: on successful payment commit, backend records a **FINALIZED sale**
- Order ticket: **not created**

2) **Pay-later**
- Source: open ticket workflow
- Endpoints: `/v0/orders`, `/v0/orders/:orderId/items`, `/v0/orders/:orderId/cancel`
- Result: backend records an **OPEN order ticket** that can be updated before payment
- Sale: **not created yet**

3) **Pay-later settlement**
- Endpoint: `/v0/orders/:orderId/checkout` (settlement from an existing open ticket)
- `paymentMethod = CASH`: checkout settles and returns **FINALIZED sale** in one command
- `paymentMethod = KHQR`: checkout creates **PENDING sale**; finalize after KHQR confirmation

---

## Checkout Remodel Draft (Partially Implemented)

Status:
- Checkout endpoints listed below are implemented.
- Full cutover is still pending; `/v0/orders*` remains for pay-later order tickets.

Goals:
- Remove server-side cart as default checkout lane.
- Record `sale` only when payment is committed.
- Use KHQR webhook as primary confirmation path.
- Keep manual confirm as fallback action for cashier.

### Checkout (client-local cart)

#### 1) Cash checkout finalize
`POST /v0/checkout/cash/finalize`  
Action key: `checkout.cash.finalize`

Body:
```json
{
  "items": [
    {
      "menuItemId": "uuid",
      "quantity": 2,
      "modifierSelections": [
        { "groupId": "uuid", "optionIds": ["uuid"] }
      ],
      "note": "Less ice"
    }
  ],
  "saleType": "DINE_IN",
  "tenderCurrency": "USD",
  "cashReceivedTenderAmount": 10
}
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "sale": { "id": "uuid", "status": "FINALIZED", "saleType": "DINE_IN" },
    "lines": [],
    "receipt": {
      "receiptId": "uuid",
      "saleId": "uuid",
      "statusDisplay": "NORMAL",
      "issuedAt": "2026-02-23T18:00:00.000Z",
      "saleSnapshot": {
        "paymentMethod": "CASH",
        "tenderCurrency": "USD",
        "subtotalUsd": 8,
        "subtotalKhr": 32800,
        "discountUsd": 0,
        "discountKhr": 0,
        "vatUsd": 0,
        "vatKhr": 0,
        "grandTotalUsd": 8,
        "grandTotalKhr": 32800,
        "tenderAmount": 8,
        "paidAmount": 8,
        "cashReceivedTenderAmount": 10,
        "cashChangeTenderAmount": 2
      },
      "lines": []
    }
  }
}
```

Rules:
- Server reprices from catalog/policy and ignores client price snapshots.
- Atomic write: sale + sale lines + side effects (inventory/cash movement/outbox).
- `saleType` defaults to `DINE_IN` when omitted.
- For `paymentMethod = CASH`, `tenderAmount` must match grand total and `cashReceivedTenderAmount` must be `>= tenderAmount`.
- Finalized responses include `data.receipt` for local immediate print (no extra receipt API call required).
- For cash receipts, use `cashReceivedTenderAmount` and `cashChangeTenderAmount` from the receipt payload.

#### 2) KHQR checkout initiate
`POST /v0/checkout/khqr/initiate`  
Action key: `checkout.khqr.initiate`

Body:
```json
{
  "items": [
    {
      "menuItemId": "uuid",
      "quantity": 2,
      "modifierSelections": [],
      "note": null
    }
  ],
  "saleType": "DINE_IN",
  "expiresInSeconds": 180
}
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "intent": {
      "paymentIntentId": "uuid",
      "status": "WAITING_FOR_PAYMENT",
      "saleId": null
    },
    "attempt": {
      "attemptId": "uuid",
      "paymentIntentId": "uuid",
      "saleId": null,
      "md5": "khqr-md5",
      "status": "WAITING_FOR_PAYMENT"
    },
    "paymentRequest": {
      "md5": "khqr-md5",
      "payload": "....",
      "payloadType": "EMV_KHQR_STRING"
    },
    "preview": {
      "itemCount": 1,
      "grandTotalUsd": 3.5,
      "grandTotalKhr": 14350
    }
  }
}
```

Rules:
- No `sale` row is created at initiate.
- Intent stores immutable checkout snapshot for later finalization.
- `saleType` defaults to `DINE_IN` when omitted and is applied when sale is materialized after KHQR confirmation.

#### 3) Read intent status
`GET /v0/checkout/khqr/intents/:intentId`

Response `200`:
```json
{
  "success": true,
  "data": {
    "paymentIntentId": "uuid",
    "status": "WAITING_FOR_PAYMENT",
    "saleId": null,
    "reasonCode": null
  }
}
```

#### 4) Cancel intent
`POST /v0/checkout/khqr/intents/:intentId/cancel`  
Action key: `checkout.khqr.intent.cancel`

Response `200`:
```json
{
  "success": true,
  "data": {
    "paymentIntentId": "uuid",
    "status": "CANCELLED"
  }
}
```

Rules:
- Allowed only when not finalized.
- Cancelled/expired intent does not create sale.

### Sale lifecycle (target)
```ts
type SaleStatus = "FINALIZED" | "VOID_PENDING" | "VOIDED";
```

---

## Current Implemented Contract (Live)

The sections below (`Conventions`, `Types`, `Orders`, `Sales`, sync notes, and errors) describe the current implemented `/v0` behavior.

---

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Working context:
  - `tenantId` + `branchId` come from token context only
  - no context override in request body/query/header
- Idempotency:
  - all write endpoints require `Idempotency-Key`
  - replayed responses include `Idempotency-Replayed: true`

Example write headers:
```http
Authorization: Bearer <accessToken>
Idempotency-Key: 2b0b0f12-84be-4ac2-b9ba-f8a8b8b5f2f0
Content-Type: application/json
```

---

## Types

```ts
type OrderStatus = "OPEN" | "CHECKED_OUT" | "CANCELLED";
type SaleStatus = "PENDING" | "FINALIZED" | "VOID_PENDING" | "VOIDED";
type VoidRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
type SaleType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";

type OrderItemModifierSelection = {
  groupId: string;
  optionIds: string[];
};

type OrderItemInput = {
  menuItemId: string;
  quantity: number;
  modifierSelections?: OrderItemModifierSelection[];
  note?: string | null;
};
```

---

## Orders

### 1) Place order ticket
`POST /v0/orders`  
Action key: `order.place`

Body example:
```json
{
  "items": [
    {
      "menuItemId": "a7f5dc8a-02ce-4c88-8f39-6e6ec0c4ed42",
      "quantity": 2,
      "modifierSelections": [
        {
          "groupId": "2b5f4f4b-3f6c-4900-a4b1-77bb0ee7f47b",
          "optionIds": [
            "0b38f877-eed2-47b5-a9be-43f7f04b7e15"
          ]
        }
      ],
      "note": "Less ice"
    }
  ]
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "openedByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7",
    "status": "OPEN",
    "checkedOutAt": null,
    "checkedOutByAccountId": null,
    "cancelledAt": null,
    "cancelledByAccountId": null,
    "cancelReason": null,
    "createdAt": "2026-02-22T10:00:00.000Z",
    "updatedAt": "2026-02-22T10:00:00.000Z",
    "lines": [
      {
        "id": "d04dd5b8-f31c-4b1f-a111-c1314437f4e1",
        "orderId": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
        "menuItemId": "a7f5dc8a-02ce-4c88-8f39-6e6ec0c4ed42",
        "menuItemNameSnapshot": "Iced Latte",
        "unitPrice": 2.5,
        "quantity": 2,
        "lineSubtotal": 5,
        "modifierSnapshot": [],
        "note": "Less ice",
        "createdAt": "2026-02-22T10:00:00.000Z",
        "updatedAt": "2026-02-22T10:00:00.000Z"
      }
    ]
  }
}
```

Rules:
- requires open cash session (`ORDER_REQUIRES_OPEN_CASH_SESSION`)
- server ignores client price/name snapshots and resolves canonical values from menu catalog
- server validates branch visibility + modifier selections; invalid combos are rejected
- denied when branch policy `saleAllowPayLater = false` (`ORDER_PAY_LATER_DISABLED`)

---

### 2) Add items to open order
`POST /v0/orders/:orderId/items`  
Action key: `order.items.add`

Body example:
```json
{
  "items": [
    {
      "menuItemId": "0ce7a7b6-d10f-4f0f-b2be-9f1fc56cf82f",
      "quantity": 1,
      "modifierSelections": [],
      "note": null
    }
  ]
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
    "status": "OPEN",
    "addedLines": [
      {
        "id": "38432852-4d11-43e9-b2ec-f5dfce3d8ef8",
        "orderId": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
        "menuItemId": "0ce7a7b6-d10f-4f0f-b2be-9f1fc56cf82f",
        "menuItemNameSnapshot": "Mocha",
        "unitPrice": 3,
        "quantity": 1,
        "lineSubtotal": 3,
        "modifierSnapshot": [],
        "note": null,
        "createdAt": "2026-02-22T10:03:00.000Z",
        "updatedAt": "2026-02-22T10:03:00.000Z"
      }
    ]
  }
}
```

Rules:
- requires open cash session (`ORDER_REQUIRES_OPEN_CASH_SESSION`)
- denied when branch policy `saleAllowPayLater = false` (`ORDER_PAY_LATER_DISABLED`)

---

### 3) Checkout order
`POST /v0/orders/:orderId/checkout`  
Action key: `order.checkout`

Body example (KHQR):
```json
{
  "paymentMethod": "KHQR",
  "saleType": "DELIVERY",
  "tenderCurrency": "USD",
  "tenderAmount": 8,
  "subtotalUsd": 8,
  "discountUsd": 0,
  "vatUsd": 0,
  "grandTotalUsd": 8,
  "saleFxRateKhrPerUsd": 4100
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "orderId": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
    "status": "PENDING",
    "saleType": "DELIVERY",
    "paymentMethod": "KHQR",
    "tenderCurrency": "USD",
    "tenderAmount": 8,
    "cashReceivedTenderAmount": null,
    "cashChangeTenderAmount": 0,
    "subtotalUsd": 8,
    "subtotalKhr": 32800,
    "discountUsd": 0,
    "discountKhr": 0,
    "vatUsd": 0,
    "vatKhr": 0,
    "grandTotalUsd": 8,
    "grandTotalKhr": 32800,
    "saleFxRateKhrPerUsd": 4100,
    "saleKhrRoundingEnabled": true,
    "saleKhrRoundingMode": "NEAREST",
    "saleKhrRoundingGranularity": "100",
    "khqrMd5": null,
    "khqrToAccountId": null,
    "khqrHash": null,
    "khqrConfirmedAt": null,
    "finalizedAt": null,
    "voidedAt": null,
    "voidReason": null,
    "createdAt": "2026-02-22T10:05:00.000Z",
    "updatedAt": "2026-02-22T10:05:00.000Z",
    "order": {
      "id": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
      "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
      "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
      "openedByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7",
      "status": "CHECKED_OUT",
      "checkedOutAt": "2026-02-22T10:05:00.000Z",
      "checkedOutByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7",
      "cancelledAt": null,
      "cancelledByAccountId": null,
      "cancelReason": null,
      "createdAt": "2026-02-22T10:00:00.000Z",
      "updatedAt": "2026-02-22T10:05:00.000Z"
    },
    "lines": [
      {
        "id": "5c977953-e0ab-4f10-98e0-bce3cf0f44a6",
        "saleId": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
        "orderLineId": "d04dd5b8-f31c-4b1f-a111-c1314437f4e1",
        "menuItemId": "a7f5dc8a-02ce-4c88-8f39-6e6ec0c4ed42",
        "menuItemNameSnapshot": "Iced Latte",
        "unitPrice": 2.5,
        "quantity": 2,
        "lineDiscountAmount": 0,
        "lineTotalAmount": 5,
        "modifierSnapshot": [],
        "createdAt": "2026-02-22T10:05:00.000Z",
        "updatedAt": "2026-02-22T10:05:00.000Z"
      }
    ]
  }
}
```

Rules:
- requires open cash session (`SALE_CHECKOUT_REQUIRES_OPEN_CASH_SESSION`)
- `saleType` defaults to `DINE_IN` when omitted
- `paymentMethod = CASH` settles and returns `sale.status = FINALIZED` in one command
- `paymentMethod = KHQR` returns `sale.status = PENDING` until KHQR is confirmed

---

### 4) Cancel unpaid order ticket
`POST /v0/orders/:orderId/cancel`  
Action key: `order.cancel`

Body example:
```json
{
  "reason": "Customer left before payment"
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
    "status": "CANCELLED",
    "cancelReason": "Customer left before payment",
    "cancelledAt": "2026-02-22T10:06:00.000Z",
    "cancelledByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7"
  }
}
```

Rules:
- Allowed only for unpaid/open tickets.
- Requires non-empty `reason`.
- Retrying cancel on an already cancelled ticket returns success (idempotent no-op).

---

### 5) Update fulfillment status
`PATCH /v0/orders/:orderId/fulfillment`  
Action key: `order.fulfillment.status.update`

Body example:
```json
{
  "status": "PREPARING",
  "note": "Started by kitchen"
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "11f57e4d-c5fb-4f29-bbc5-4f6f17f99373",
    "orderId": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
    "status": "PREPARING",
    "note": "Started by kitchen",
    "createdByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7",
    "completedAt": null,
    "createdAt": "2026-02-22T10:07:00.000Z",
    "updatedAt": "2026-02-22T10:07:00.000Z"
  }
}
```

---

### 6) List orders
`GET /v0/orders?status=OPEN&limit=20&offset=0`  
Action key: `order.list`

Response example (`200`):
```json
{
  "success": true,
  "data": [
    {
      "id": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
      "status": "OPEN",
      "createdAt": "2026-02-22T10:00:00.000Z",
      "updatedAt": "2026-02-22T10:03:00.000Z"
    }
  ]
}
```

---

### 7) Get order detail
`GET /v0/orders/:orderId`  
Action key: `order.read`

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "openedByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7",
    "status": "OPEN",
    "checkedOutAt": null,
    "checkedOutByAccountId": null,
    "cancelledAt": null,
    "cancelledByAccountId": null,
    "cancelReason": null,
    "createdAt": "2026-02-22T10:00:00.000Z",
    "updatedAt": "2026-02-22T10:03:00.000Z",
    "lines": [
      {
        "id": "d04dd5b8-f31c-4b1f-a111-c1314437f4e1",
        "orderId": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
        "menuItemId": "a7f5dc8a-02ce-4c88-8f39-6e6ec0c4ed42",
        "menuItemNameSnapshot": "Iced Latte",
        "unitPrice": 2.5,
        "quantity": 2,
        "lineSubtotal": 5,
        "modifierSnapshot": [],
        "note": "Less ice",
        "createdAt": "2026-02-22T10:00:00.000Z",
        "updatedAt": "2026-02-22T10:00:00.000Z"
      }
    ],
    "fulfillmentBatches": []
  }
}
```

---

## Sales

### 8) Finalize sale
`POST /v0/sales/:saleId/finalize`  
Action key: `sale.finalize`

Body example (KHQR):
```json
{
  "paidAmount": 8,
  "khqrMd5": "8b4a2b3a0512451d6d7aab75187998254d517f77c48a151617f75ea77e5e7f64"
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "orderId": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
    "status": "FINALIZED",
    "paymentMethod": "KHQR",
    "tenderCurrency": "USD",
    "tenderAmount": 8,
    "cashReceivedTenderAmount": null,
    "cashChangeTenderAmount": 0,
    "subtotalUsd": 8,
    "subtotalKhr": 32800,
    "discountUsd": 0,
    "discountKhr": 0,
    "vatUsd": 0,
    "vatKhr": 0,
    "grandTotalUsd": 8,
    "grandTotalKhr": 32800,
    "saleFxRateKhrPerUsd": 4100,
    "saleKhrRoundingEnabled": true,
    "saleKhrRoundingMode": "NEAREST",
    "saleKhrRoundingGranularity": "100",
    "khqrMd5": "8b4a2b3a0512451d6d7aab75187998254d517f77c48a151617f75ea77e5e7f64",
    "khqrToAccountId": "ieangzorng_lim@bkrt",
    "khqrHash": "db_hash",
    "khqrConfirmedAt": "2026-02-22T10:10:00.000Z",
    "finalizedAt": "2026-02-22T10:10:01.000Z",
    "voidedAt": null,
    "voidReason": null,
    "createdAt": "2026-02-22T10:05:00.000Z",
    "updatedAt": "2026-02-22T10:10:01.000Z"
    ,
    "receipt": {
      "receiptId": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
      "saleId": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
      "statusDisplay": "NORMAL",
      "issuedAt": "2026-02-22T10:10:01.000Z",
      "saleSnapshot": {
        "paymentMethod": "KHQR",
        "tenderCurrency": "USD",
        "subtotalUsd": 8,
        "subtotalKhr": 32800,
        "discountUsd": 0,
        "discountKhr": 0,
        "vatUsd": 0,
        "vatKhr": 0,
        "grandTotalUsd": 8,
        "grandTotalKhr": 32800,
        "tenderAmount": 8,
        "paidAmount": 8,
        "cashReceivedTenderAmount": null,
        "cashChangeTenderAmount": 0
      },
      "lines": []
    }
  }
}
```

Rules:
- requires open cash session (`SALE_FINALIZE_REQUIRES_OPEN_CASH_SESSION`)
- KHQR requires backend-confirmed proof:
  - `SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED`
  - `SALE_FINALIZE_KHQR_PROOF_MISMATCH`
- KHQR generation endpoint:
  - `POST /v0/payments/khqr/sales/:saleId/generate`

---

### 9) Request void (team mode)
`POST /v0/sales/:saleId/void/request`  
Action key: `sale.void.request`

Body example:
```json
{
  "reason": "Wrong item prepared"
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "6b89fb1a-b2e9-4698-a7c2-79ea5c187c81",
    "saleId": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "requestedByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7",
    "reviewedByAccountId": null,
    "status": "PENDING",
    "reason": "Wrong item prepared",
    "reviewNote": null,
    "requestedAt": "2026-02-22T10:12:00.000Z",
    "reviewedAt": null,
    "createdAt": "2026-02-22T10:12:00.000Z",
    "updatedAt": "2026-02-22T10:12:00.000Z"
  }
}
```

---

### 10) Approve void request (team mode)
`POST /v0/sales/:saleId/void/approve`  
Action key: `sale.void.approve`

Body example:
```json
{
  "note": "Approved by manager"
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "6b89fb1a-b2e9-4698-a7c2-79ea5c187c81",
    "saleId": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "requestedByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7",
    "reviewedByAccountId": "d2453d8c-0f70-4efd-a522-23ac3d690955",
    "status": "APPROVED",
    "reason": "Wrong item prepared",
    "reviewNote": "Approved by manager",
    "requestedAt": "2026-02-22T10:12:00.000Z",
    "reviewedAt": "2026-02-22T10:13:00.000Z",
    "createdAt": "2026-02-22T10:12:00.000Z",
    "updatedAt": "2026-02-22T10:13:00.000Z"
  }
}
```

---

### 11) Reject void request (team mode)
`POST /v0/sales/:saleId/void/reject`  
Action key: `sale.void.reject`

Body example:
```json
{
  "note": "Keep sale record"
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "6b89fb1a-b2e9-4698-a7c2-79ea5c187c81",
    "saleId": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "requestedByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7",
    "reviewedByAccountId": "d2453d8c-0f70-4efd-a522-23ac3d690955",
    "status": "REJECTED",
    "reason": "Wrong item prepared",
    "reviewNote": "Keep sale record",
    "requestedAt": "2026-02-22T10:12:00.000Z",
    "reviewedAt": "2026-02-22T10:13:30.000Z",
    "createdAt": "2026-02-22T10:12:00.000Z",
    "updatedAt": "2026-02-22T10:13:30.000Z"
  }
}
```

---

### 12) Execute void
`POST /v0/sales/:saleId/void/execute`  
Action key: `sale.void.execute`

Body example:
```json
{
  "reason": "Operator corrected sale"
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "orderId": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
    "status": "VOIDED",
    "paymentMethod": "CASH",
    "tenderCurrency": "USD",
    "tenderAmount": 8,
    "cashReceivedTenderAmount": 10,
    "cashChangeTenderAmount": 2,
    "subtotalUsd": 8,
    "subtotalKhr": 32800,
    "discountUsd": 0,
    "discountKhr": 0,
    "vatUsd": 0,
    "vatKhr": 0,
    "grandTotalUsd": 8,
    "grandTotalKhr": 32800,
    "saleFxRateKhrPerUsd": 4100,
    "saleKhrRoundingEnabled": true,
    "saleKhrRoundingMode": "NEAREST",
    "saleKhrRoundingGranularity": "100",
    "khqrMd5": null,
    "khqrToAccountId": null,
    "khqrHash": null,
    "khqrConfirmedAt": null,
    "finalizedAt": "2026-02-22T10:10:00.000Z",
    "voidedAt": "2026-02-22T10:15:00.000Z",
    "voidReason": "Operator corrected sale",
    "createdAt": "2026-02-22T10:05:00.000Z",
    "updatedAt": "2026-02-22T10:15:00.000Z"
  }
}
```

Rules:
- workforce OFF: direct execute path (no second actor approval required)
- workforce ON: requires approved void request (`VOID_APPROVAL_REQUIRED`)

---

### 13) List sales
`GET /v0/sales?status=FINALIZED&limit=20&offset=0`  
Action key: `sale.list`

Response example (`200`):
```json
{
  "success": true,
  "data": [
    {
      "id": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
      "status": "FINALIZED",
      "paymentMethod": "KHQR",
      "tenderCurrency": "USD",
      "grandTotalUsd": 8,
      "grandTotalKhr": 32800,
      "finalizedAt": "2026-02-22T10:10:01.000Z",
      "voidedAt": null,
      "createdAt": "2026-02-22T10:05:00.000Z",
      "updatedAt": "2026-02-22T10:10:01.000Z"
    }
  ]
}
```

---

### 14) Get sale detail
`GET /v0/sales/:saleId`  
Action key: `sale.read`

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "orderId": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
    "status": "FINALIZED",
    "paymentMethod": "KHQR",
    "tenderCurrency": "USD",
    "tenderAmount": 8,
    "cashReceivedTenderAmount": null,
    "cashChangeTenderAmount": 0,
    "subtotalUsd": 8,
    "subtotalKhr": 32800,
    "discountUsd": 0,
    "discountKhr": 0,
    "vatUsd": 0,
    "vatKhr": 0,
    "grandTotalUsd": 8,
    "grandTotalKhr": 32800,
    "saleFxRateKhrPerUsd": 4100,
    "saleKhrRoundingEnabled": true,
    "saleKhrRoundingMode": "NEAREST",
    "saleKhrRoundingGranularity": "100",
    "khqrMd5": "8b4a2b3a0512451d6d7aab75187998254d517f77c48a151617f75ea77e5e7f64",
    "khqrToAccountId": "ieangzorng_lim@bkrt",
    "khqrHash": "db_hash",
    "khqrConfirmedAt": "2026-02-22T10:10:00.000Z",
    "finalizedAt": "2026-02-22T10:10:01.000Z",
    "voidedAt": null,
    "voidReason": null,
    "createdAt": "2026-02-22T10:05:00.000Z",
    "updatedAt": "2026-02-22T10:10:01.000Z",
    "lines": [
      {
        "id": "5c977953-e0ab-4f10-98e0-bce3cf0f44a6",
        "saleId": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
        "orderLineId": "d04dd5b8-f31c-4b1f-a111-c1314437f4e1",
        "menuItemId": "a7f5dc8a-02ce-4c88-8f39-6e6ec0c4ed42",
        "menuItemNameSnapshot": "Iced Latte",
        "unitPrice": 2.5,
        "quantity": 2,
        "lineDiscountAmount": 0,
        "lineTotalAmount": 5,
        "modifierSnapshot": [],
        "createdAt": "2026-02-22T10:05:00.000Z",
        "updatedAt": "2026-02-22T10:05:00.000Z"
      }
    ]
  }
}
```

---

### 15) Get void request detail
`GET /v0/sales/:saleId/void-request`  
Action key: `sale.void.request.read`

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "6b89fb1a-b2e9-4698-a7c2-79ea5c187c81",
    "saleId": "7ac9b0cd-9f24-42bc-9ea0-9f6551eb1e7f",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "requestedByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7",
    "reviewedByAccountId": "d2453d8c-0f70-4efd-a522-23ac3d690955",
    "status": "APPROVED",
    "reason": "Wrong item prepared",
    "reviewNote": "Approved by manager",
    "requestedAt": "2026-02-22T10:12:00.000Z",
    "reviewedAt": "2026-02-22T10:13:00.000Z",
    "createdAt": "2026-02-22T10:12:00.000Z",
    "updatedAt": "2026-02-22T10:13:00.000Z"
  }
}
```

---

## Push Sync + Pull Sync Notes

- Replay-enabled target operations:
  - `sale.finalize`
  - `sale.void.execute`
- Online-only operations (replay returns `OFFLINE_SYNC_OPERATION_NOT_SUPPORTED`):
  - `order.place`
  - `order.items.add`
  - `order.checkout`
  - `order.fulfillment.status.update`
  - `sale.void.request`
  - `sale.void.approve`
  - `sale.void.reject`
- Sale/order writes append `moduleKey = saleOrder` pull deltas in same transaction.

---

## Locked Error Codes

- `SALE_NOT_FOUND`
- `SALE_ALREADY_VOIDED`
- `ORDER_REQUIRES_OPEN_CASH_SESSION`
- `SALE_CHECKOUT_REQUIRES_OPEN_CASH_SESSION`
- `SALE_FINALIZE_REQUIRES_OPEN_CASH_SESSION`
- `SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED`
- `SALE_FINALIZE_KHQR_PROOF_MISMATCH`
- `SALE_KHQR_TENDER_AMOUNT_INVALID`
- `SALE_CASH_TENDER_AMOUNT_INVALID`
- `SALE_CASH_RECEIVED_INSUFFICIENT`
- `ORDER_NOT_FOUND`
- `ORDER_NOT_UNPAID`
- `ORDER_PAY_LATER_DISABLED`
- `ORDER_CANCEL_NOT_ALLOWED`
- `ORDER_CANCEL_REASON_REQUIRED`
- `VOID_REQUEST_NOT_FOUND`
- `VOID_REQUEST_ALREADY_RESOLVED`
- `VOID_APPROVAL_REQUIRED`
- `VOID_NOT_ALLOWED_FOR_PAYMENT_METHOD`
- `VOID_NOT_ALLOWED_FOR_STATUS`
- `SALE_VOID_STATE_CONFLICT`
- standard idempotency/access-control/entitlement denials

---

## Notification Lock

- ON-01 (`void requires attention`) is emitted on `VoidRequest(status=PENDING)` creation.
- Do not emit ON-01 from `sale.status=VOID_PENDING` transition alone.

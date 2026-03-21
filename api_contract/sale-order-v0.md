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
- Push replay remains partial for sale/order writes, but offline pay-first cash replay is now implemented via `checkout.cash.finalize`, and offline outage manual-claim capture is implemented via `order.manualExternalPaymentClaim.capture`.

Frontend rollout note:
- Treat all listed `/v0/orders` + `/v0/sales` endpoints as online-ready.
- Always send `Idempotency-Key` for write endpoints.
- Do not route general sale/order flow through `pushSync` yet.
- Supported exception: offline pay-first cash replay uses push sync operation `checkout.cash.finalize`.
- Supported exception: offline outage/manual-proof claim capture uses push sync operation `order.manualExternalPaymentClaim.capture`.
- Cash quick checkout now materializes an order anchor and starts fulfillment at `PENDING`.
- Quick-pay KHQR remains payment-intent-first at initiate, but successful confirmation now materializes an order anchor and starts fulfillment at `PENDING`.
- For quick-pay KHQR, keep both `paymentIntentId` and `attempt.md5` from initiate:
  - webhook is the primary finalization path
  - if poll later shows `status = PAID_CONFIRMED` but `saleId = null`, call `POST /v0/payments/khqr/confirm` with `md5` as the cashier fallback to materialize the finalized sale/order

Offline-first clarification:
- Current backend supports offline replay for pay-first cash settlement via push sync operation `checkout.cash.finalize`.
- Current backend supports offline replay for outage/manual-proof order capture via push sync operation `order.manualExternalPaymentClaim.capture`.
- Full sale/order replay still remains partial:
  - pay-later/order-mutation writes do not support offline replay
  - general sale settlement should not be routed through push sync yet
- Offline-first direction for this module is order-first:
  - capture `OPEN` order tickets offline
  - settle/finalize payment online when connectivity returns
- KHQR remains online-only and must not be modeled as cash during outages.
- If outage/manual-proof fallback is used, it must be a separate manual external-payment-claim lane, not a reinterpretation of normal cash checkout.
- For outage static-QR / external-transfer handling, staff must capture a photo of the customer's transaction proof during downtime and submit it as claim evidence when connectivity returns.

Frontend cutover map (online lane):
- Fulfillment queue:
  - `GET /v0/orders?view=FULFILLMENT_ACTIVE`
- Pay-later management queue:
  - `GET /v0/orders?view=PAY_LATER_EDITABLE`
- Manual-claim review queue:
  - `GET /v0/orders?view=MANUAL_CLAIM_REVIEW`
- Cashier checkout:
  - `POST /v0/checkout/cash/finalize`
  - `POST /v0/checkout/khqr/initiate`
  - `GET /v0/checkout/khqr/intents/:intentId`
  - `POST /v0/payments/khqr/confirm` as manual fallback when payment is confirmed but sale materialization is still pending
  - `POST /v0/checkout/khqr/intents/:intentId/cancel`
- Fulfillment/kitchen queue:
  - `GET /v0/orders?view=FULFILLMENT_ACTIVE`
  - `PATCH /v0/orders/:orderId/fulfillment`
- Pay-later ticket lane:
  - `GET|POST /v0/orders*`
  - `PATCH /v0/orders/:orderId/fulfillment`
  - `POST /v0/orders/:orderId/cancel`
  - Requires branch policy `saleAllowPayLater = true` for place/add writes
- Manual external-payment-claim lane:
  - `POST /v0/orders` with `sourceMode = MANUAL_EXTERNAL_PAYMENT_CLAIM`
  - offline reconnect capture may materialize this order early via push sync operation `order.manualExternalPaymentClaim.capture`
  - `GET|POST /v0/orders/:orderId/manual-payment-claims`
  - `POST /v0/orders/:orderId/manual-payment-claims/:claimId/approve`
  - `POST /v0/orders/:orderId/manual-payment-claims/:claimId/reject`

## Checkout Rule (Locked)

Use this rule to avoid ambiguous behavior:

1) **Not pay-later (pay-now checkout)**
- Source: local cart
- Endpoints: `/v0/checkout/cash/finalize` or `/v0/checkout/khqr/*`
- `POST /v0/checkout/cash/finalize`:
  - backend records a **FINALIZED sale**
  - backend also records a **CHECKED_OUT order** for fulfillment continuity
- `POST /v0/checkout/khqr/*`:
  - backend still starts from payment intent lifecycle at initiate
  - webhook is the primary finalization path
  - `POST /v0/payments/khqr/confirm` remains the cashier/manual fallback
  - if `GET /v0/checkout/khqr/intents/:intentId` reaches `PAID_CONFIRMED` but `saleId` is still `null`, frontend should call the confirm endpoint with the initiate `md5`
  - after successful KHQR finalization, backend records a **FINALIZED sale**
  - backend also records a **CHECKED_OUT order** for fulfillment continuity

2) **Pay-later**
- Source: open ticket workflow
- Endpoints: `/v0/orders`, `/v0/orders/:orderId/items`, `/v0/orders/:orderId/cancel`
- Result: backend records an **OPEN order ticket** that can be updated before payment
- Sale: **not created yet**

2a) **Manual external-payment-claim order**
- Source: outage/manual proof workflow
- Endpoint: `POST /v0/orders` with `sourceMode = MANUAL_EXTERNAL_PAYMENT_CLAIM`
- Result: backend records an `OPEN` order ticket reserved for later manual claim review
- Normal `saleAllowPayLater` policy is not used for this source mode
- If the claim comes from outage static-QR / external-transfer handling, staff should capture transaction photo evidence during downtime and attach/upload it when later submitting the claim online.

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
    "id": "sale-uuid",
    "orderId": "order-uuid",
    "status": "FINALIZED",
    "saleType": "TAKEAWAY",
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
    "finalizedAt": "2026-02-23T18:00:00.000Z",
    "order": {
      "id": "order-uuid",
      "status": "CHECKED_OUT",
      "sourceMode": "DIRECT_CHECKOUT",
      "checkedOutAt": "2026-02-23T18:00:00.000Z"
    },
    "batch": {
      "id": "batch-uuid",
      "orderId": "order-uuid",
      "status": "PENDING",
      "note": null,
      "completedAt": null,
      "createdAt": "2026-02-23T18:00:00.000Z",
      "updatedAt": "2026-02-23T18:00:00.000Z"
    },
    "orderLines": [],
    "lines": [],
    "receipt": {
      "receiptId": "sale-uuid",
      "saleId": "sale-uuid",
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
- Atomic write: checked-out order + order lines + sale + sale lines + side effects (inventory/cash movement/outbox).
- `saleType` defaults to `DINE_IN` when omitted.
- For `paymentMethod = CASH`, `tenderAmount` must match grand total and `cashReceivedTenderAmount` must be `>= tenderAmount`.
- Successful cash finalize materializes `order.sourceMode = DIRECT_CHECKOUT` and creates an initial fulfillment batch with `status = PENDING`.
- The response includes that initial fulfillment batch as `data.batch`.
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
      "payloadType": "EMV_KHQR_STRING",
      "toAccountId": "bakong-account-id",
      "receiverName": "Main Branch Receiver"
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
- Frontend should keep both:
  - `intent.paymentIntentId` for polling
  - `attempt.md5` for manual confirm fallback
- Successful KHQR confirmation/finalization materializes `CHECKED_OUT order + order lines + sale + sale lines` atomically.
- Successful KHQR confirmation/finalization also creates an initial fulfillment batch with `status = PENDING`.
- The finalized sale is linked to `order.sourceMode = DIRECT_CHECKOUT`, so fulfillment can continue on `PATCH /v0/orders/:orderId/fulfillment`.

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

Rules:
- This endpoint is a payment-intent status read, not a finalize command.
- If response shows:
  - `status = FINALIZED` and `saleId != null`, sale/order materialization is complete.
  - `status = PAID_CONFIRMED` and `saleId = null`, payment proof is already confirmed but sale/order materialization is still pending.
- In the `PAID_CONFIRMED` + `saleId = null` case, frontend should call `POST /v0/payments/khqr/confirm` with the initiate `attempt.md5` as the cashier/manual fallback.
- Webhook may finalize the intent without frontend calling confirm. Polling alone must not be treated as the only finalization step.

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
type OrderSourceMode =
  | "STANDARD"
  | "MANUAL_EXTERNAL_PAYMENT_CLAIM"
  | "DIRECT_CHECKOUT";
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
    "sourceMode": "STANDARD",
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
- default `sourceMode` is `STANDARD`
- `STANDARD` source mode is denied when branch policy `saleAllowPayLater = false` (`ORDER_PAY_LATER_DISABLED`)
- `MANUAL_EXTERNAL_PAYMENT_CLAIM` is a supported outage/manual-proof workflow and is not denied by branch policy

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
    "sourceMode": "STANDARD",
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
- `STANDARD` source mode is denied when branch policy `saleAllowPayLater = false` (`ORDER_PAY_LATER_DISABLED`)
- denied when order has pending manual claim (`ORDER_MANUAL_PAYMENT_CLAIM_PENDING`)

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
- denied when order has pending manual claim (`ORDER_MANUAL_PAYMENT_CLAIM_PENDING`)

---

### 5) Create manual payment claim
`POST /v0/orders/:orderId/manual-payment-claims`  
Action key: `order.manualPaymentClaim.create`

Body example:
```json
{
  "claimedPaymentMethod": "KHQR",
  "saleType": "TAKEAWAY",
  "tenderCurrency": "USD",
  "claimedTenderAmount": 3.5,
  "proofImageUrl": "https://cdn.example.com/proof/khqr-001.jpg",
  "customerReference": "ABA-REF-001",
  "note": "Customer showed transfer screenshot"
}
```

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "id": "54a9f58a-4d3a-4fb3-8a7d-78f23254a59d",
    "tenantId": "3ec0c5e6-ab74-4106-bc01-8d8cb74f3c40",
    "branchId": "eff8aa83-a98b-43f6-8bd0-c60bd1fc4747",
    "orderId": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
    "saleId": null,
    "requestedByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7",
    "reviewedByAccountId": null,
    "status": "PENDING",
    "claimedPaymentMethod": "KHQR",
    "saleType": "TAKEAWAY",
    "tenderCurrency": "USD",
    "claimedTenderAmount": 3.5,
    "proofImageUrl": "https://cdn.example.com/proof/khqr-001.jpg",
    "customerReference": "ABA-REF-001",
    "note": "Customer showed transfer screenshot",
    "reviewNote": null,
    "requestedAt": "2026-02-22T10:06:00.000Z",
    "reviewedAt": null,
    "createdAt": "2026-02-22T10:06:00.000Z",
    "updatedAt": "2026-02-22T10:06:00.000Z"
  }
}
```

Rules:
- order must remain `OPEN`
- order must still have no sale
- order must have at least one line
- if a pending claim already exists, backend returns that pending claim instead of creating a second pending row
- `proofImageUrl` is the submitted evidence reference.
- For outage/static-QR handling, the expected reconnect flow is:
  1. capture the customer's transaction photo locally during downtime
  2. after connectivity returns, upload it via `POST /v0/media/images/upload` with `area = payment-proof`
  3. submit the returned `imageUrl` as `proofImageUrl`
- Staff handling this reconnect flow, including `CASHIER`, are allowed to upload `payment-proof` media for claim evidence.
- When `proofImageUrl` references a pending `payment-proof` upload for the same tenant, backend marks that upload as `LINKED` to the created manual claim.

---

### 6) Approve manual payment claim
`POST /v0/orders/:orderId/manual-payment-claims/:claimId/approve`  
Action key: `order.manualPaymentClaim.approve`

Body example:
```json
{
  "note": "Verified against bank evidence"
}
```

Rules:
- allowed only for `OWNER|ADMIN|MANAGER`
- approving a pending claim creates and finalizes a `KHQR` sale in one transaction
- approved manual claims emit finalized-sale side effects as non-cash payment, so cash-session `SALE_IN` must not be appended

---

### 7) Reject manual payment claim
`POST /v0/orders/:orderId/manual-payment-claims/:claimId/reject`  
Action key: `order.manualPaymentClaim.reject`

Body example:
```json
{
  "note": "Proof was not sufficient"
}
```

Rules:
- allowed only for `OWNER|ADMIN|MANAGER`
- rejection keeps the order open and unpaid

---

### 8) List manual payment claims
`GET /v0/orders/:orderId/manual-payment-claims`  
Action key: `order.manualPaymentClaim.list`

---

### 9) Update fulfillment status
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

### 10) List orders
`GET /v0/orders?status=OPEN|CHECKED_OUT|CANCELLED|ALL&sourceMode=STANDARD|DIRECT_CHECKOUT|MANUAL_EXTERNAL_PAYMENT_CLAIM|ALL&view=FULFILLMENT_ACTIVE|PAY_LATER_EDITABLE|MANUAL_CLAIM_REVIEW|ALL&limit=20&offset=0`  
Action key: `order.list`

Response example (`200`):
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "a57c4b5d-f57e-4e4c-95ab-8f1b44ec7b3f",
        "status": "OPEN",
        "sourceMode": "STANDARD",
        "openedByAccountId": "9ae622cf-49a7-491c-8d01-a009e156f6a7",
        "openedByDisplayName": "Sale Order",
        "fulfillmentStatus": "PREPARING",
        "totalUsdExact": 5,
        "linesPreview": [
          {
            "menuItemNameSnapshot": "Iced Latte",
            "quantity": 2,
            "modifierLabels": ["Less ice"]
          }
        ],
        "checkedOutAt": null,
        "paymentMethod": null,
        "manualPaymentClaimId": null,
        "manualPaymentClaimStatus": null,
        "manualPaymentClaimRequestedByAccountId": null,
        "manualPaymentClaimRequestedByDisplayName": null,
        "manualPaymentClaimRequestedAt": null,
        "createdAt": "2026-02-22T10:00:00.000Z",
        "updatedAt": "2026-02-22T10:03:00.000Z"
      }
    ],
    "limit": 20,
    "offset": 0,
    "total": 1,
    "hasMore": false
  }
}
```

Rules:
- `sourceMode` narrows the list to an exact order source mode when provided.
- `view = FULFILLMENT_ACTIVE` returns orders that still need fulfillment work:
  - includes `OPEN` and `CHECKED_OUT` orders
  - excludes `CANCELLED` orders
  - excludes orders whose latest fulfillment status is `COMPLETED` or `CANCELLED`
  - can be combined with `status` and `sourceMode` as additional narrowing filters
- `view = PAY_LATER_EDITABLE` returns the mutable unpaid pay-later queue:
  - includes only `OPEN` orders
  - includes only `sourceMode = STANDARD`
  - excludes orders whose latest manual payment claim already exists
  - can be combined with `status` and `sourceMode` as additional narrowing filters
- `view = MANUAL_CLAIM_REVIEW` returns the payment-proof review queue:
  - includes only `OPEN` orders
  - includes `sourceMode = MANUAL_EXTERNAL_PAYMENT_CLAIM`
  - also includes any open order whose latest manual payment claim exists
  - can be combined with `status` and `sourceMode` as additional narrowing filters
- `fulfillmentStatus` reflects the latest fulfillment batch status for the order.
- `fulfillmentStatus = null` when no fulfillment batch has been created yet.
- Quick-pay `DIRECT_CHECKOUT` orders start with `fulfillmentStatus = PENDING` immediately after successful cash finalize or KHQR finalization.
- `totalUsdExact` is the exact USD total computed from current order lines (`sum(lineSubtotal)`).
- `linesPreview` is a lightweight line summary for list rendering and includes readable modifier labels when present.
- `openedByAccountId` and `openedByDisplayName` identify the staff who created the order.
- `checkedOutAt` and `paymentMethod` are `null` until the order has an associated sale/checkout state.
- `manualPaymentClaimId` and `manualPaymentClaimStatus` reflect the latest manual payment claim for the order, or `null` when no claim exists.
- `manualPaymentClaimRequestedByAccountId`, `manualPaymentClaimRequestedByDisplayName`, and `manualPaymentClaimRequestedAt` reflect the latest manual payment claim requester, or `null` when no claim exists yet.
- `sourceMode = DIRECT_CHECKOUT` indicates a pay-now order anchor materialized by quick cash or quick KHQR checkout finalization.

---

### 11) Get order detail
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
    "sourceMode": "STANDARD",
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
    "fulfillmentBatches": [],
    "manualPaymentClaims": []
  }
}
```

---

## Sales

### 12) Finalize sale
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
  "data": {
    "items": [
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
    ],
    "limit": 20,
    "offset": 0,
    "total": 1,
    "hasMore": false
  }
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
  - `checkout.cash.finalize`
  - `order.manualExternalPaymentClaim.capture`
  - `sale.void.execute`
- Accepted but not yet replay-implemented:
  - `sale.finalize` (currently returns `OFFLINE_SYNC_OPERATION_NOT_SUPPORTED`; KHQR confirmation checks still run before that fallback)
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
- `ORDER_LIST_VIEW_INVALID`
- `ORDER_LIST_SOURCE_MODE_INVALID`
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
- ON-02 (`void approved`) is emitted on `VoidRequest(status=APPROVED)`.
- ON-03 (`void rejected`) is emitted on `VoidRequest(status=REJECTED)`.

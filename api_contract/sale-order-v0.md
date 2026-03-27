# Sale + Order Module (`/v0`) — API Contract

This document locks the final active `/v0` sale/order HTTP contract.

Base prefixes:
- `/v0/orders`
- `/v0/sales`
- `/v0/checkout`

## Final Scope

Final operational lane:
- pay-first checkout only
- cash quick checkout via local cart
- KHQR quick checkout via payment-intent flow
- checked-out order anchor is retained for fulfillment continuity after payment
- sale detail, receipt, and void workflow remain active

Deferred / rolled-back lane:
- open-ticket / pay-later order placement and later settlement
- manual external-payment-claim workflow
- outage/manual-proof order capture

Rollback rule:
- deferred order endpoints are hard-disabled and return `ORDER_OPEN_TICKET_DISABLED`
- direct-checkout order reads remain active for fulfillment only
- legacy internal scaffolding may remain in storage/ACL/runtime code, but it is not part of the active operational contract

## Frontend Cutover Map

Cashier checkout:
- `POST /v0/checkout/cash/finalize`
- `POST /v0/checkout/khqr/initiate`
- `GET /v0/checkout/khqr/intents/:intentId`
- `POST /v0/payments/khqr/confirm`
- `POST /v0/checkout/khqr/intents/:intentId/cancel`

Fulfillment:
- `GET /v0/orders`
- `GET /v0/orders?view=FULFILLMENT_ACTIVE`
- `GET /v0/orders/:orderId`
- `PATCH /v0/orders/:orderId/fulfillment`

Sales / void:
- `GET /v0/sales`
- `GET /v0/sales/:saleId`
- `GET /v0/sales/void-requests`
- `GET /v0/sales/:saleId/void-request`
- `POST /v0/sales/:saleId/void/request`
- `POST /v0/sales/:saleId/void/approve`
- `POST /v0/sales/:saleId/void/reject`
- `POST /v0/sales/:saleId/void/execute`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Working context:
  - `tenantId` and `branchId` come from token context only
  - no request-time context override
- Idempotency:
  - all write endpoints require `Idempotency-Key`
  - replayed responses include `Idempotency-Replayed: true`

## Types

```ts
type OrderStatus = "OPEN" | "CHECKED_OUT" | "CANCELLED";
type OrderSourceMode = "STANDARD" | "MANUAL_EXTERNAL_PAYMENT_CLAIM" | "DIRECT_CHECKOUT";
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

## Order vs Sale Boundary

- `Sale` is the financial settlement record.
- `Order` is the operational fulfillment anchor.
- In the final active scope, orders exposed by `/v0/orders` are direct-checkout fulfillment orders only.
- Those active order reads are effectively `sourceMode = DIRECT_CHECKOUT`.
- Deferred open-ticket order workflows are not part of the active contract.

## Active Checkout Contract

### 1) Cash checkout finalize

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
    "saleType": "DINE_IN",
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
      "status": "PENDING"
    },
    "orderLines": [],
    "lines": [],
    "receipt": {
      "receiptId": "sale-uuid",
      "saleId": "sale-uuid",
      "statusDisplay": "NORMAL"
    }
  }
}
```

Rules:
- server reprices from canonical menu/policy data
- successful finalize writes `sale + order + order lines + sale lines + initial fulfillment batch` atomically
- active fulfillment continuity starts from `order.sourceMode = DIRECT_CHECKOUT`
- finalized response includes `data.receipt`

### 2) KHQR checkout initiate

`POST /v0/checkout/khqr/initiate`

Action key: `checkout.khqr.initiate`

Body:

```json
{
  "items": [
    {
      "menuItemId": "uuid",
      "quantity": 1,
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
- no sale row is created at initiate
- frontend must keep:
  - `intent.paymentIntentId`
  - `attempt.md5`
- confirmation finalizes the sale and materializes a `DIRECT_CHECKOUT` order anchor for fulfillment

### 3) Read KHQR intent status

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
- this is a read endpoint, not a finalize command
- if `status = PAID_CONFIRMED` and `saleId = null`, cashier fallback is:
  - `POST /v0/payments/khqr/confirm` with the initiate `md5`

### 4) Cancel KHQR intent

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

## Active Order Read Surface

### 5) List fulfillment orders

`GET /v0/orders?status=CHECKED_OUT|ALL&sourceMode=DIRECT_CHECKOUT|ALL&view=FULFILLMENT_ACTIVE|ALL&limit=20&offset=0`

Action key: `order.list`

Response `200`:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "order-uuid",
        "status": "CHECKED_OUT",
        "sourceMode": "DIRECT_CHECKOUT",
        "openedByAccountId": "uuid",
        "openedByDisplayName": "Sale Order",
        "fulfillmentStatus": "PENDING",
        "totalUsdExact": 3.5,
        "linesPreview": [
          {
            "menuItemNameSnapshot": "Iced Latte",
            "quantity": 1,
            "modifierLabels": []
          }
        ],
        "checkedOutAt": "2026-02-22T10:05:00.000Z",
        "saleId": "sale-uuid",
        "saleStatus": "FINALIZED",
        "paymentMethod": "CASH",
        "createdAt": "2026-02-22T10:05:00.000Z",
        "updatedAt": "2026-02-22T10:05:00.000Z"
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
- active list surface is narrowed to direct-checkout orders
- if `sourceMode` is omitted, backend behaves as direct-checkout-only
- supported `view` values in the active contract:
  - omitted / `ALL`
  - `FULFILLMENT_ACTIVE`
- deprecated views `PAY_LATER_EDITABLE` and `MANUAL_CLAIM_REVIEW` return `ORDER_LIST_VIEW_INVALID`
- deprecated `sourceMode` filters `STANDARD` and `MANUAL_EXTERNAL_PAYMENT_CLAIM` return `ORDER_LIST_SOURCE_MODE_INVALID`
- dormant legacy non-direct rows are not exposed through the active order read surface

### 6) Get fulfillment order detail

`GET /v0/orders/:orderId`

Action key: `order.read`

Response `200`:

```json
{
  "success": true,
  "data": {
    "id": "order-uuid",
    "tenantId": "uuid",
    "branchId": "uuid",
    "openedByAccountId": "uuid",
    "status": "CHECKED_OUT",
    "sourceMode": "DIRECT_CHECKOUT",
    "checkedOutAt": "2026-02-22T10:05:00.000Z",
    "checkedOutByAccountId": "uuid",
    "saleId": "sale-uuid",
    "saleStatus": "FINALIZED",
    "paymentMethod": "CASH",
    "cancelledAt": null,
    "cancelledByAccountId": null,
    "cancelReason": null,
    "createdAt": "2026-02-22T10:05:00.000Z",
    "updatedAt": "2026-02-22T10:05:00.000Z",
    "lines": [],
    "fulfillmentBatches": []
  }
}
```

Rules:
- active detail surface is direct-checkout-only
- dormant legacy non-direct orders return `ORDER_NOT_FOUND`

### 7) Update fulfillment status

`PATCH /v0/orders/:orderId/fulfillment`

Action key: `order.fulfillment.status.update`

Body:

```json
{
  "status": "PREPARING",
  "note": "Started by kitchen"
}
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "id": "batch-uuid",
    "orderId": "order-uuid",
    "status": "PREPARING",
    "note": "Started by kitchen"
  }
}
```

## Disabled Deferred-Order Endpoints

These endpoints remain registered only for compatibility/error handling and are not part of the active final workflow:

- `POST /v0/orders`
- `POST /v0/orders/:orderId/items`
- `POST /v0/orders/:orderId/cancel`
- `POST /v0/orders/:orderId/checkout`
- `GET /v0/orders/:orderId/manual-payment-claims`
- `POST /v0/orders/:orderId/manual-payment-claims`
- `POST /v0/orders/:orderId/manual-payment-claims/:claimId/approve`
- `POST /v0/orders/:orderId/manual-payment-claims/:claimId/reject`

Current rollback behavior:
- backend returns `422 ORDER_OPEN_TICKET_DISABLED`

## Active Sales Surface

### 8) List sales

`GET /v0/sales?status=FINALIZED&limit=20&offset=0`

Action key: `sale.list`

### 9) Get sale detail

`GET /v0/sales/:saleId`

Action key: `sale.read`

### 10) Request void

`POST /v0/sales/:saleId/void/request`

Action key: `sale.void.request`

### 11) Approve void request

`POST /v0/sales/:saleId/void/approve`

Action key: `sale.void.approve`

### 12) Reject void request

`POST /v0/sales/:saleId/void/reject`

Action key: `sale.void.reject`

### 13) Execute void

`POST /v0/sales/:saleId/void/execute`

Action key: `sale.void.execute`

### 14) List void-request reviewer queue

`GET /v0/sales/void-requests?status=PENDING|APPROVED|REJECTED|ALL&limit=20&offset=0`

Action key: `sale.void.request.list`

Rules:
- intended reviewer discovery surface for the `Void Requests` tab
- access is reviewer-only:
  - `OWNER`
  - `ADMIN`
  - `MANAGER`
- default `status` when omitted is `PENDING`

### 15) Get void request detail

`GET /v0/sales/:saleId/void-request`

Action key: `sale.void.request.read`

## Legacy Compatibility Note

`POST /v0/sales/:saleId/finalize` remains available as a legacy compatibility endpoint for existing pending-sale records, but it is not part of the active final checkout lane.

Final active KHQR checkout lane is:
- `/v0/checkout/khqr/initiate`
- webhook or `POST /v0/payments/khqr/confirm`

## Push Sync + Pull Sync Notes

Replay-enabled sale-order operation:
- `checkout.cash.finalize`

Legacy accepted but unsupported:
- `sale.finalize`
  - returns `OFFLINE_SYNC_OPERATION_NOT_SUPPORTED`

Removed from active final scope:
- `order.manualExternalPaymentClaim.capture`

## Locked Error Codes

- `SALE_NOT_FOUND`
- `SALE_ALREADY_VOIDED`
- `ORDER_OPEN_TICKET_DISABLED`
- `SALE_CHECKOUT_REQUIRES_OPEN_CASH_SESSION`
- `SALE_FINALIZE_REQUIRES_OPEN_CASH_SESSION`
- `SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED`
- `SALE_FINALIZE_KHQR_PROOF_MISMATCH`
- `SALE_KHQR_TENDER_AMOUNT_INVALID`
- `SALE_CASH_TENDER_AMOUNT_INVALID`
- `SALE_CASH_RECEIVED_INSUFFICIENT`
- `ORDER_NOT_FOUND`
- `ORDER_LIST_VIEW_INVALID`
- `ORDER_LIST_SOURCE_MODE_INVALID`
- `VOID_REQUEST_NOT_FOUND`
- `VOID_REQUEST_ALREADY_RESOLVED`
- `VOID_REQUEST_STATUS_INVALID`
- `VOID_APPROVAL_REQUIRED`
- `VOID_NOT_ALLOWED_FOR_PAYMENT_METHOD`
- `VOID_NOT_ALLOWED_FOR_STATUS`
- `SALE_VOID_STATE_CONFLICT`

## Report-Safe Scope Summary

The final backend scope for sale/order is pay-first. Active checkout is limited to direct cash finalize and KHQR intent-based payment confirmation, with a checked-out order anchor retained only for fulfillment continuity. Deferred open-order, pay-later, and manual external-payment-claim workflows are rolled back from the active operational contract and are now hard-disabled.

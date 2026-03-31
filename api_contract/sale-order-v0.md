# Sale + Order Module (`/v0`) — API Contract

This document locks the final active `/v0` sale/order HTTP contract.

Base prefixes:
- `/v0/orders`
- `/v0/sales`
- `/v0/checkout`

## Final Scope

Final operational lane:
- pay-first remains the primary checkout model
- cash quick checkout via local cart
- KHQR quick checkout via payment-intent flow
- checked-out order anchor is retained for fulfillment continuity after payment
- sale detail, receipt, and void workflow remain active

Active exception lane:
- outage/manual external-payment-claim workflow is active again
- this is for reconnect-time proof submission and reviewer approval
- it is not generic pay-later and it is not offline KHQR gateway settlement

Deferred / rolled-back lane:
- generic `STANDARD` open-ticket / pay-later placement
- unpaid order editing via add-items / cancel / late checkout
- offline replay of manual-claim order capture

Scope rule:
- `POST /v0/orders` is active only for `sourceMode = MANUAL_EXTERNAL_PAYMENT_CLAIM`
- `GET /v0/orders` remains direct-checkout-first by default, with manual-claim review surfaced explicitly via `view=MANUAL_CLAIM_REVIEW` or `sourceMode=MANUAL_EXTERNAL_PAYMENT_CLAIM`
- generic deferred order mutations remain hard-disabled and return `ORDER_OPEN_TICKET_DISABLED`
- legacy internal scaffolding may remain in storage/ACL/runtime code, but only the direct-checkout + manual-claim exception lanes are part of the active operational contract

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

Manual external-payment-claim review:
- `POST /v0/orders` with `sourceMode = MANUAL_EXTERNAL_PAYMENT_CLAIM`
- `GET /v0/orders?view=MANUAL_CLAIM_REVIEW`
- `GET /v0/orders?sourceMode=MANUAL_EXTERNAL_PAYMENT_CLAIM`
- `GET /v0/orders/:orderId/manual-payment-claims`
- `POST /v0/orders/:orderId/manual-payment-claims`
- `POST /v0/orders/:orderId/manual-payment-claims/:claimId/approve`
- `POST /v0/orders/:orderId/manual-payment-claims/:claimId/reject`
- `POST /v0/media/images/upload` with `area = payment-proof`

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
- In the final active scope, `/v0/orders` exposes:
  - `DIRECT_CHECKOUT` fulfillment orders
  - `MANUAL_EXTERNAL_PAYMENT_CLAIM` review orders
- Generic `STANDARD` open-ticket order workflows are not part of the active contract.
- Manual external-payment-claim is a separate outage/reconnect exception lane, not a synonym for generic pay-later.

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
      "receiptNumber": "RCP-20260223-000000",
      "statusDisplay": "NORMAL"
    }
  }
}
```

Rules:
- server reprices from canonical menu/policy data
- successful finalize writes `sale + order + order lines + sale lines + initial fulfillment batch` atomically
- active fulfillment continuity starts from `order.sourceMode = DIRECT_CHECKOUT`
- finalized response includes `data.receipt`, including the human-facing `receiptNumber`

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

## Manual External-Payment-Claim Exception Lane

### 5) Create manual-claim order anchor

`POST /v0/orders`

Action key: `order.place`

Body:

```json
{
  "sourceMode": "MANUAL_EXTERNAL_PAYMENT_CLAIM",
  "items": [
    {
      "menuItemId": "uuid",
      "quantity": 1,
      "modifierSelections": [],
      "note": null
    }
  ]
}
```

Rules:
- active only for `sourceMode = MANUAL_EXTERNAL_PAYMENT_CLAIM`
- implicit/default `STANDARD` placement remains disabled and returns `ORDER_OPEN_TICKET_DISABLED`
- backend reprices from canonical menu/policy data
- order is created as `OPEN` and reserved for later claim review
- open cash session is still required for this branch-scoped cashier workflow

### 6) Create manual payment claim

`POST /v0/orders/:orderId/manual-payment-claims`

Action key: `order.manualPaymentClaim.create`

Body:

```json
{
  "claimedPaymentMethod": "KHQR",
  "saleType": "TAKEAWAY",
  "tenderCurrency": "USD",
  "claimedTenderAmount": 3.5,
  "proofImageUrl": "/images/<tenantId>/payment-proof/<filename>.png",
  "customerReference": "ABA-REF-001",
  "note": "Customer transfer screenshot"
}
```

Rules:
- active only for `MANUAL_EXTERNAL_PAYMENT_CLAIM` orders
- order must remain `OPEN` and still have no sale
- if a pending claim already exists, backend returns that pending claim instead of creating a second one
- when `proofImageUrl` references a pending `payment-proof` upload for the same tenant, backend marks it `LINKED`

### 7) Review manual payment claim

`GET /v0/orders/:orderId/manual-payment-claims`

Action key: `order.manualPaymentClaim.list`

`POST /v0/orders/:orderId/manual-payment-claims/:claimId/approve`

Action key: `order.manualPaymentClaim.approve`

`POST /v0/orders/:orderId/manual-payment-claims/:claimId/reject`

Action key: `order.manualPaymentClaim.reject`

Rules:
- approve/reject is reviewer-only: `OWNER`, `ADMIN`, `MANAGER`
- approve creates and finalizes the non-cash sale in one transaction
- approve checks out the order and links the approved claim to the finalized sale
- approve must not append cash-session `SALE_IN`
- reject keeps the order `OPEN` and reviewable

## Active Order Read Surface

### 8) List active orders

`GET /v0/orders?status=OPEN|CHECKED_OUT|ALL&sourceMode=DIRECT_CHECKOUT|MANUAL_EXTERNAL_PAYMENT_CLAIM|ALL&view=FULFILLMENT_ACTIVE|MANUAL_CLAIM_REVIEW|ALL&limit=20&offset=0`

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
        "manualPaymentClaimId": null,
        "manualPaymentClaimStatus": null,
        "manualPaymentClaimRequestedByAccountId": null,
        "manualPaymentClaimRequestedByDisplayName": null,
        "manualPaymentClaimRequestedAt": null,
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
- if `sourceMode` and `view` are both omitted, backend behaves as direct-checkout-only
- supported `view` values in the active contract:
  - omitted / `ALL`
  - `FULFILLMENT_ACTIVE`
  - `MANUAL_CLAIM_REVIEW`
- `MANUAL_CLAIM_REVIEW` returns `OPEN` outage/manual-claim orders and other open orders whose latest manual claim exists
- supported `sourceMode` filters in the active contract:
  - `DIRECT_CHECKOUT`
  - `MANUAL_EXTERNAL_PAYMENT_CLAIM`
- deprecated view `PAY_LATER_EDITABLE` returns `ORDER_LIST_VIEW_INVALID`
- deprecated `sourceMode = STANDARD` returns `ORDER_LIST_SOURCE_MODE_INVALID`
- dormant legacy `STANDARD` rows are not exposed through the active order read surface

### 9) Get active order detail

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
    "fulfillmentBatches": [],
    "manualPaymentClaims": []
  }
}
```

Rules:
- active detail surface supports `DIRECT_CHECKOUT` and `MANUAL_EXTERNAL_PAYMENT_CLAIM`
- dormant legacy `STANDARD` orders return `ORDER_NOT_FOUND`

### 10) Update fulfillment status

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

## Disabled Generic Deferred-Order Endpoints

These generic pay-later endpoints remain registered only for compatibility/error handling and are not part of the active final workflow:

- `POST /v0/orders` with implicit/default `STANDARD`
- `POST /v0/orders/:orderId/items`
- `POST /v0/orders/:orderId/cancel`
- `POST /v0/orders/:orderId/checkout`

Current behavior:
- backend returns `422 ORDER_OPEN_TICKET_DISABLED`
- the manual external-payment-claim exception lane above is not affected by this disablement

## Active Sales Surface

### 8) List sales

`GET /v0/sales?status=FINALIZED&limit=20&offset=0`

Action key: `sale.list`

### 9) Get sale detail

`GET /v0/sales/:saleId`

Action key: `sale.read`

Rules:
- finalized-sale-facing reads include `receiptNumber` as the human-facing receipt reference
- raw ids (`saleId`, `orderId`, `receiptId`) remain internal linkage fields

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
- queue rows include `receiptNumber` so reviewer UI can show a human-facing finalized-sale reference without falling back to `saleId`

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

Not replay-enabled in the current scope:
- `order.manualExternalPaymentClaim.capture`
- reconnect-submit manual-claim workflow is active through normal online HTTP, not push replay

## Locked Error Codes

- `SALE_NOT_FOUND`
- `SALE_ALREADY_VOIDED`
- `ORDER_REQUIRES_OPEN_CASH_SESSION`
- `ORDER_OPEN_TICKET_DISABLED`
- `ORDER_NOT_UNPAID`
- `ORDER_NO_ITEMS`
- `ORDER_MANUAL_PAYMENT_CLAIM_PENDING`
- `ORDER_MANUAL_PAYMENT_CLAIM_NOT_FOUND`
- `ORDER_MANUAL_PAYMENT_CLAIM_ALREADY_RESOLVED`
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

The final backend scope for sale/order is pay-first primary with one restored outage exception. Active checkout is limited to direct cash finalize and KHQR intent-based payment confirmation, with a checked-out order anchor retained for fulfillment continuity. A separate manual external-payment-claim lane is active for reconnect-time proof submission and reviewer approval, while generic pay-later/open-ticket workflow remains disabled.

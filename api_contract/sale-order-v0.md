# Sale + Order Module (`/v0`) — API Contract

This document locks the canonical contract surface for sale/order under `/v0`.

Base prefixes:
- `/v0/orders`
- `/v0/sales`

Implementation status:
- Phase 1 contract lock completed.
- Phase 3 online command/query + ACL surface is implemented on `/v0/orders` and `/v0/sales`.
- Push replay remains partial: current seam only validates KHQR finalize eligibility, then returns `OFFLINE_SYNC_OPERATION_NOT_SUPPORTED` for `sale.finalize` replay.

Frontend rollout note:
- Treat all listed `/v0/orders` + `/v0/sales` endpoints as online-ready.
- Always send `Idempotency-Key` for write endpoints.
- Do not route sale finalize through `pushSync` yet; replay parity for sale/order writes is still partial.

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - `tenantId` + `branchId` are from working-context token only.
  - no context override in query/body/headers.
- Idempotency:
  - all write endpoints require `Idempotency-Key`.
  - replay returns stored response with `Idempotency-Replayed: true`.

## Types

```ts
type OrderStatus = "OPEN" | "CHECKED_OUT" | "CANCELLED";
type SaleStatus = "PENDING" | "FINALIZED" | "VOID_PENDING" | "VOIDED";
type VoidRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

type OrderTicket = {
  id: string;
  tenantId: string;
  branchId: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
};

type Sale = {
  id: string;
  tenantId: string;
  branchId: string;
  orderId: string | null;
  status: SaleStatus;
  paymentMethod: "CASH" | "KHQR";
  tenderCurrency: "USD" | "KHR";
  tenderAmount: number;
  cashReceivedTenderAmount: number | null;
  cashChangeTenderAmount: number;
  subtotalUsd: number;
  subtotalKhr: number;
  discountUsd: number;
  discountKhr: number;
  vatUsd: number;
  vatKhr: number;
  grandTotalUsd: number;
  grandTotalKhr: number;
  saleFxRateKhrPerUsd: number;
  saleKhrRoundingEnabled: boolean;
  saleKhrRoundingMode: "NEAREST" | "UP" | "DOWN";
  saleKhrRoundingGranularity: "100" | "1000";
  khqrMd5: string | null;
  khqrHash: string | null;
  khqrToAccountId: string | null;
  khqrConfirmedAt: string | null;
  finalizedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type VoidRequest = {
  id: string;
  saleId: string;
  tenantId: string;
  branchId: string;
  requestedByAccountId: string;
  reviewedByAccountId: string | null;
  status: VoidRequestStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
};
```

## Endpoint Groups

### Orders

#### 1) Place order ticket
`POST /v0/orders`  
Action key: `order.place`

#### 2) Add items to open order
`POST /v0/orders/:orderId/items`  
Action key: `order.items.add`

#### 3) Checkout order
`POST /v0/orders/:orderId/checkout`  
Action key: `order.checkout`

Rules:
- requires open cash session (`SALE_CHECKOUT_REQUIRES_OPEN_CASH_SESSION`)

#### 4) Update fulfillment status
`PATCH /v0/orders/:orderId/fulfillment`  
Action key: `order.fulfillment.status.update`

#### 5) List orders
`GET /v0/orders`  
Action key: `order.list`

#### 6) Get order detail
`GET /v0/orders/:orderId`  
Action key: `order.read`

### Sales

#### 7) Finalize sale
`POST /v0/sales/:saleId/finalize`  
Action key: `sale.finalize`

Rules:
- requires open cash session (`SALE_FINALIZE_REQUIRES_OPEN_CASH_SESSION`)
- KHQR requires backend-confirmed proof:
  - `SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED`
  - `SALE_FINALIZE_KHQR_PROOF_MISMATCH`
- KHQR generation should use `POST /v0/payments/khqr/sales/:saleId/generate` before waiting for payment confirmation.

#### 8) Request void (team mode)
`POST /v0/sales/:saleId/void/request`  
Action key: `sale.void.request`

#### 9) Approve void request (team mode)
`POST /v0/sales/:saleId/void/approve`  
Action key: `sale.void.approve`

#### 10) Reject void request (team mode)
`POST /v0/sales/:saleId/void/reject`  
Action key: `sale.void.reject`

#### 11) Execute void
`POST /v0/sales/:saleId/void/execute`  
Action key: `sale.void.execute`

Rules:
- workforce OFF: direct execute path (no second-actor approval required)
- workforce ON: requires approved void request (`VOID_APPROVAL_REQUIRED`)

#### 12) List sales
`GET /v0/sales`  
Action key: `sale.list`

#### 13) Get sale detail
`GET /v0/sales/:saleId`  
Action key: `sale.read`

#### 14) Get void request detail
`GET /v0/sales/:saleId/void-request`  
Action key: `sale.void.request.read`

## Push Sync + Pull Sync Notes

- Replay-enabled target operations:
  - `sale.finalize`
  - `sale.void.execute`
- Online-only operations (replay should return `OFFLINE_SYNC_OPERATION_NOT_SUPPORTED`):
  - `order.place`
  - `order.items.add`
  - `order.checkout`
  - `order.fulfillment.status.update`
  - `sale.void.request`
  - `sale.void.approve`
  - `sale.void.reject`
- Sale/order writes must append `moduleKey = saleOrder` pull deltas in the same transaction.

## Locked Error Codes

- `SALE_NOT_FOUND`
- `SALE_ALREADY_VOIDED`
- `SALE_CHECKOUT_REQUIRES_OPEN_CASH_SESSION`
- `SALE_FINALIZE_REQUIRES_OPEN_CASH_SESSION`
- `SALE_FINALIZE_KHQR_CONFIRMATION_REQUIRED`
- `SALE_FINALIZE_KHQR_PROOF_MISMATCH`
- `SALE_KHQR_TENDER_AMOUNT_INVALID`
- `ORDER_NOT_FOUND`
- `ORDER_NOT_UNPAID`
- `VOID_REQUEST_NOT_FOUND`
- `VOID_REQUEST_ALREADY_RESOLVED`
- `VOID_APPROVAL_REQUIRED`
- `VOID_NOT_ALLOWED_FOR_PAYMENT_METHOD`
- standard idempotency/access-control/entitlement denials

## Notification Lock

- ON-01 ("void requires attention") is emitted on `VoidRequest(status=PENDING)` creation.
- Do not emit ON-01 from `sale.status=VOID_PENDING` transition alone.

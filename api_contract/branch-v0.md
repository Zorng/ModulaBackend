# Branch Module (`/v0`) — API Contract

This document describes the current branch contract for `/v0`, including:
- branch profile/visibility reads
- branch activation orchestration endpoints

Base path: `/v0/org`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - Endpoints use token context.
  - No `tenantId` / `branchId` override accepted.
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`

## Types

```ts
type BranchStatus = "ACTIVE" | "FROZEN";

type BranchProfile = {
  branchId: string;
  tenantId: string;
  branchName: string;
  branchAddress: string | null;
  contactNumber: string | null;
  status: BranchStatus;
};
```

## Endpoints

Implementation scope note:
- Current activation flow supports repeated branch activations.
- Each activation is payment-gated and creates one branch.
- A tenant can only have one `PENDING_PAYMENT` activation draft at a time.

### 1) List accessible branches in current tenant

`GET /v0/org/branches/accessible`

Notes:
- Visibility is assignment-scoped.
- Returns only branches where user has active assignment in current tenant.
- Branches may be `ACTIVE` or `FROZEN`.

Success `200`:

```json
{
  "success": true,
  "data": [
    {
      "branchId": "uuid",
      "tenantId": "uuid",
      "branchName": "Olympic",
      "branchAddress": "Street 2004",
      "contactNumber": "+85512000009",
      "status": "ACTIVE"
    }
  ]
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `NO_MEMBERSHIP` (from centralized access control)
- `403` `ACCESS_CONTROL_ROUTE_NOT_REGISTERED` if route is not registered (fail-closed)

### 2) Get current branch profile

`GET /v0/org/branch/current`

Notes:
- Requires branch context in token.
- Reads branch profile even when branch is `FROZEN`.

Success `200`:

```json
{
  "success": true,
  "data": {
    "branchId": "uuid",
    "tenantId": "uuid",
    "branchName": "Olympic",
    "branchAddress": "Street 2004",
    "contactNumber": "+85512000009",
    "status": "FROZEN"
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `NO_MEMBERSHIP` (from centralized access control)
- `403` `BRANCH_CONTEXT_REQUIRED` or `NO_BRANCH_ACCESS`
- `404` branch not found

### 3) Initiate branch activation draft (payment pending)

`POST /v0/org/branches/activation/initiate`

Auth: `Authorization: Bearer <accessToken>`

Idempotency (optional but recommended):
- Request header: `Idempotency-Key: <string>`
- Replay response header: `Idempotency-Replayed: true`

Body:

```json
{
  "branchName": "Main Branch"
}
```

Success `201` (new draft+invoice created):

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "tenantId": "uuid",
    "branchName": "Main Branch",
    "activationType": "FIRST_BRANCH",
    "draftStatus": "PENDING_PAYMENT",
    "invoice": {
      "invoiceId": "uuid",
      "invoiceType": "FIRST_BRANCH_ACTIVATION",
      "status": "ISSUED",
      "currency": "USD",
      "totalAmountUsd": "5.00",
      "issuedAt": "2026-02-17T10:00:00.000Z",
      "paidAt": null
    },
    "created": true
  }
}
```

Success `200` (existing pending draft reused):

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "tenantId": "uuid",
    "branchName": "Main Branch",
    "activationType": "FIRST_BRANCH",
    "draftStatus": "PENDING_PAYMENT",
    "invoice": {
      "invoiceId": "uuid",
      "invoiceType": "FIRST_BRANCH_ACTIVATION",
      "status": "ISSUED",
      "currency": "USD",
      "totalAmountUsd": "5.00",
      "issuedAt": "2026-02-17T10:00:00.000Z",
      "paidAt": null
    },
    "created": false
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` tenant context missing or role not allowed
- `403` subscription upgrade blocked while tenant is `PAST_DUE` (`code = SUBSCRIPTION_UPGRADE_REQUIRED`)
- `409` branch fair-use hard limit reached (`code = FAIRUSE_HARD_LIMIT_EXCEEDED`)
- `409` idempotency conflict (`code = IDEMPOTENCY_CONFLICT`) when same key is reused with a different payload
- `409` idempotency in-progress (`code = IDEMPOTENCY_IN_PROGRESS`) if the same key is still processing
- `429` branch activation rate-limited (`code = FAIRUSE_RATE_LIMITED`)
- `422` missing `branchName`

### 4) Confirm branch activation (payment-confirmed path)

`POST /v0/org/branches/activation/confirm`

Auth: `Authorization: Bearer <accessToken>`

Body:

```json
{
  "draftId": "uuid",
  "paymentToken": "PAID"
}
```

Success `201` (new activation):

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "branchId": "uuid",
    "tenantId": "uuid",
    "branchName": "Main Branch",
    "activationType": "FIRST_BRANCH",
    "status": "ACTIVE",
    "invoiceId": "uuid",
    "paymentConfirmationRef": "stub:...",
    "created": true
  }
}
```

Notes:
- On successful activation, requester is auto-assigned to the created branch (active branch assignment).
- `activationType` indicates whether the draft/activation is `FIRST_BRANCH` or `ADDITIONAL_BRANCH`.

Success `200` (already activated for same draft):

```json
{
  "success": true,
  "data": {
    "draftId": "uuid",
    "branchId": "uuid",
    "tenantId": "uuid",
    "branchName": "Main Branch",
    "activationType": "FIRST_BRANCH",
    "status": "ACTIVE",
    "invoiceId": "uuid",
    "paymentConfirmationRef": "stub:...",
    "created": false
  }
}
```

Errors:
- `401` missing/invalid access token
- `403` tenant context missing or role not allowed
- `403` subscription upgrade blocked while tenant is `PAST_DUE` (`code = SUBSCRIPTION_UPGRADE_REQUIRED`)
- `402` payment required/not confirmed (`code = BRANCH_ACTIVATION_PAYMENT_REQUIRED`)
- `409` draft/invoice not payable (`code = DRAFT_NOT_PENDING_PAYMENT` or `INVOICE_NOT_PAYABLE`)
- `409` idempotency conflict (`code = IDEMPOTENCY_CONFLICT`) when same key is reused with a different payload
- `409` idempotency in-progress (`code = IDEMPOTENCY_IN_PROGRESS`) if the same key is still processing
- `404` activation draft not found (`code = DRAFT_NOT_FOUND`)
- `422` missing `draftId` or `paymentToken`

## Planned Extension (Not Implemented Yet)

Target behavior for branch-as-billable-workspace refinement is tracked in:
- `_refactor-artifact/03-orgaccount/branch-billable-workspaces-rollout-v0.md`

Candidate future additions:
- explicit branch list management endpoint (`GET /v0/org/branches`)
- richer subscription denial family for advanced billing states beyond current baseline

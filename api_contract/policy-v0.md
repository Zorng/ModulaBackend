# Policy Module (`/v0`) — API Contract

This document locks the target `/v0/policy` HTTP contract for branch-scoped policy resolution and updates.

Base path: `/v0/policy`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - Policy is branch-scoped.
  - `tenantId` and `branchId` come from token working context.
  - No `tenantId` / `branchId` overrides via query/body.
- Idempotency:
  - policy updates require `Idempotency-Key`.
  - duplicate replay with same payload returns stored response and header `Idempotency-Replayed: true`.
- Access-control reason codes:
  - see `api_contract/access-control-v0.md`

## Types

```ts
type SaleKhrRoundingMode = "NEAREST" | "UP" | "DOWN";
type SaleKhrRoundingGranularity = "100" | "1000";

type BranchPolicy = {
  tenantId: string;
  branchId: string;
  saleVatEnabled: boolean;
  saleVatRatePercent: number; // 0..100
  saleFxRateKhrPerUsd: number; // > 0
  saleKhrRoundingEnabled: boolean;
  saleKhrRoundingMode: SaleKhrRoundingMode;
  saleKhrRoundingGranularity: SaleKhrRoundingGranularity;
  saleAllowPayLater: boolean;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
};

type UpdateBranchPolicyInput = Partial<
  Pick<
    BranchPolicy,
    | "saleVatEnabled"
    | "saleVatRatePercent"
    | "saleFxRateKhrPerUsd"
    | "saleKhrRoundingEnabled"
    | "saleKhrRoundingMode"
    | "saleKhrRoundingGranularity"
    | "saleAllowPayLater"
  >
>;
```

## Endpoints

### 1) Get current-branch policy

`GET /v0/policy/current-branch`

Action key: `policy.currentBranch.read`

Success `200`:

```json
{
  "success": true,
  "data": {
    "tenantId": "uuid",
    "branchId": "uuid",
    "saleVatEnabled": true,
    "saleVatRatePercent": 10,
    "saleFxRateKhrPerUsd": 4100,
    "saleKhrRoundingEnabled": true,
    "saleKhrRoundingMode": "NEAREST",
    "saleKhrRoundingGranularity": "100",
    "saleAllowPayLater": true,
    "createdAt": "2026-02-17T10:00:00.000Z",
    "updatedAt": "2026-02-17T10:00:00.000Z"
  }
}
```

Behavior notes:
- If no persisted row exists for the selected branch, backend resolves defaults and returns canonical policy values.

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `BRANCH_CONTEXT_REQUIRED`
- `403` `NO_MEMBERSHIP` or `NO_BRANCH_ACCESS`
- `404` `BRANCH_NOT_FOUND`

### 2) Update current-branch policy (partial)

`PATCH /v0/policy/current-branch`

Action key: `policy.currentBranch.update`

Headers:
- `Idempotency-Key: <client generated key>`

Body (all fields optional, but at least one must be provided):

```json
{
  "saleVatEnabled": true,
  "saleVatRatePercent": 10,
  "saleFxRateKhrPerUsd": 4100,
  "saleKhrRoundingEnabled": true,
  "saleKhrRoundingMode": "NEAREST",
  "saleKhrRoundingGranularity": "100",
  "saleAllowPayLater": false
}
```

Success `200`:

```json
{
  "success": true,
  "data": {
    "tenantId": "uuid",
    "branchId": "uuid",
    "saleVatEnabled": true,
    "saleVatRatePercent": 10,
    "saleFxRateKhrPerUsd": 4100,
    "saleKhrRoundingEnabled": true,
    "saleKhrRoundingMode": "NEAREST",
    "saleKhrRoundingGranularity": "100",
    "saleAllowPayLater": false,
    "createdAt": "2026-02-17T10:00:00.000Z",
    "updatedAt": "2026-02-17T10:05:00.000Z"
  }
}
```

Validation:
- `saleVatRatePercent` must be in `0..100`
- `saleFxRateKhrPerUsd` must be `> 0`
- `saleKhrRoundingMode` must be `NEAREST | UP | DOWN`
- `saleKhrRoundingGranularity` must be `100 | 1000`
- empty patch is rejected

Errors:
- `401` missing/invalid access token
- `403` `TENANT_CONTEXT_REQUIRED` or `BRANCH_CONTEXT_REQUIRED`
- `403` `NO_MEMBERSHIP` or `NO_BRANCH_ACCESS`
- `403` `PERMISSION_DENIED`
- `403` `BRANCH_FROZEN` (writes blocked on frozen branch)
- `403` `SUBSCRIPTION_FROZEN` (tenant frozen for writes)
- `404` `BRANCH_NOT_FOUND`
- `422` `IDEMPOTENCY_KEY_REQUIRED`
- `409` `IDEMPOTENCY_CONFLICT`
- `409` `IDEMPOTENCY_IN_PROGRESS`
- `422` `POLICY_PATCH_EMPTY`
- `422` `POLICY_VALIDATION_FAILED`

## Notes

- This contract intentionally excludes removed legacy policy keys (attendance/cash/inventory toggles) per patched KB scope.
- Policy updates are branch-scoped and auditable; historical sale/receipt/reporting values remain snapshot-based and must not be rewritten by later policy edits.

## Frontend Rollout Notes

- Use `GET /v0/policy/current-branch` after login and after every branch context switch.
- For updates, always send `Idempotency-Key` and treat `Idempotency-Replayed: true` as a successful replay (do not show duplicate-error UI).
- On successful `PATCH`, replace local policy cache with response `data` (source of truth), then re-evaluate pricing/checkout UI toggles.

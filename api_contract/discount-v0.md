# Discount Module (`/v0`) — API Contract

This document describes the current `/v0/discount` HTTP contract.

Base path: `/v0/discount`

Implementation status:
- Implemented now:
  - `GET /v0/discount/rules`
  - `GET /v0/discount/rules/:ruleId`
  - `POST /v0/discount/rules`
  - `PATCH /v0/discount/rules/:ruleId`
  - `POST /v0/discount/rules/:ruleId/activate`
  - `POST /v0/discount/rules/:ruleId/deactivate`
  - `POST /v0/discount/rules/:ruleId/archive`
  - `POST /v0/discount/preflight/eligible-items`
  - `POST /v0/discount/eligibility/resolve`

## Conventions

- JSON casing: `camelCase`
- Envelope:
  - success: `{ "success": true, "data": ... }`
  - failure: `{ "success": false, "error": "...", "code": "...", "details"?: {...} }`
- Auth: `Authorization: Bearer <accessToken>`
- Context model:
  - Discount management uses tenant working context.
  - Branch-targeted operations accept explicit `branchId` in query/body.
  - no tenant/branch override via headers.
- Idempotency:
  - all write endpoints require `Idempotency-Key`.
  - duplicate replay returns stored response with `Idempotency-Replayed: true`.

## Types

```ts
type DiscountRuleStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
type DiscountScope = "ITEM" | "BRANCH_WIDE";

type DiscountSchedule = {
  startAt: string | null; // ISO datetime
  endAt: string | null; // ISO datetime
};

type DiscountRule = {
  id: string;
  tenantId: string;
  branchId: string; // branch-owned rule
  name: string;
  percentage: number; // > 0 and <= 100
  scope: DiscountScope;
  status: DiscountRuleStatus;
  itemIds: string[]; // empty for BRANCH_WIDE
  schedule: DiscountSchedule;
  stackingPolicy: "MULTIPLICATIVE";
  createdAt: string;
  updatedAt: string;
};

type DiscountEligibilityRule = {
  ruleId: string;
  percentage: number;
  scope: DiscountScope;
  itemIds: string[];
  stackingPolicy: "MULTIPLICATIVE";
};
```

## Endpoints

### 1) List rules

`GET /v0/discount/rules?status=active|inactive|archived|all&scope=item|branch_wide|all&branchId=uuid&search=text&limit=50&offset=0`

Action key: `discount.rules.list`

Notes:
- Read-only for all tenant roles (`OWNER`, `ADMIN`, `MANAGER`, `CASHIER`).
- `branchId` filters by rule owner branch.
- If `branchId` is supplied, it must belong to an active branch in the current tenant.

### 2) Get rule detail

`GET /v0/discount/rules/:ruleId`

Action key: `discount.rules.read`

Errors:
- `404` `DISCOUNT_RULE_NOT_FOUND`

### 3) Create rule

`POST /v0/discount/rules`

Action key: `discount.rules.create`

Headers:
- `Idempotency-Key: <client key>`

Body:
```json
{
  "name": "Coffee 10%",
  "percentage": 10,
  "scope": "ITEM",
  "branchId": "uuid-branch",
  "itemIds": ["uuid-item-1", "uuid-item-2"],
  "schedule": {
    "startAt": "2026-02-20T02:00:00.000Z",
    "endAt": "2026-02-21T11:00:00.000Z"
  },
  "confirmOverlap": false
}
```

Rules:
- Rule is always created as `INACTIVE`.
- Rule is branch-owned: `branchId` required.
- `scope=ITEM` requires non-empty `itemIds`.
- If overlap with existing `ACTIVE` rules is detected, backend returns warning code until `confirmOverlap=true`.

### 4) Update rule

`PATCH /v0/discount/rules/:ruleId`

Action key: `discount.rules.update`

Headers:
- `Idempotency-Key: <client key>`

Body: partial create fields plus optional `confirmOverlap`.

Rules:
- `branchId` is immutable (cannot move rule across branches).
- Update denied when rule is currently eligible:
  - `DISCOUNT_RULE_UPDATE_REQUIRES_EFFECTIVE_INACTIVE`
- Overlap warning behavior is same as create.

### 5) Activate rule

`POST /v0/discount/rules/:ruleId/activate`

Action key: `discount.rules.activate`

Headers:
- `Idempotency-Key: <client key>`

### 6) Deactivate rule

`POST /v0/discount/rules/:ruleId/deactivate`

Action key: `discount.rules.deactivate`

Headers:
- `Idempotency-Key: <client key>`

### 7) Archive rule

`POST /v0/discount/rules/:ruleId/archive`

Action key: `discount.rules.archive`

Headers:
- `Idempotency-Key: <client key>`

### 8) Preflight eligible items for branch

`POST /v0/discount/preflight/eligible-items`

Action key: `discount.rules.preflight.eligibleItems`

Body:
```json
{
  "branchId": "uuid-branch",
  "itemIds": ["uuid-item-1", "uuid-item-2"]
}
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "branchId": "uuid-branch",
    "eligibleItemIds": ["uuid-item-1"],
    "invalidItemIds": ["uuid-item-2"],
    "allEligible": false
  }
}
```

### 9) Resolve eligible rules for sale context

`POST /v0/discount/eligibility/resolve`

Action key: `discount.eligibility.resolve`

Body:
```json
{
  "branchId": "uuid-branch",
  "occurredAt": "2026-02-20T03:00:00.000Z",
  "lines": [
    { "menuItemId": "uuid-item-1", "quantity": 2 },
    { "menuItemId": "uuid-item-2", "quantity": 1 }
  ]
}
```

Notes:
- Requires tenant context.
- `branchId` is required and identifies which branch’s active discount rules are resolved.

Response `200`:
```json
{
  "success": true,
  "data": {
    "rules": [
      {
        "ruleId": "uuid",
        "percentage": 10,
        "scope": "ITEM",
        "itemIds": ["uuid-item-1"],
        "stackingPolicy": "MULTIPLICATIVE"
      }
    ]
  }
}
```

Important:
- Requires tenant context token.
- `branchId` selects which branch’s active rules are evaluated.
- Returns metadata only (no discounted totals).

## Error Codes

- `IDEMPOTENCY_KEY_REQUIRED`
- `IDEMPOTENCY_CONFLICT`
- `IDEMPOTENCY_IN_PROGRESS`
- `DISCOUNT_RULE_NOT_FOUND`
- `DISCOUNT_RULE_INVALID`
- `DISCOUNT_SCOPE_INVALID`
- `DISCOUNT_PERCENTAGE_OUT_OF_RANGE`
- `DISCOUNT_ITEM_ASSIGNMENT_REQUIRED`
- `DISCOUNT_RULE_OVERLAP_WARNING` (`details.conflictingRuleIds`)
- `DISCOUNT_RULE_UPDATE_REQUIRES_EFFECTIVE_INACTIVE`
- plus standard access-control denials from `api_contract/access-control-v0.md`

## Frontend Notes

- Recommended create/update flow:
  1. choose `branchId`
  2. choose `itemIds` (if scope is ITEM)
  3. call `/preflight/eligible-items`
  4. block submit when `invalidItemIds` is non-empty
  5. submit write with `Idempotency-Key`
- If create/update returns `DISCOUNT_RULE_OVERLAP_WARNING`, show conflict review and resend with `confirmOverlap=true` if user confirms.
- Final money math belongs to Sale/Finalize, not Discount.

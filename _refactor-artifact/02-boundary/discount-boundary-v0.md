# Discount Module Boundary (v0)

Status: Locked (KB patch aligned 2026-02-18)  
Owner context: `POSOperation`  
Canonical route prefix: `/v0/discount`

## 1) Module Identity

- Module name: `discount`
- Primary references:
  - `knowledge_base/BusinessLogic/2_domain/40_POSOperation/discount_domain.md`
  - `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/discount_module_patched.md`
  - `knowledge_base/BusinessLogic/3_contract/10_edgecases/discount_edge_case_sweep.md`

## 2) Owned Facts

- Owned tables:
  - `v0_discount_rules`
  - `v0_discount_rule_items`
- Rule ownership:
  - rule is branch-owned (`branch_id` required)
  - branch is immutable after create
- Invariants:
  - percentage only in v0
  - status `ACTIVE | INACTIVE | ARCHIVED`
  - scope `ITEM | BRANCH_WIDE`
  - create defaults to `INACTIVE`
  - eligibility window uses `[startAt, endAt)` semantics
  - update allowed only for effectively-inactive rule
  - overlap runtime behavior: allowed (multiplicative stacking)
  - overlap config behavior: warn-only + explicit confirm

## 3) Consumed Facts

- Menu: item visibility/activeness in branch for item-level target validation.
- OrgAccount: branch existence/status.
- AccessControl: role/scope enforcement.
- Sale (consumer): consumes eligibility metadata only.

## 4) Commands (Write)

- `POST /v0/discount/rules` -> `discount.rules.create`
- `PATCH /v0/discount/rules/:ruleId` -> `discount.rules.update`
- `POST /v0/discount/rules/:ruleId/activate` -> `discount.rules.activate`
- `POST /v0/discount/rules/:ruleId/deactivate` -> `discount.rules.deactivate`
- `POST /v0/discount/rules/:ruleId/archive` -> `discount.rules.archive`

Write transaction contract:
- business writes
- audit write
- outbox write

## 5) Queries (Read)

- `GET /v0/discount/rules` -> `discount.rules.list`
- `GET /v0/discount/rules/:ruleId` -> `discount.rules.read`
- `POST /v0/discount/preflight/eligible-items` -> `discount.rules.preflight.eligibleItems`
- `POST /v0/discount/eligibility/resolve` -> `discount.eligibility.resolve`

## 6) Event Contract

Produced:
- `DISCOUNT_RULE_CREATED`
- `DISCOUNT_RULE_UPDATED`
- `DISCOUNT_RULE_ACTIVATED`
- `DISCOUNT_RULE_DEACTIVATED`
- `DISCOUNT_RULE_ARCHIVED`

## 7) Failure/Warning Codes

- `DISCOUNT_RULE_INVALID`
- `DISCOUNT_SCOPE_INVALID`
- `DISCOUNT_PERCENTAGE_OUT_OF_RANGE`
- `DISCOUNT_ITEM_ASSIGNMENT_REQUIRED`
- `DISCOUNT_RULE_UPDATE_REQUIRES_EFFECTIVE_INACTIVE`
- `DISCOUNT_RULE_OVERLAP_WARNING`
- standard idempotency/access-control codes

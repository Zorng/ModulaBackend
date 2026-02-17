# Policy Module Boundary (v0)

Status: Phase 1-5 locked  
Owner context: `PlatformSystems` (product capability)  
Canonical route prefix: `/v0/policy`

## 1) Module Identity

- Module name: `policy`
- Primary KB references:
  - domain: `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/policy_domain.md`
  - process:
    - `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/10_update_branch_policy_process.md`
    - `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/20_resolve_branch_policy_process.md`
  - modSpec: `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/policy_module.md`
  - edge cases: `knowledge_base/BusinessLogic/3_contract/10_edgecases/policy_edge_case_sweep.md`

## 2) Owned Facts (Source of Truth)

- Owned table/projection (planned):
  - `v0_branch_policies` (single canonical row per `(tenant_id, branch_id)`)
- Invariants:
  - policy is branch-scoped
  - only allowed keys are:
    - `saleVatEnabled`
    - `saleVatRatePercent`
    - `saleFxRateKhrPerUsd`
    - `saleKhrRoundingEnabled`
    - `saleKhrRoundingMode`
    - `saleKhrRoundingGranularity`
    - `saleAllowPayLater`
  - VAT range: `0..100`
  - FX rate: `> 0`
  - rounding mode: `NEAREST | UP | DOWN`
  - rounding granularity: `100 | 1000`
- Status/state machine:
  - no lifecycle status; immutable history via audit events + updated snapshot row

## 3) Consumed Facts (Read Dependencies)

- AccessControl:
  - consumed fact: membership/role/branch assignment gates
  - why: enforce branch-scoped read/write authorization
  - consistency mode: strong (same request path)
- OrgAccount:
  - consumed fact: branch status (`ACTIVE` vs `FROZEN`)
  - why: deny policy writes on frozen branches
  - consistency mode: strong (via centralized access control)
- Auth context:
  - consumed fact: `tenant_id` + `branch_id` from token
  - why: no tenant/branch override inputs allowed
  - consistency mode: strong

## 4) Commands (Write Surface)

- Endpoint: `PATCH /v0/policy/current-branch`
- Action key: `policy.currentBranch.update`
- Required scope/effect: `BRANCH` / `WRITE`
- Allowed roles: `OWNER`, `ADMIN`
- Idempotency required: yes (`Idempotency-Key`)
- Transaction boundary:
  - business writes: policy row upsert/update
  - audit write: `POLICY_UPDATED`
  - outbox write: `POLICY_UPDATED`
- Failure reason codes:
  - `TENANT_CONTEXT_REQUIRED`
  - `BRANCH_CONTEXT_REQUIRED`
  - `NO_MEMBERSHIP`
  - `NO_BRANCH_ACCESS`
  - `PERMISSION_DENIED`
  - `BRANCH_FROZEN`
  - `SUBSCRIPTION_FROZEN`
  - `IDEMPOTENCY_KEY_REQUIRED`
  - `IDEMPOTENCY_CONFLICT`
  - `IDEMPOTENCY_IN_PROGRESS`
  - `POLICY_VALIDATION_FAILED`
  - `POLICY_PATCH_EMPTY`
  - `BRANCH_NOT_FOUND`

## 5) Queries (Read Surface)

- Endpoint: `GET /v0/policy/current-branch`
- Action key: `policy.currentBranch.read`
- Scope: `BRANCH` / `READ`
- Filters/pagination: none (single policy object for selected branch)
- Denial reason codes:
  - `TENANT_CONTEXT_REQUIRED`
  - `BRANCH_CONTEXT_REQUIRED`
  - `NO_MEMBERSHIP`
  - `NO_BRANCH_ACCESS`
  - `BRANCH_NOT_FOUND`

## 6) Event Contract

### Produced events

- `POLICY_UPDATED`
  - Triggering action key: `policy.currentBranch.update`
  - Entity type: `branch_policy`
  - Minimal payload:
    - `tenantId`
    - `branchId`
    - `updatedFields[]`
    - `oldValues` (changed fields only)
    - `newValues` (changed fields only)
- `POLICY_RESET_TO_DEFAULT` (reserved; no command endpoint in Phase 1)

### Subscribed events

- `ORG_BRANCH_FIRST_ACTIVATED` (optional initializer)
  - Handler purpose: pre-seed default branch policy row
  - Idempotency strategy: dedupe by `(tenant_id, branch_id, event_type)`

## 7) Access Control Mapping

- Route registry entries (target):
  - `GET /policy/current-branch` -> `policy.currentBranch.read`
  - `PATCH /policy/current-branch` -> `policy.currentBranch.update`
- Action catalog entries (target):
  - `policy.currentBranch.read` (`BRANCH`, `READ`)
  - `policy.currentBranch.update` (`BRANCH`, `WRITE`, `allowedRoles: OWNER|ADMIN`)
- Entitlement bindings:
  - none (core configuration surface)
- Subscription/branch-status gates:
  - reads allowed on frozen branch
  - writes denied on frozen branch (`BRANCH_FROZEN`)

## 8) API Contract Docs

- Canonical contract file: `api_contract/policy-v0.md`
- Compatibility alias docs: none
- OpenAPI: `N/A` (markdown contract policy)

## 9) Test Plan (Required)

### Unit tests (module-local)
- path: `src/modules/v0/policy/tests/unit/*`
- cover:
  - patch validation rules
  - unchanged-field merge behavior
  - reason-code mapping

### Integration tests
- path: `src/integration-tests/v0-policy*.int.test.ts`
- cover:
  - read current branch policy
  - update policy happy path
  - update denied on frozen branch
  - role denial for manager/cashier updates
  - idempotency replay/conflict
  - atomic rollback (`policy + audit + outbox`)

## 10) Boundary Guard Checklist

- [x] No cross-module table writes in repositories (planned boundary)
- [x] Route prefix matches module owner
- [x] Action key prefix matches module owner
- [x] Outbox event type ownership defined
- [x] Canonical behavior documented
- [x] Test requirements listed

## 11) Rollout Notes

- Compatibility aliases to remove later: none
- Migration/backfill needed:
  - migrate old policy keys into `v0_branch_policies` schema only
  - do not carry removed policy keys (attendance/cash/inventory toggles)
- Frontend consumption notes:
  - refresh policy cache on login, branch switch, and successful update response

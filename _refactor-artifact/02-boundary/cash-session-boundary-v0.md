# Cash Session Module Boundary (v0)

Status: Phase 1 locked  
Owner context: `POSOperation`  
Canonical route prefix: `/v0/cash`

## 1) Module Identity

- Module name: `cashSession`
- Primary KB references:
  - domain: `knowledge_base/BusinessLogic/2_domain/40_POSOperation/cashSession_domain.md`
  - process:
    - `knowledge_base/BusinessLogic/4_process/30_POSOperation/10_finalize_sale_orch.md`
    - `knowledge_base/BusinessLogic/4_process/30_POSOperation/23_void_sale_cash_reversal_process.md`
  - modSpec: `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/cashSession_module_patched_v2.md`
  - story map: `knowledge_base/BusinessLogic/_maps/cashSession_story_coverage_map.md`

## 2) Owned Facts (Source of Truth)

- Owned tables/projections (planned):
  - `v0_cash_sessions`
  - `v0_cash_movements`
  - `v0_cash_reconciliation_snapshots` (session close artifact)
- Invariants:
  - at most one `OPEN` session per `(tenant_id, branch_id)`
  - cash movements are append-only and immutable
  - closed/force-closed sessions reject new movements
  - sale cash-in and refund cash-out writes are idempotent per `(branch_id, sale_id)`
  - non-cash sales (including KHQR) do not append cash movements
  - X/Z expose non-cash totals as informational metrics, excluded from cash reconciliation
  - close is blocked while unpaid tickets exist in branch (March baseline)
- Status/state machine:
  - `OPEN -> CLOSED`
  - `OPEN -> FORCE_CLOSED`

## 3) Consumed Facts (Read Dependencies)

- AccessControl:
  - consumed fact: role + tenant/branch authorization + subscription freeze gate
  - why: guard all reads/writes consistently
  - consistency mode: strong
- OrgAccount:
  - consumed fact: branch status (`ACTIVE`/`FROZEN`)
  - why: block operational writes on frozen branch
  - consistency mode: strong (via centralized access control)
- Sale/Order:
  - consumed fact: finalized cash sale snapshot and unpaid-ticket existence
  - why: append `SALE_IN`/`REFUND_CASH`; block close when unpaid tickets remain
  - consistency mode: strong for command path checks
- Auth context:
  - consumed fact: `tenantId` + `branchId` in token
  - why: no branch/tenant override in cash endpoints
  - consistency mode: strong

## 4) Commands (Write Surface)

- Endpoint: `POST /v0/cash/sessions`
  - Action key: `cashSession.open`
  - Scope/effect: `BRANCH / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`, `CASHIER`
  - Idempotency required: yes
- Endpoint: `POST /v0/cash/sessions/:sessionId/close`
  - Action key: `cashSession.close`
  - Scope/effect: `BRANCH / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`, `CASHIER`
  - Idempotency required: yes
- Endpoint: `POST /v0/cash/sessions/:sessionId/force-close`
  - Action key: `cashSession.forceClose`
  - Scope/effect: `BRANCH / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes
- Endpoint: `POST /v0/cash/sessions/:sessionId/movements/paid-in`
  - Action key: `cashSession.movement.paidIn`
  - Scope/effect: `BRANCH / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`, `CASHIER`
  - Idempotency required: yes
- Endpoint: `POST /v0/cash/sessions/:sessionId/movements/paid-out`
  - Action key: `cashSession.movement.paidOut`
  - Scope/effect: `BRANCH / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`, `CASHIER`
  - Idempotency required: yes
- Endpoint: `POST /v0/cash/sessions/:sessionId/movements/adjustment`
  - Action key: `cashSession.movement.adjustment`
  - Scope/effect: `BRANCH / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`, `MANAGER`
  - Idempotency required: yes

Internal command hooks (no public HTTP in v0):
- `RecordSaleCashIn` (triggered by finalize-sale orchestration)
  - action key: `cashSession.saleIn.record`
  - idempotent anchor: `(branch_id, sale_id)`
- `RecordRefundCashOut` (triggered by void orchestration)
  - action key: `cashSession.refund`
  - idempotent anchor: `(branch_id, sale_id)`

Transaction contract for each write:
- business writes
- audit write
- outbox write

Primary failure reason codes:
- `CASH_SESSION_ALREADY_OPEN`
- `CASH_SESSION_NOT_FOUND`
- `CASH_SESSION_NOT_OPEN`
- `CASH_SESSION_UNPAID_TICKETS_EXIST`
- `CASH_SESSION_REFUND_REQUIRES_OPEN_SESSION`
- `IDEMPOTENCY_KEY_REQUIRED`
- `IDEMPOTENCY_CONFLICT`
- `IDEMPOTENCY_IN_PROGRESS`
- plus standard context/access/subscription denial codes

## 5) Queries (Read Surface)

- Endpoint: `GET /v0/cash/sessions/active`
  - Action key: `cashSession.active.read`
  - Scope: `BRANCH / READ`
- Endpoint: `GET /v0/cash/sessions`
  - Action key: `cashSession.list`
  - Scope: `BRANCH / READ`
  - Filters: `status`, `from`, `to`, `limit`, `offset`
- Endpoint: `GET /v0/cash/sessions/:sessionId`
  - Action key: `cashSession.read`
  - Scope: `BRANCH / READ`
- Endpoint: `GET /v0/cash/sessions/:sessionId/movements`
  - Action key: `cashSession.movements.list`
  - Scope: `BRANCH / READ`
- Endpoint: `GET /v0/cash/sessions/:sessionId/x`
  - Action key: `cashSession.x.view`
  - Scope: `BRANCH / READ`
- Endpoint: `GET /v0/cash/sessions/:sessionId/z`
  - Action key: `cashSession.z.view`
  - Scope: `BRANCH / READ`

## 6) Event Contract

### Produced events

- `CASH_SESSION_OPENED`
- `CASH_SESSION_CLOSED`
- `CASH_SESSION_FORCE_CLOSED`
- `CASH_MOVEMENT_RECORDED`
- `CASH_ADJUSTMENT_RECORDED`
- `CASH_X_REPORT_VIEWED` (observational)
- `CASH_Z_REPORT_VIEWED` (observational)

All events carry:
- triggering `actionKey`
- `tenantId`, `branchId`, `actorAccountId`
- entity refs (`cash_session_id`, optional `cash_movement_id`)
- stable dedupe key

### Subscribed events (planned)

- `SALE_FINALIZED`
  - purpose: append `SALE_IN` for cash tender only
  - idempotency: `(branch_id, sale_id)`
- `SALE_VOIDED` (cash-refund path from void orchestration)
  - purpose: append `REFUND_CASH` movement
  - idempotency: `(branch_id, sale_id)`

## 7) Access Control Mapping

- Route registry entries (target):
  - `POST /cash/sessions` -> `cashSession.open`
  - `POST /cash/sessions/:sessionId/close` -> `cashSession.close`
  - `POST /cash/sessions/:sessionId/force-close` -> `cashSession.forceClose`
  - `POST /cash/sessions/:sessionId/movements/paid-in` -> `cashSession.movement.paidIn`
  - `POST /cash/sessions/:sessionId/movements/paid-out` -> `cashSession.movement.paidOut`
  - `POST /cash/sessions/:sessionId/movements/adjustment` -> `cashSession.movement.adjustment`
  - `GET /cash/sessions/active` -> `cashSession.active.read`
  - `GET /cash/sessions` -> `cashSession.list`
  - `GET /cash/sessions/:sessionId` -> `cashSession.read`
  - `GET /cash/sessions/:sessionId/movements` -> `cashSession.movements.list`
  - `GET /cash/sessions/:sessionId/x` -> `cashSession.x.view`
  - `GET /cash/sessions/:sessionId/z` -> `cashSession.z.view`
- Entitlement bindings:
  - baseline `core.pos`
- Subscription/branch-status gates:
  - `PAST_DUE`: reads+writes allowed (warn in UX)
  - `FROZEN`: reads allowed, writes denied
  - `BRANCH_FROZEN`: writes denied

## 8) API Contract Docs

- Canonical contract file: `api_contract/cash-session-v0.md`
- Compatibility alias docs: none
- OpenAPI: `N/A`

## 9) Test Plan (Required)

### Unit tests (module-local)
- path: `src/modules/v0/posOperation/cashSession/tests/unit/*`
- cover:
  - state transition guards
  - movement validation + reconciliation math
  - reason-code mapping

### Integration tests
- path: `src/integration-tests/v0-cash-session*.int.test.ts`
- cover:
  - open/close/force-close + role guard
  - paid-in/paid-out/adjustment role + invariant guard
  - x/z access scope (cashier own-session restriction)
  - idempotency replay/conflict
  - atomic rollback (`business + audit + outbox`)
  - sale finalize and void cash hooks idempotency

## 10) Boundary Guard Checklist

- [x] No cross-module table writes in repositories (planned boundary)
- [x] Route prefix matches module owner
- [x] Action key prefix matches module owner
- [x] Outbox event type ownership defined
- [x] Canonical behavior documented
- [x] Test requirements listed

## 11) Rollout Notes

- Compatibility aliases to remove later: none
- Migration/backfill needed: none (fresh v0 baseline)
- Frontend consumption notes:
  - cash session is branch-scoped from token context
  - x/z are operational cash-session artifacts; reporting module consumes closed artifacts for analytics views

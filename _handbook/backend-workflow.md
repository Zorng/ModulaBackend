# Backend Workflow (KB -> Tests -> Implementation) — Tracking Doc

Status: **Discussion / Planning**

Goal: establish a predictable workflow that:
- keeps the restart aligned to the KB (source of truth)
- enables parallel development safely
- makes the backend easy for frontend developers to consume (stable conventions even under `/v0`)

This doc is intentionally separate from `_refactor-artifact/saas-multi-tenant-overhaul.md` so we can focus on *workflow* (how we work) rather than the feature plan itself.

Location: `_handbook/backend-workflow.md`

---

## Context (Current Direction)

- Restart API contract lives under **`/v0/*`** (capstone phase; breaking changes expected).
- KB is the specification source of truth.
- Repo-level implementation choices live in `_implementation_decisions/` (we avoid mutating KB to match code).
- We will use **tests first** where possible, derived from KB process documents.

---

## Workflow Loop (Per Feature / Module)

For each deliverable slice (example: Authentication, Tenant Membership, Access Control):

1. **Pick the KB artifacts**
   - domain + process + modspec (minimum: the process behavior contract)
2. **Write the API contract surface**
   - define `/v0` endpoint(s), payloads, and error reason codes needed by UI
   - record the contract under `api_contract/` (markdown)
     - do not update `api_contract/_archived/` (legacy/prototype reference only)
   - keep response envelope consistent across modules
3. **Write integration tests first**
   - tests encode the KB behavior (happy path + key failures)
4. **Implement minimally to pass tests**
   - keep module boundaries clean (AuthN vs AuthZ)
5. **Add regression tests**
   - cross-tenant isolation tests
   - authorization fail-closed tests
6. **Document the dev UX**
   - update onboarding notes or add a short doc under `onboard/` if needed

---

## Conventions To Lock Early (Frontend-Consumable)

### API Versioning
- All new endpoints are under **`/v0/*`**.
- `/v1/*` is legacy prototype and should not be relied upon.

### Context Propagation (Locked)

We use a **working context in token** model for `/v0`:
- Access tokens carry:
  - `authAccountId` (actor)
  - optional `tenantId`
  - optional `branchId`
- Tenant/branch selection (and switching) is performed via Auth endpoints that **re-issue tokens** with the new context.
- Feature endpoints must **not** accept `tenantId` / `branchId` overrides via query/body/headers.
  - The only exceptions are global Auth/Membership flows (example: accepting an invite) where context is inherently not yet established.

### Response Envelope (Recommended)
- Standard success envelope:
  - `{ "success": true, "data": ... }`
- Standard error envelope:
  - `{ "success": false, "error": { "code": "...", "message": "...", "details": ... } }`

### Error Codes / Reason Codes
For state-machine flows (auth, membership, context resolution), the frontend needs stable reason codes, not only strings.

Examples we will likely need early:
- `NO_ACTIVE_MEMBERSHIPS`
- `INVITATION_PENDING`
- `TENANT_HAS_NO_BRANCHES`
- `NO_BRANCH_ASSIGNED`
- `BRANCH_CONTEXT_REQUIRED`
- `NO_MEMBERSHIP`
- `NO_BRANCH_ACCESS`

---

## Testing Strategy (Test-First)

We keep **two official tiers** to make the workflow predictable and boring:
- unit tests (fast, DB-free)
- integration tests (DB-backed, highest confidence)

### Unit Tests (Required)
- Must be fast and DB-free.
- Cover pure logic:
  - validators, mappers, error/reason-code mapping
  - action catalog metadata (scope/effect)
  - token claim helpers/parsing (no real JWT secrets required)
- Command: `pnpm test`

### Integration Tests (Required For Platform Flows)
- DB-backed tests named `*.int.test.ts`.
- Must enforce SaaS safety invariants:
  - AuthAccount registration/login/refresh/logout
  - invite/inbox/accept/reject membership flows
  - tenant + branch context resolution
  - AccessControl fail-closed behavior
  - cross-tenant isolation (ID guessing)
- Command: `pnpm test:integration`

### Functional / Use-Case Tests (Optional)
If we need faster feedback on complex orchestration, we may add "functional" tests:
- use-case/service tests with faked repositories/ports
- treated as unit-style tests (no DB), not as a third mandatory tier

Notes:
- Keep tests small and deterministic.
- Avoid reliance on external services (SMS) by using the dev/test **fixed OTP** policy.

---

## Dev Bootstrap (Wizard)

We will provide a CLI setup wizard for fast demo:
- see `_handbook/dev-setup-wizard.md`

The workflow should define when the wizard becomes a "required" step for frontend dev:
- after Phase 1/2 of the restart (AuthAccount + Membership) is stable.

---

## Migration / DB Workflow

We must avoid "re-apply all SQL every run" behavior in the restart.

Minimum workflow requirements:
- tracked migrations table (example: `schema_migrations`)
- deterministic migration ordering
- `migrate up` for dev/test
- ability to reset local DB safely

---

## Parallel Dev Rules (Lightweight)

- Prefer small vertical slices (tests + minimal implementation).
- If a decision is needed that changes behavior or contracts, capture it in `_implementation_decisions/ADR-*.md`.
- Avoid introducing new patterns without documenting them in this workflow doc.

---

## Open Questions

- How strict should we be with "API contract before code"?
- Where do we publish "demo accounts" for frontend devs:
  - wizard stdout only, or also a generated markdown file?

---

## Progress Log

| Date (YYYY-MM-DD) | Note |
|---|---|
| 2026-02-13 | Tracking doc created (workflow + conventions + test-first direction). |
| 2026-02-13 | Locked `/v0` context propagation: working context is carried in access tokens; Auth endpoints re-issue tokens on tenant/branch selection/switch. |

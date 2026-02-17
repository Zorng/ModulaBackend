# Platform Foundation Rollout (Post Auth SaaS Overhaul)

Status: **In Progress (F7 Deferred)**

Owner: backend
Started: 2026-02-15

This artifact defines the next execution sequence after `/v0` Auth + Membership + Context + Attendance vertical slice.

## Goal

Stabilize lower-layer platform capabilities that all POS operations depend on, in this order:

1. OrgAccount core facts
2. Access Control full decision pipeline
3. Entitlement foundation (enforcement-ready, billing-light)
4. Idempotency gate
5. Audit logging
6. Foundation integration pass
7. Full billing engine (later phase)

---

## Why This Order

- OrgAccount provides tenant/branch truth and profile reads.
- Access Control depends on OrgAccount truth for correct allow/deny.
- Entitlements must be integrated early so POS modules depend on final enforcement seams (no later cross-module patch wave).
- Idempotency and Audit should be cross-cutting primitives before expanding high-volume POS write workflows.
- Full billing workflows should come after enforcement seams are already in place.

---

## Locked Sequence

### Phase F1 — OrgAccount Core (`Tenant` + `Branch`)
Scope:
- Implement `/v0` tenant and branch read models owned by OrgAccount.
- Add tenant/branch profile retrieval needed for context hydration.
- Keep branch status lifecycle (`ACTIVE`/`FROZEN`) as authoritative fact.
- Keep membership/assignment as authorization-consumable facts.

Deliverables:
- `api_contract` for OrgAccount endpoints (`tenant-v0`, `branch-v0`).
- Integration tests for:
  - tenant/branch profile reads
  - branch visibility rules (assignment-scoped)
  - branch freeze state reads

Exit criteria:
- Frontend can render selected tenant/branch profile from backend source of truth (no cache-only dependency).

### Phase F2 — Access Control Completion (KB Decision Order)
Scope:
- Upgrade centralized gate to full KB order:
  - action metadata (scope/effect)
  - tenant/branch status gates
  - membership gate
  - branch assignment gate
  - role policy gate
  - entitlement gate integration point (wire-ready for F3 enforcement)
- Standardize reason codes contract-wide.

Deliverables:
- Access-control action catalog + metadata table (repo artifact).
- Integration tests for each deny reason path.

Exit criteria:
- Authorization behavior is deterministic and fail-closed across `/v0`.

### Phase F3 — Entitlement Foundation (Billing-Light, Enforcement-Ready)
Scope:
- Implement minimal subscription/entitlement read model from KB domain:
  - subscription state: `ACTIVE`, `PAST_DUE`, `FROZEN`
  - entitlement enforcement: `ENABLED`, `READ_ONLY`, `DISABLED_VISIBLE`
- Add action-to-entitlement mapping catalog used by AccessControl.
- Turn AccessControl entitlement checks from placeholder to real enforcement.
- Keep payment/invoice/orchestration out of scope for this phase.

Deliverables:
- migrations + module scaffolding for entitlement facts and state snapshot.
- enforcement-integrated access-control tests for:
  - `ENTITLEMENT_BLOCKED`
  - `ENTITLEMENT_READ_ONLY`
  - frozen-tenant write deny path
- artifact documenting initial action-to-entitlement mapping.

Exit criteria:
- POS modules can integrate once against stable entitlement enforcement seams.
- No module-level retrofitting is needed later when full billing lands.

### Phase F4 — Idempotency Gate
Scope:
- Add shared idempotency storage + gate API for critical writes.
- Enforce `idempotency_key` + `action_key` + scope tuple + payload hash checks.
- Return deterministic duplicate/conflict responses.

Deliverables:
- migration + module + adapter used by first critical writes.
- Integration tests for `APPLY`, `DUPLICATE`, `CONFLICT`.

Exit criteria:
- Critical write endpoints can be retried safely without duplicate effects.

### Phase F5 — Audit Logging Core
Scope:
- Add immutable audit event write path for state-changing actions.
- Add privileged tenant-scoped read endpoint (`audit.view`).
- Ensure replay/idempotency-safe audit ingestion behavior.

Deliverables:
- migration + module + endpoint contract.
- Integration tests for:
  - write-on-success
  - meaningful rejection logging
  - access restriction (owner/admin only)

Exit criteria:
- Governance-critical actions have queryable, immutable evidence.

### Phase F6 — Foundation Integration Pass
Scope:
- Retrofit OrgAccount + AccessControl + Entitlements + Idempotency + Audit into current `/v0` endpoints.
- Remove inconsistent behavior and drift in contracts/docs.

Deliverables:
- updated `api_contract/*-v0.md`
- full integration test pass
- rollout notes for frontend usage patterns

Exit criteria:
- Platform foundation is stable enough to begin next POSOperation vertical slices.

### Phase F7 — Full Billing Engine (Deferred Until Full POS Readiness)
Scope:
- Implement billing operations beyond F3 entitlement foundation:
  - invoice lifecycle
  - payment confirmation ingestion (manual + webhook)
  - scheduler-driven grace/freeze/recovery
  - upgrade/downgrade orchestration
- Maintain compatibility with F3 enforcement contracts (no breaking rewires).

Deferral decision:
- F7 implementation is intentionally deferred until core POS modules are fully built and stabilized.
- Entitlement seams from F3 remain the active guardrail in the meantime.

Deliverables:
- `api_contract` for billing workflows (invoice/payment/subscription management).
- integration tests for:
  - payment confirmation and state transitions
  - grace/freeze/recovery scheduler behavior
  - upgrade/downgrade effects on entitlements

Exit criteria:
- Billing workflows are complete without requiring POS module contract rewrites.

---

## Tracking

| Phase | Status | Notes |
|---|---|---|
| F1 OrgAccount Core | Completed | `/v0/org` read endpoints shipped with contracts + integration coverage (profile reads, assignment-scoped visibility, frozen branch reads). |
| F2 Access Control Completion | Completed | Access-control pipeline refactored into `src/platform/access-control/*`, fail-closed unknown `/v0` routes, and reason-code contract documented for frontend. |
| F3 Entitlement Foundation | Completed | Schema + read endpoints + live access-control enforcement shipped, with catalog mapping artifact and integration coverage. |
| F4 Idempotency Gate | Completed | Shared idempotency storage/gate shipped and integrated on attendance writes with APPLY/DUPLICATE/CONFLICT coverage. |
| F5 Audit Logging Core | Completed | Immutable tenant-scoped audit events shipped with `/v0/audit/events` (owner/admin only) and attendance success/rejection ingestion with idempotency-safe dedupe keys. |
| F6 Foundation Integration Pass | Completed | Platform seams are now integrated across active `/v0` slices (OrgAccount+AccessControl+Entitlements+Idempotency+Audit), contracts were reconciled, and frontend rollout notes were finalized. |
| F7 Full Billing Engine | Deferred | Deferred until full POS readiness; keep F3 entitlement enforcement active as interim control. |

---

## Open Items (Do Not Block Start)

- Audit event catalog v0 baseline for platform and OrgAccount actions.
- F7 is deferred until full POS readiness; revisit billing implementation preference (manual-first vs webhook-first) at restart.
- Pre-F7 atomic command contract rollout (ADR locked):
  - `_implementation_decisions/ADR-20260215-v0-command-audit-outbox-atomicity.md`
- Next execution tracker:
  - `_refactor-artifact/03-orgaccount/orgaccount-overhaul-pos-readiness.md`

## Flagged Deviation (OrgAccount Overhaul)

- Current behavior deviation:
  - `POST /v0/auth/tenants` provisions tenant + first branch in one flow.
- Target behavior:
  - tenant provisioning is decoupled from branch provisioning (tenant may exist with zero branches).
- Fair-use gap to close with OrgAccount overhaul:
  - add tenant-specific safety caps/rate limits (`tenant_count_per_account`, `tenant.provision` rate guard).
- Tracking rule:
  - do not patch this ad hoc in platform foundation; resolve as part of the planned OrgAccount overhaul slice.

## Locked Profile Shapes (F1 Input)

Tenant profile:
- `tenantName`
- `tenantAddress?`
- `contactNumber?` (can match owner phone or differ)
- `logoUrl?`

Branch profile:
- `branchName`
- `branchAddress?`
- `contactNumber?`

## F1 Completion Notes

- F1 includes optional `tenantAddress` in profile payload.
- This is an additive implementation decision to fill a practical data gap and does not conflict with existing KB invariants.
- Decision is tracked in `_implementation_decisions/ADR-20260215-v0-orgaccount-tenant-address-extension.md` and should be promoted into KB when the OrgAccount docs are patched.

## F2 Completion Notes

- Centralized access control now uses action metadata (`scope`, `effect`, optional `allowedRoles`) instead of per-route ad-hoc role checks.
- Access control implementation has been decomposed into focused files under `src/platform/access-control/` to avoid hook-file sprawl as modules grow.
- Branch status behavior now matches KB direction:
  - `WRITE` on frozen branch -> denied (`BRANCH_FROZEN`)
  - `READ` on frozen branch -> allowed if membership + assignment checks pass.
- `/v0` now fails closed for unregistered routes:
  - unknown `/v0/*` path -> `403 ACCESS_CONTROL_ROUTE_NOT_REGISTERED`
- Route/action catalog artifact added:
  - `_refactor-artifact/01-platform/access-control-action-catalog-v0.md`
- Reason-code contract added:
  - `api_contract/access-control-v0.md`
- New integration scenarios added:
  - tenant frozen write denial
  - branch frozen write denial
  - role policy denial for privileged tenant actions
  - unregistered route denial (`ACCESS_CONTROL_ROUTE_NOT_REGISTERED`)

## F3 Progress Notes

- Added entitlement foundation schema:
  - `v0_tenant_subscription_states` (`ACTIVE | PAST_DUE | FROZEN`)
  - `v0_branch_entitlements` (`ENABLED | READ_ONLY | DISABLED_VISIBLE`)
- Tenant provisioning now initializes:
  - subscription state = `ACTIVE`
  - branch entitlement seed:
    - `core.pos = ENABLED`
    - `module.workforce = ENABLED`
    - `module.inventory = ENABLED`
    - `addon.workforce.gps_verification = DISABLED_VISIBLE`
- Added subscription module scaffolding + read endpoints:
  - `GET /v0/subscription/state/current`
  - `GET /v0/subscription/entitlements/current-branch`
- Access-control now enforces:
  - `SUBSCRIPTION_FROZEN` on writes when subscription state is frozen
  - `ENTITLEMENT_BLOCKED` for disabled-visible actions
  - `ENTITLEMENT_READ_ONLY` for write attempts under read-only enforcement
- Entitlement catalog + action mapping artifact added:
  - `_refactor-artifact/01-platform/entitlement-catalog-v0.md`
- Added integration coverage:
  - `v0-access-control-hook.int.test.ts` (new entitlement + subscription scenarios)
  - `v0-subscription.int.test.ts`

## F4 Completion Notes

- Added shared idempotency persistence:
  - `v0_idempotency_records` (migration `013_create_v0_idempotency_records.sql`)
- Idempotency service/repository added under:
  - `src/platform/idempotency/*`
- First critical write adapter integrated:
  - `POST /v0/attendance/check-in`
  - `POST /v0/attendance/check-out`
- Implemented idempotency outcomes:
  - `APPLY` (first execution)
  - `DUPLICATE` (same key + same payload => stored response replayed)
  - `CONFLICT` (same key + different payload => `IDEMPOTENCY_CONFLICT`)
- Added idempotency contract notes:
  - `api_contract/idempotency-v0.md`
- Integration coverage added in `v0-attendance.int.test.ts`:
  - replayed duplicate behavior
  - conflict behavior
  - required key behavior

## F5 Completion Notes

- Added immutable platform audit storage:
  - `v0_audit_events` (migration `014_create_v0_audit_events.sql`)
- Added audit module + tenant-scoped read endpoint:
  - `GET /v0/audit/events`
  - access policy: owner/admin only (`audit.view`)
- Added audit-aware access-control catalog entries:
  - `audit.view` action metadata
  - `/audit/events` route registration (fail-closed model preserved)
- Attendance write integration:
  - `POST /v0/attendance/check-in`
  - `POST /v0/attendance/check-out`
  - emits `SUCCESS` and `REJECTED`/`FAILED` outcomes with reason codes
  - uses outcome-specific dedupe keys tied to idempotency keys to avoid replay duplication
- Added contract + coverage:
  - `api_contract/audit-v0.md`
  - integration tests in `v0-audit.int.test.ts` for write-on-success, rejection logging, and role-based read restriction

## F6 Progress Notes

- Expanded platform audit integration beyond attendance into existing Auth tenant-scoped writes:
  - `POST /v0/auth/tenants`
  - `POST /v0/auth/memberships/invite`
  - `POST /v0/auth/memberships/invitations/:membershipId/accept`
  - `POST /v0/auth/memberships/invitations/:membershipId/reject`
  - `POST /v0/auth/memberships/:membershipId/role`
  - `POST /v0/auth/memberships/:membershipId/revoke`
  - `POST /v0/auth/memberships/:membershipId/branches`
- Audit writes remain non-blocking (best effort), preserving existing endpoint behavior while improving governance evidence.
- Added integration assertions:
  - membership lifecycle now verifies corresponding platform audit events
  - tenant provisioning now verifies `tenant.provision` audit event
- Contract drift cleanup:
  - `api_contract/auth-v0.md` now references platform audit behavior.
  - `api_contract/audit-v0.md` write-coverage list updated to include auth flows.

## F6 Frontend Rollout Notes (Locked)

- Token/context workflow:
  - Always replace stored access token after `/v0/auth/context/tenant/select` and `/v0/auth/context/branch/select`.
  - Treat token as source-of-truth for tenant/branch context.
- Context hydration:
  - After tenant selection, call `GET /v0/org/tenant/current`.
  - After branch selection, call `GET /v0/org/branch/current`.
- Access control handling:
  - Use `api_contract/access-control-v0.md` reason codes for deterministic UX states.
  - Unknown `/v0/*` routes are intentionally fail-closed with `ACCESS_CONTROL_ROUTE_NOT_REGISTERED`.
- Idempotency:
  - Required on attendance writes (`Idempotency-Key`).
  - Duplicate success replay is signaled by `Idempotency-Replayed: true`.
  - Optional on auth tenant-scoped writes; if sent, it is used for audit dedupe.
- Audit:
  - `GET /v0/audit/events` is tenant-scoped and restricted to owner/admin.
  - Attendance + auth tenant-scoped writes now emit immutable audit events.
- Entitlement/subscription gating:
  - Respect `SUBSCRIPTION_FROZEN`, `ENTITLEMENT_BLOCKED`, and `ENTITLEMENT_READ_ONLY` error codes in write/read UX flows.

## F7 Entry Gate (Locked)

Before active F7 implementation starts, finish command-path hardening under:

- `_implementation_decisions/ADR-20260215-v0-command-audit-outbox-atomicity.md`

Required minimum:
- shared event envelope + outbox row contract in code
- transactional persistence for:
  - `tenant.provision`
  - auth membership writes
  - attendance writes
- integration coverage for rollback + dedupe/replay safety

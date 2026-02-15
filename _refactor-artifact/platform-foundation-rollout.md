# Platform Foundation Rollout (Post Auth SaaS Overhaul)

Status: **In Progress (F1)**

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

### Phase F7 — Full Billing Engine (Later PlatformSystems Phase)
Scope:
- Implement billing operations beyond F3 entitlement foundation:
  - invoice lifecycle
  - payment confirmation ingestion (manual + webhook)
  - scheduler-driven grace/freeze/recovery
  - upgrade/downgrade orchestration
- Maintain compatibility with F3 enforcement contracts (no breaking rewires).

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
| F1 OrgAccount Core | In progress | Added `/v0/org` read endpoints + profile columns migration; validating contract and test coverage. |
| F2 Access Control Completion | Not started |  |
| F3 Entitlement Foundation | Not started |  |
| F4 Idempotency Gate | Not started |  |
| F5 Audit Logging Core | Not started |  |
| F6 Foundation Integration Pass | Not started |  |
| F7 Full Billing Engine | Not started |  |

---

## Open Items (Do Not Block Start)

- Exact first set of endpoints to be idempotency-enforced in F4.
- Audit event catalog v0 baseline for platform and OrgAccount actions.
- Entitlement catalog seed: which POS actions map to which entitlement keys in F3.
- Billing implementation preference for F7: manual-first vs webhook-first confirmation.

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

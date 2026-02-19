# Policy Module Rollout (v0)

Status: Completed
Owner context: PlatformSystems (product capability)

## Goal

Implement this module on `/v0` with boundary-safe ownership, atomic command contract (`business + audit + outbox`), and canonical API contracts in `api_contract/`.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/policy_module.md`
- `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/policy_domain.md`
- `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/10_update_branch_policy_process.md`
- `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/20_resolve_branch_policy_process.md`
- `knowledge_base/BusinessLogic/3_contract/10_edgecases/policy_edge_case_sweep.md`

## Offline-first DoD gates (standardized)

Template:
- `_refactor-artifact/05-pos/00_offline-first-dod-template-v0.md`

- Replay parity: policy writes are replay-safe via `pushSync` operation mapping.
- Pull deltas: successful policy writes emit sync changes for `moduleKey = policy`.
- Conflict taxonomy: deterministic policy + platform denial codes with resolution mapping.
- Convergence tests: replay apply/duplicate/conflict + pull visibility coverage.
- Observability baseline: replay outcome counters by code.

## Execution phases

### Phase 0 — Offline-first DoD gate
- lock replay operation mappings for policy writes
- lock pull entity map for policy projections
- lock conflict code/resolution mapping
- lock convergence test matrix

### Phase 1 — Boundary + Contract lock
- confirm owned facts vs consumed facts
- define canonical route prefix + action keys + event names
- draft/lock `api_contract/policy-v0.md`

### Phase 2 — Data model + repositories
- migrations for owned tables/projections
- repo methods only for owned tables
- idempotency anchor definitions for write commands

### Phase 3 — Commands/queries + access control
- command handlers with transaction boundaries
- query handlers with branch/tenant scoping
- access-control route registry + action catalog mappings

### Phase 4 — Integration + reliability
- atomic rollback coverage (`business + audit + outbox`)
- idempotency duplicate/conflict coverage
- cross-module event publish/subscribe coverage

### Phase 5 — Close-out
- update rollout tracker status
- update `_refactor-artifact/01-platform/v0-command-outbox-event-catalog.md` (if producer/subscriber changed)
- update frontend rollout notes in `api_contract/`

## Tracking

| Phase | Status | Notes |
|---|---|---|
| 0 Offline-first DoD gate | Completed | Retroactive gate satisfied via OF5 producer coverage and existing policy replay/idempotency tests. |
| 1 Boundary + Contract lock | Completed | Canonical route/action/event boundary locked in `_refactor-artifact/02-boundary/policy-boundary-v0.md`; API contract drafted at `api_contract/policy-v0.md`. |
| 2 Data model + repositories | Completed | Added `migrations/018_create_v0_branch_policies.sql`; scaffolded repository and command contract anchors under `src/modules/v0/policy/`. |
| 3 Commands/queries + access control | Completed | Implemented `/v0/policy/current-branch` query/update handlers with transactional update path and audit/outbox emission; access-control route/action mappings added. |
| 4 Integration + reliability | Completed | Added `src/integration-tests/v0-policy.int.test.ts` covering default read, update happy path, replay/conflict idempotency, cashier deny path, and atomic rollback on forced outbox failure. |
| 5 Close-out | Completed | Tracker/index/boundary statuses updated; outbox catalog already contains `POLICY_UPDATED` (no further producer/subscriber delta); API contract notes finalized for frontend rollout. |

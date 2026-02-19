# Discount Module Rollout (v0)

Status: Completed
Owner context: POSOperation

## Goal

Implement this module on `/v0` with boundary-safe ownership, atomic command contract (`business + audit + outbox`), and canonical API contracts in `api_contract/`.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/discount_module_patched.md`
- `knowledge_base/BusinessLogic/2_domain/40_POSOperation/discount_domain.md`
- `knowledge_base/BusinessLogic/3_contract/10_edgecases/discount_edge_case_sweep.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/10_finalize_sale_orch.md`

## Offline-first DoD gates (standardized)

- Replay parity: all discount write commands map to replay-safe operations.
- Pull deltas: successful writes emit sync changes for `moduleKey = discount`.
- Conflict taxonomy: deterministic overlap/editability/validation denial codes.
- Convergence tests: replay apply/duplicate/conflict and pull visibility coverage.
- Observability baseline: replay outcome counters by code.

## Execution phases

### Phase 0 — Offline-first DoD gate
- lock replay operation mappings for discount writes
- lock pull entity map for discount projections
- lock conflict code/resolution mapping
- lock convergence test matrix

### Phase 1 — Boundary + Contract lock
- confirm owned facts vs consumed facts
- define canonical route prefix + action keys + event names
- draft/lock `api_contract/discount-v0.md`

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
| 0 Offline-first DoD gate | Completed | Retroactive gate satisfied via OF5 producer coverage and discount replay/idempotency + pull sync checks. |
| 1 Boundary + Contract lock | Completed | Locked module boundary in `_refactor-artifact/02-boundary/discount-boundary-v0.md`; drafted canonical API contract in `api_contract/discount-v0.md` with route prefix `/v0/discount`, action/event naming, branch-safe preflight, and metadata-only eligibility resolve contract. |
| 2 Data model + repositories | Completed | Added baseline `migrations/022_create_v0_discount_tables.sql`, then aligned to KB branch-owned policy in `migrations/023_align_v0_discount_rules_branch_owned.sql` (`branch_id` on rules, removed multi-branch assignment table). Repository updated to branch-local item eligibility and active-rule overlap reads. |
| 3 Commands/queries + access control | Completed | Reworked `src/modules/v0/posOperation/discount/app/service.ts` + router for branch-owned create/update, `preflight/eligible-items`, overlap warning+confirm, and effective-inactive editability denial. Access-control mapping updated to `discount.rules.preflight.eligibleItems`. |
| 4 Integration + reliability | Completed | Expanded `src/integration-tests/v0-discount.int.test.ts` for branch-owned preflight behavior, overlap warning/confirm flow, effective-inactive update denial, idempotency replay/conflict, role denial, and atomic rollback. |
| 5 Close-out | Completed | Updated boundary + API contract to KB-locked semantics and kept outbox catalog in sync for discount producer events. |

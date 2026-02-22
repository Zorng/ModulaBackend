# Sale + Order Module Rollout (v0)

Status: Completed
Owner context: POSOperation

## Goal

Implement this module on `/v0` with boundary-safe ownership, atomic command contract (`business + audit + outbox`), and canonical API contracts in `api_contract/`.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/sale_module_patched.md`
- `knowledge_base/BusinessLogic/2_domain/40_POSOperation/order_domain_patched.md`
- `knowledge_base/BusinessLogic/_maps/sale_story_coverage_map.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/10_finalize_sale_orch.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/20_void_sale_orch.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/06_place_order_open_ticket_process.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/07_add_items_to_open_ticket_process.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/08_checkout_open_ticket_process.md`
- `knowledge_base/BusinessLogic/3_contract/10_edgecases/pos_operation_edge_case_sweep_patched.md`

## Locked policy update (KB sync 2026-02-19)

- Void behavior is mode-aware:
  - Workforce OFF (solo): direct void (no separate approval actor required)
  - Workforce ON (team): request/approve workflow
- `VOID_PENDING` must not be interpreted as "awaiting approval" in all cases.
  - It can also represent in-progress reversal execution.
- Notification trigger rule:
  - ON-01 is emitted on `VoidRequest(status=PENDING)` creation only.
  - Do not emit ON-01 from `sale.status=VOID_PENDING` transitions.

## Offline-first DoD gates (standardized)

Template:
- `_refactor-artifact/05-pos/00_offline-first-dod-template-v0.md`

- Replay parity: all sale/order write commands must have `pushSync` operation mapping.
- Pull deltas: finalize/void/order mutations must emit `saleOrder`-scoped sync changes.
- Conflict taxonomy: deterministic codes + `resolution` for retry/manual/permanent handling.
- Convergence tests: replay + pull convergence for sale/order lifecycle.
- Observability baseline: replay failure/duplicate/applied counters by code.

## Platform prerequisite (KHQR payment foundation)

Sale-order KHQR finalize path depends on:
- `_refactor-artifact/01-platform/khqr-payment-foundation-rollout-v0.md`
- Required baseline before KHQR finalize implementation:
  - `K1` contract lock
  - `K2` data model + repository
  - `K3` backend confirmation service
  - `K4` sale-order integration gate
  - `K5` webhook ingestion integration
  - `K6` reconciliation scheduler

Scope note:
- Non-KHQR sale-order paths may continue in parallel.
- KHQR finalize acceptance is blocked until K1-K4 are completed.

## Execution phases

### Phase 0 — Offline-first DoD gate
- lock sale-order offline-first checklist:
  - `_refactor-artifact/05-pos/06_sale-order-offline-first-dod-checklist-v0.md`
- lock replay operation mappings for sale/order writes
- lock pull entity map for sale/order projections
- lock conflict code/resolution mapping
- lock convergence test matrix

### Phase 1 — Boundary + Contract lock
- confirm owned facts vs consumed facts
- define canonical route prefix + action keys + event names
- draft/lock `api_contract/sale-order-v0.md`

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
| 0 Offline-first DoD gate | Completed | Locked in `_refactor-artifact/05-pos/06_sale-order-offline-first-dod-checklist-v0.md` (replay surface classification, sync entity map, conflict taxonomy, convergence matrix, and solo/team void semantics). |
| 1 Boundary + Contract lock | Completed | Locked module boundary in `_refactor-artifact/02-boundary/sale-order-boundary-v0.md` and drafted canonical contract in `api_contract/sale-order-v0.md` (orders/sales route groups, action keys, replay policy, error taxonomy, and solo/team void split). |
| 2 Data model + repositories | Completed | Added baseline owned-table schema in `migrations/035_create_v0_sale_order_tables.sql`, then aligned sale payment snapshot to KB dual-currency/tender model in `migrations/036_v0_sale_dual_currency_snapshot.sql`; repository + idempotency anchor contract in `src/modules/v0/posOperation/saleOrder/infra/repository.ts` and `src/modules/v0/posOperation/saleOrder/app/command-contract.ts`. |
| 3 Commands/queries + access control | Completed | Implemented command/query handlers in `src/modules/v0/posOperation/saleOrder/app/service.ts`, mounted API routes in `src/modules/v0/posOperation/saleOrder/api/router.ts` and `src/platform/http/routes/v0.ts`, and registered action/route ACL mappings in `src/platform/access-control/action-catalog.ts` + `src/platform/access-control/route-registry.ts`. |
| 4 Integration + reliability | Completed | Added integration reliability coverage in `src/integration-tests/v0-sale-order.int.test.ts` for (1) atomic rollback on forced outbox failure (`order.place`), (2) idempotency replay/conflict behavior, and (3) outbox publish + pull-sync delta exposure for `saleOrder` module. |
| 5 Close-out | Completed | Finalized rollout tracker state, updated outbox event catalog with sale/order producer events, and added frontend rollout note for online-vs-replay support in `api_contract/sale-order-v0.md`. |

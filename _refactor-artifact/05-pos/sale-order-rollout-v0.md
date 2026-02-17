# Sale + Order Module Rollout (v0)

Status: Not started
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

## Execution phases

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
| 1 Boundary + Contract lock | Not started | |
| 2 Data model + repositories | Not started | |
| 3 Commands/queries + access control | Not started | |
| 4 Integration + reliability | Not started | |
| 5 Close-out | Not started | |

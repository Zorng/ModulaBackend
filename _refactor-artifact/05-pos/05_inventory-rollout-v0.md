# Inventory Module Rollout (v0)

Status: In progress
Owner context: POSOperation

## Goal

Implement this module on `/v0` with boundary-safe ownership, atomic command contract (`business + audit + outbox`), and canonical API contracts in `api_contract/`.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/inventory_module_patched.md`
- `knowledge_base/BusinessLogic/2_domain/40_POSOperation/inventory_domain.md`
- `knowledge_base/BusinessLogic/_maps/inventory_story_coverage_map.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/13_stock_deduction_on_finalize_sale_process.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/22_void_sale_inventory_reversal_process.md`

## Offline-first DoD gates (standardized)

- This module is the reference implementation for the standardized offline-first Phase 0 gate.
- Template:
  - `_refactor-artifact/05-pos/00_offline-first-dod-template-v0.md`
- Canonical checklist: `_refactor-artifact/05-pos/05_inventory-offline-first-dod-checklist-v0.md`.

## Execution phases

### Phase 0 — Offline-first DoD gate (OF6)
- lock inventory offline-first checklist:
  - `_refactor-artifact/05-pos/05_inventory-offline-first-dod-checklist-v0.md`
- define inventory replay operation types + payload contracts for `/v0/sync/push`
- define inventory sync producer entity map for `/v0/sync/pull`
- lock conflict code taxonomy + resolution hints for inventory invariants

### Phase 1 — Boundary + Contract lock
- confirm owned facts vs consumed facts
- define canonical route prefix + action keys + event names
- draft/lock `api_contract/inventory-v0.md`

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
| 0 Offline-first DoD gate | Completed | Replay operation family, sync entity map, and conflict taxonomy are now locked in `_refactor-artifact/05-pos/05_inventory-offline-first-dod-checklist-v0.md`. |
| 1 Boundary + Contract lock | Completed | Boundary locked in `_refactor-artifact/02-boundary/inventory-boundary-v0.md`; API contract drafted in `api_contract/inventory-v0.md`. |
| 2 Data model + repositories | Not started | |
| 3 Commands/queries + access control | Not started | |
| 4 Integration + reliability | Not started | |
| 5 Close-out | Not started | |

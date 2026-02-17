# Menu Module Rollout (v0)

Status: In progress (Phase 4 next)
Owner context: POSOperation

## Goal

Implement this module on `/v0` with boundary-safe ownership, atomic command contract (`business + audit + outbox`), and canonical API contracts in `api_contract/`.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/menu_module_patched.md`
- `knowledge_base/BusinessLogic/2_domain/40_POSOperation/menu_domain_patched_v2.md`
- `knowledge_base/BusinessLogic/_maps/menu_story_coverage_map.md`
- `knowledge_base/BusinessLogic/3_contract/10_edgecases/pos_operation_edge_case_sweep_patched.md`

## Execution phases

### Phase 1 — Boundary + Contract lock
- confirm owned facts vs consumed facts
- define canonical route prefix + action keys + event names
- draft/lock `api_contract/menu-v0.md`

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
| 1 Boundary + Contract lock | Completed | Locked module boundary in `_refactor-artifact/02-boundary/menu-boundary-v0.md`; drafted canonical API contract in `api_contract/menu-v0.md` with action/event surface and entitlement constraints for tracked composition writes. |
| 2 Data model + repositories | Completed | Added schema migration `migrations/019_create_v0_menu_tables.sql` for menu/catalog/modifier/composition/visibility owned tables; scaffolded module repositories and idempotency/event contract anchors in `src/modules/v0/menu/infra/repository.ts` and `src/modules/v0/menu/app/command-contract.ts`. |
| 3 Commands/queries + access control | Completed | Implemented full contract command/query surface in `src/modules/v0/menu/api/router.ts` and `src/modules/v0/menu/app/service.ts` including update/archive/restore flows for items/categories/modifier groups/options; all writes use idempotent transactional `business + audit + outbox`; access-control action catalog and route registry now cover full menu endpoint set. |
| 4 Integration + reliability | Not started | |
| 5 Close-out | Not started | |

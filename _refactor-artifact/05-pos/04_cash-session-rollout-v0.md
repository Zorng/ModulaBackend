# Cash Session Module Rollout (v0)

Status: In progress
Owner context: POSOperation

## Goal

Implement this module on `/v0` with boundary-safe ownership, atomic command contract (`business + audit + outbox`), and canonical API contracts in `api_contract/`.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/40_POSOperation/cashSession_module_patched_v2.md`
- `knowledge_base/BusinessLogic/2_domain/40_POSOperation/cashSession_domain.md`
- `knowledge_base/BusinessLogic/_maps/cashSession_story_coverage_map.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/10_finalize_sale_orch.md`
- `knowledge_base/BusinessLogic/4_process/30_POSOperation/23_void_sale_cash_reversal_process.md`

## Execution phases

### Phase 1 — Boundary + Contract lock
- confirm owned facts vs consumed facts
- define canonical route prefix + action keys + event names
- draft/lock `api_contract/cash-session-v0.md`

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
| 1 Boundary + Contract lock | Completed | Locked boundary in `_refactor-artifact/02-boundary/cash-session-boundary-v0.md`; drafted canonical contract in `api_contract/cash-session-v0.md` with route prefix `/v0/cash`, action keys, event names, and cross-module sale/void hook anchors. |
| 2 Data model + repositories | Not started | |
| 3 Commands/queries + access control | Not started | |
| 4 Integration + reliability | Not started | |
| 5 Close-out | Not started | |

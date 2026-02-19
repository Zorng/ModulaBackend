# Cash Session Module Rollout (v0)

Status: Completed
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
| 2 Data model + repositories | Completed | Added `migrations/025_create_v0_cash_session_tables.sql` for `v0_cash_sessions`, `v0_cash_movements`, and `v0_cash_reconciliation_snapshots` with one-open-session invariant + sale-anchor dedupe constraints. Added repository + command contract scaffolding in `src/modules/v0/posOperation/cashSession/infra/repository.ts` and `src/modules/v0/posOperation/cashSession/app/command-contract.ts` (including idempotency scope + sale movement anchor helper). |
| 3 Commands/queries + access control | Completed | Implemented service + router commands/queries in `src/modules/v0/posOperation/cashSession/app/service.ts` and `src/modules/v0/posOperation/cashSession/api/router.ts`; wired module bootstrap + `/v0/cash` mount; added action catalog and protected route mappings for `cashSession.*` keys in `src/platform/access-control/action-catalog.ts` and `src/platform/access-control/route-registry.ts`. |
| 4 Integration + reliability | Completed | Added `src/integration-tests/v0-cash-session.int.test.ts` covering idempotency replay/conflict, atomic rollback on forced outbox failure, movement duplicate safety, and outbox dispatcher publish path (`CASH_SESSION_OPENED`). Targeted suite passes via `pnpm test:integration src/integration-tests/v0-cash-session.int.test.ts`. |
| 5 Close-out | Completed | Updated outbox producer catalog in `_refactor-artifact/01-platform/v0-command-outbox-event-catalog.md`, refreshed frontend implementation notes in `api_contract/cash-session-v0.md`, and marked module rollout complete. |

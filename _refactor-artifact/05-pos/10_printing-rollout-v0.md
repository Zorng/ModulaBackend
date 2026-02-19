# Printing Module Rollout (v0)

Status: Not started
Owner context: PlatformSystems (product capability)

## Goal

Implement this module on `/v0` with boundary-safe ownership, atomic command contract (`business + audit + outbox`), and canonical API contracts in `api_contract/`.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/printing_module.md`
- `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/printing_and_peripherals_domain.md`
- `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/55_printing_effects_dispatch_process.md`
- `knowledge_base/BusinessLogic/3_contract/10_edgecases/printing_effects_edge_case_sweep.md`

## Offline-first DoD gates (standardized)

Template:
- `_refactor-artifact/05-pos/00_offline-first-dod-template-v0.md`

- Replay parity: print-related write intents (if any) must define replay-safe command mapping.
- Pull readiness: print job/read-model status must be pull-sync consumable where applicable.
- Conflict taxonomy: deterministic device/adapter failure codes + retry guidance.
- Convergence tests: replayed triggers produce expected print job states/events.
- Observability baseline: print dispatch success/failure metrics by adapter/code.

## Execution phases

### Phase 0 — Offline-first DoD gate
- lock replay mappings for print-triggering intents
- lock pull/read visibility requirements for print job states
- lock deterministic failure taxonomy + resolution expectations
- lock convergence/retry test matrix

### Phase 1 — Boundary + Contract lock
- confirm owned facts vs consumed facts
- define canonical route prefix + action keys + event names
- draft/lock `api_contract/printing-v0.md`

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
| 0 Offline-first DoD gate | Not started | |
| 1 Boundary + Contract lock | Not started | |
| 2 Data model + repositories | Not started | |
| 3 Commands/queries + access control | Not started | |
| 4 Integration + reliability | Not started | |
| 5 Close-out | Not started | |

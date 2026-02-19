# Reporting Module Rollout (v0)

Status: Not started
Owner context: Reporting

## Goal

Implement this module on `/v0` with boundary-safe ownership, atomic command contract (`business + audit + outbox`), and canonical API contracts in `api_contract/`.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/50_Reporting/report_module.md`
- `knowledge_base/BusinessLogic/2_domain/50_Reporting/reporting_domain.md`
- `knowledge_base/BusinessLogic/_maps/reporting_story_coverage_map.md`
- `knowledge_base/BusinessLogic/4_process/50_Reporting/10_sales_reporting_process.md`
- `knowledge_base/BusinessLogic/4_process/50_Reporting/20_restock_spend_reporting_process.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/40_attendance_report.md`
- `knowledge_base/BusinessLogic/3_contract/10_edgecases/reporting_edge_case_sweep.md`

## Offline-first DoD gates (standardized, read-only profile)

Template:
- `_refactor-artifact/05-pos/00_offline-first-dod-template-v0.md`

- Replay parity: N/A (reporting is read-oriented; no direct business writes expected).
- Pull readiness: report projections/feeds must be consumable by pull-sync hydration.
- Conflict taxonomy: deterministic query/filter validation codes.
- Convergence tests: pull-hydrated facts match report query outputs.
- Observability baseline: report query latency/error metrics by endpoint.

## Execution phases

### Phase 0 — Offline-first DoD gate
- lock reporting read-model hydration expectations for pull-sync
- lock query validation code taxonomy
- lock convergence test matrix between pull-hydrated state and report queries

### Phase 1 — Boundary + Contract lock
- confirm owned facts vs consumed facts
- define canonical route prefix + action keys + event names
- draft/lock `api_contract/reporting-v0.md`

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

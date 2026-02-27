# Reporting Module Rollout (v0)

Status: Completed (v0 baseline; attendance reporting intentionally degraded)  
Last updated: 2026-02-26  
Owner context: Reporting

## Goal

Implement dedicated server-side reporting aggregation on `/v0/reports/*` so clients consume compact summaries/drill-down views instead of aggregating large raw datasets locally.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/50_Reporting/report_module.md`
- `knowledge_base/BusinessLogic/2_domain/50_Reporting/reporting_domain.md`
- `knowledge_base/BusinessLogic/_maps/reporting_story_coverage_map.md`
- `knowledge_base/BusinessLogic/4_process/50_Reporting/10_sales_reporting_process.md`
- `knowledge_base/BusinessLogic/4_process/50_Reporting/20_restock_spend_reporting_process.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/40_attendance_report.md`
- `knowledge_base/BusinessLogic/3_contract/10_edgecases/reporting_edge_case_sweep.md`
- `knowledge_base/BusinessLogic/3_contract/20_ux_specs/management_reporting_ux_spec.md`

## Scope lock (March baseline vs BI)

### In scope now (management reporting baseline)

- Sales performance reporting (summary + drill-down + provisional/exception visibility):
  - confirmed totals from `FINALIZED` only
  - explicit `VOID_PENDING` and `VOIDED` exposure
  - tender/order-type/top-item/category breakdowns from stored sale snapshots
- Attendance insight reporting:
  - Work Review-driven branch/staff summaries with fair degradation when shift planning is missing
- Restock spend visibility:
  - totals from known-cost restock batches + explicit unknown-cost visibility
- Frozen branch historical reporting (read-only).

### Explicitly out of scope now (deferred BI)

- forecasting / anomaly detection
- inventory valuation + COGS analytics
- advanced multi-branch BI dashboards
- scheduled export automation (email/PDF)
- real-time streaming analytics

## Dependency and sequencing notes

- Sales summary/drill-down can start immediately (sale-order baseline exists).
- Restock spend summary can start immediately (inventory baseline exists).
- Attendance reporting API must align with ongoing HR Attendance + Work Review rollout completion.
- Reporting remains read-only; it must never become a second source of truth.

## Offline-first DoD gates (standardized, read-only profile)

Template:
- `_refactor-artifact/05-pos/00_offline-first-dod-template-v0.md`

- Replay parity: N/A (reporting has no business write commands).
- Pull readiness: report views must consume pull-hydrated facts without divergence.
- Conflict taxonomy: deterministic query/filter validation codes.
- Convergence tests: same scope + same facts => same aggregates.
- Observability baseline: per-endpoint query latency/error metrics and scope tagging.

## Execution phases

### Phase 0 — Offline-first DoD gate
- lock reporting read-model hydration expectations for pull-sync
- lock query validation code taxonomy
- lock convergence test matrix between pull-hydrated state and report outputs

### Phase 1 — Boundary + Contract lock
- confirm owned facts vs consumed facts
- define canonical route/action taxonomy (`reports.view` and report-specific read actions)
- draft/lock `api_contract/reporting-v0.md` with baseline endpoints:
  - sales summary + drill-down
  - restock spend summary + drill-down
  - attendance summary + drill-down (can be feature-flagged until HR dependencies close)

### Phase 2 — Data model + repositories
- add read repositories for cross-module aggregation queries
- add projection/index migrations only where needed for report query performance
- add observational report access audit contract (`REPORT_VIEWED` scope metadata)

### Phase 3 — Queries + access control
- implement `/v0/reports/*` handlers (read-only)
- enforce branch/tenant scope policy (`ALL_BRANCHES` restrictions)
- enforce frozen-branch read-only labeling

### Phase 4 — Integration + reliability
- correctness tests for finalized/provisional partitioning (`FINALIZED` vs `VOID_PENDING`/`VOIDED`)
- snapshot-stability tests (menu/policy edits must not rewrite history)
- access-control scope enforcement tests (manager/admin/owner behavior)
- staleness/offline degradation behavior tests

### Phase 5 — Close-out
- update rollout tracker status
- update `_refactor-artifact/01-platform/v0-command-outbox-event-catalog.md` (if reporting events/read-audit hooks changed)
- update frontend integration notes in `api_contract/reporting-v0.md`

## Tracking

| Phase | Status | Notes |
|---|---|---|
| 0 Offline-first DoD gate | Completed | Scope and convergence rules are locked for read-only reporting and reflected in contract + tests. |
| 1 Boundary + Contract lock | Completed | Locked boundary in `_refactor-artifact/02-boundary/reporting-boundary-v0.md` and drafted canonical contract in `api_contract/reporting-v0.md` (`/v0/reports/*` summary + drill-down baseline). |
| 2 Data model + repositories | Completed | Added migration `046_v0_reporting_phase2_read_model_support.sql` (sale reporting snapshot fields + reporting-oriented indexes) and repository scaffold `src/modules/v0/reporting/infra/repository.ts` with deterministic sales/restock aggregation queries. Added reporting audit contract constants in `src/modules/v0/reporting/app/command-contract.ts`. |
| 3 Queries + access control | Completed | Added runtime router/service for `/v0/reports/*` in `src/modules/v0/reporting/api/router.ts` and `src/modules/v0/reporting/app/service.ts`; wired module in `src/platform/http/routes/v0.ts`; registered ACL route/action mappings in `src/platform/access-control/route-registry.ts` + `src/platform/access-control/action-catalog.ts`. Attendance report routes currently return `REPORT_NOT_AVAILABLE` until HR read-model phase closes. |
| 4 Integration + reliability | Completed | Added integration coverage in `src/integration-tests/v0-reporting.int.test.ts` for finalized/provisional partitioning, snapshot stability under menu edits, role/scope enforcement (`BRANCH` vs `ALL_BRANCHES`), frozen-branch labeling, and attendance degradation behavior (`REPORT_NOT_AVAILABLE`). |
| 5 Close-out | Completed | Rollout/index trackers synchronized, outbox catalog updated with reporting read-path note, and frontend integration notes refreshed in `api_contract/reporting-v0.md` for degraded attendance behavior and client handling. |

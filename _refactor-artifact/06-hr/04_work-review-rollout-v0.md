# Work Review Module Rollout (v0)

Status: Not started  
Owner context: HR

## Goal

Implement derived HR insight module that compares planned shifts and actual attendance, producing explainable classifications and summaries for managerial review.

## Primary KB references

- `knowledge_base/BusinessLogic/2_domain/30_HR/work_review_domain.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/30_shift_vs_attendance_evaluation.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/40_attendance_report.md`
- `knowledge_base/BusinessLogic/5_modSpec/30_HR/attendance_module.md` (downstream reporting expectations)

## Scope (v0 target)

- Derived comparison records from shift + attendance
- Query surfaces for staff/branch/tenant review windows
- Classification/summarization contract (late, absent, overtime, incomplete, etc.)
- Reporting-module handoff-ready read model

## Execution phases

### Phase 0 — Offline-first DoD gate
- lock whether work-review is pull-hydrated read model or computed-on-read
- lock entity/scope exposure in pull-sync if materialized
- lock deterministic classification code matrix

### Phase 1 — Boundary + Contract lock
- lock ownership of derived facts (no mutation of source attendance/shift records)
- draft/lock `api_contract/work-review-v0.md`
- lock action keys and event model (if materialization jobs/events are used)

### Phase 2 — Data model + repositories
- add derived tables/materialized views if needed
- repository queries for review windows and aggregations
- preserve reproducibility from source facts + ruleset version

### Phase 3 — Commands/queries + access control
- implement read endpoints for own/branch/tenant review scopes
- add optional recompute command/admin trigger only if needed
- enforce role-scoped access control

### Phase 4 — Integration + reliability
- evaluation consistency tests (shift+attendance fixtures => deterministic outputs)
- reporting consumer parity tests
- observability for evaluation latency/failures

### Phase 5 — Close-out
- mark rollout complete
- sync reporting module contract dependencies
- update outbox catalog only if new producers/subscribers exist

## Tracking

| Phase | Status | Notes |
|---|---|---|
| 0 Offline-first DoD gate | Not started | |
| 1 Boundary + Contract lock | Not started | |
| 2 Data model + repositories | Not started | |
| 3 Commands/queries + access control | Not started | |
| 4 Integration + reliability | Not started | |
| 5 Close-out | Not started | |

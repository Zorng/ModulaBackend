# Shift Module Rollout (v0)

Status: Not started  
Owner context: HR

## Goal

Implement shift planning as a first-class HR module for planned work expectations, without coupling it to permission enforcement.

## Primary KB references

- `knowledge_base/BusinessLogic/2_domain/30_HR/shift_domain.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/30_shift_vs_attendance_evaluation.md`
- `knowledge_base/BusinessLogic/5_modSpec/30_HR/attendance_module.md` (shift interaction contract)

## Scope (v0 target)

- Shift pattern management (recurring plans)
- Shift instance management (dated/ad-hoc plans)
- Read models for branch/team schedule views
- Events and contracts needed by work-review evaluation

## Execution phases

### Phase 0 — Offline-first DoD gate
- lock replay mapping for shift write operations
- lock pull-sync entity map (pattern + instance + tombstones)
- lock conflict code taxonomy for overlap/update/cancel races

### Phase 1 — Boundary + Contract lock
- lock owned facts vs consumed facts (no authorization ownership in shift)
- draft/lock `api_contract/shift-v0.md`
- lock action keys and event names

### Phase 2 — Data model + repositories
- add shift tables (pattern + instance) and indexes
- repository queries for manager/admin schedule reads
- ensure immutable/traceable change strategy for past instances

### Phase 3 — Commands/queries + access control
- write commands for create/update/cancel pattern/instance
- read endpoints for branch/team schedule retrieval
- route/action metadata with tenant/branch scoping

### Phase 4 — Integration + reliability
- idempotency + rollback coverage for shift writes
- integration with attendance/work-review evaluation triggers
- pull-sync convergence tests

### Phase 5 — Close-out
- mark rollout complete
- update outbox event catalog
- finalize frontend contract notes

## Tracking

| Phase | Status | Notes |
|---|---|---|
| 0 Offline-first DoD gate | Not started | |
| 1 Boundary + Contract lock | Not started | |
| 2 Data model + repositories | Not started | |
| 3 Commands/queries + access control | Not started | |
| 4 Integration + reliability | Not started | |
| 5 Close-out | Not started | |

# Attendance Module Rollout (v0)

Status: In progress (baseline live)  
Owner context: HR

## Goal

Extend attendance from vertical slice to KB-aligned operational module (start/end work orchestration parity, administration flows, and reporting-ready read models).

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/30_HR/attendance_module.md`
- `knowledge_base/BusinessLogic/2_domain/30_HR/attendance_domain_capability_gated.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/10_work_start_end_orchestration.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/20_work_end_orchestrastion.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/30_shift_vs_attendance_evaluation.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/40_attendance_report.md`

## Current baseline in repo

- Routes live:
  - `POST /v0/attendance/check-in`
  - `POST /v0/attendance/check-out`
  - `GET /v0/attendance/me`
- Atomic command contract implemented for write endpoints (`business + audit + outbox`).
- Idempotency and pull-sync append are already wired for check-in/out.
- Baseline integration coverage exists in `src/integration-tests/v0-attendance.int.test.ts`.

## Main gaps to close

- No manager/admin attendance query surfaces (branch/tenant scoped views).
- No force checkout/admin correction flow.
- No explicit shift-evaluation handoff fields/read models.
- Contract currently reflects only personal check-in/out slice.

## Execution phases

### Phase 0 — Offline-first DoD gate
- lock replay mapping for attendance writes
- lock pull-sync entity change contract (including admin actions)
- lock conflict/reason code matrix for start/end/force-end work

### Phase 1 — Boundary + Contract lock
- lock canonical command names (`startWork`, `endWork`, `forceEndWork`) and HTTP compatibility policy
- update/extend `api_contract/attendance-v0.md`
- lock event naming and consumer expectations

### Phase 2 — Data model + repositories
- extend attendance schema only if required for force-checkout and review/evidence fields
- add read queries for branch/tenant managerial views
- preserve immutable attendance history semantics

### Phase 3 — Commands/queries + access control
- keep current check-in/out/me compatibility
- add force checkout command (manager/admin only)
- add branch/tenant read endpoints with role-scoped access control

### Phase 4 — Integration + reliability
- idempotency coverage for all new write commands
- unresolved responsibility checks (cash session/work-end guards) coverage
- pull-sync convergence tests for attendance changes

### Phase 5 — Close-out
- mark rollout complete
- update outbox event catalog for new attendance events
- sync frontend contract notes and reason-code matrix

## Tracking

| Phase | Status | Notes |
|---|---|---|
| 0 Offline-first DoD gate | In progress | Baseline replay/pull is present for check-in/out; expanded command surface not locked yet. |
| 1 Boundary + Contract lock | In progress | Existing contract is slice-level and needs expansion for admin/reporting flows. |
| 2 Data model + repositories | In progress | Base table/repo exist; managerial/read-model additions pending. |
| 3 Commands/queries + access control | In progress | Check-in/out/me live; force/admin/reporting endpoints pending. |
| 4 Integration + reliability | In progress | Baseline tests exist; expanded matrix pending. |
| 5 Close-out | Not started | |

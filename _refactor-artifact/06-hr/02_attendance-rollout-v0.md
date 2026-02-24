# Attendance Module Rollout (v0)

Status: In progress (baseline live)  
Last verified: 2026-02-24
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
- Push replay mapping is wired:
  - `attendance.startWork` → `checkIn`
  - `attendance.endWork` → `checkOut`
  - (`src/modules/v0/platformSystem/pushSync/api/router.ts`)

## Progress audit snapshot (2026-02-24)

- ✅ Implemented:
  - personal attendance write/read slice (`check-in`, `check-out`, `me`)
  - transactional write contract (`business + audit + outbox`)
  - idempotency replay/conflict handling for writes
  - pull-sync append for successful check-in/out records
  - push-sync replay operation mapping for `attendance.startWork` and `attendance.endWork`
  - location verification data foundation in storage/DTO:
    - branch-level verification mode + workplace geofence fields
    - attendance-level observed location + verification result fields
  - branch management endpoint for attendance location verification:
    - `PATCH /v0/org/branch/current/attendance-location`
  - manager/admin force-end command:
    - `POST /v0/attendance/force-end`
    - force-end metadata persisted on attendance record (`forceEndedByAccountId`, `forceEndReason`)
  - manager/admin attendance read surfaces:
    - `GET /v0/attendance/branch`
    - `GET /v0/attendance/tenant`
- ⏳ Not implemented yet:
  - explicit shift-evaluation evidence fields/read models
  - expanded reliability matrix for new admin commands

## Main gaps to close

- No explicit shift-evaluation handoff fields/read models.
- Contract is expanded for force-end and managerial reads, but reporting-grade shift-evaluation output is still pending.

## Reassessment — Notification alignment (2026-02-24)

### KB alignment status

- Attendance module currently treats automated reminders/notifications as excluded for Capstone I (deferred scope).
- OperationalNotification baseline currently includes Void + Cash Session signals only; HR attendance signals are explicitly future scope.

### Current code reality

- Attendance already emits outbox events (`ATTENDANCE_CHECKED_IN`, `ATTENDANCE_CHECKED_OUT`) and rejected variants.
- OperationalNotification subscribers currently consume only cash-session closure events.
- There is no implemented late/early detection path in attendance service yet.

### Practical implication

- Adding "late check-in / early check-out notifications" now is a scope bump, not a small patch.
- We should first complete attendance core admin/evaluation surfaces, then layer notification signals on top.

### Recommended order (notification-aware)

1. finish attendance force-end + manager/admin read surfaces
2. add location-verification capability gates + evidence capture model
3. add shift-vs-attendance evaluation output needed for late/early facts
4. add attendance notification triggers + recipient resolution + dedupe keys
5. expose events via existing in-app notification inbox/SSE

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
- extend attendance schema for force-checkout metadata and location evidence fields
- add branch workplace geofence/radius read model used by verification
- add read queries for branch/tenant managerial views
- preserve immutable attendance history semantics

### Phase 3 — Commands/queries + access control
- keep current check-in/out/me compatibility
- add force checkout command (manager/admin only)
- add branch/tenant read endpoints with role-scoped access control

### Phase 4 — Integration + reliability
- idempotency coverage for all new write commands
- unresolved responsibility checks (cash session/work-end guards) coverage
- location verification degradation rules coverage (`UNKNOWN` on denied/weak/missing-workplace)
- pull-sync convergence tests for attendance changes

### Phase 5 — Close-out
- mark rollout complete
- update outbox event catalog for new attendance events
- sync frontend contract notes and reason-code matrix

### Phase 6 — Optional scope bump: attendance notifications
- define HR notification types and trigger contracts (late, early, missing checkout, correction request)
- implement subscriber/emit path using operationalNotification service
- add integration coverage for dedupe + recipient correctness

## Tracking

| Phase | Status | Notes |
|---|---|---|
| 0 Offline-first DoD gate | In progress | Baseline replay/pull is present for check-in/out; expanded command surface not locked yet. |
| 1 Boundary + Contract lock | In progress | Existing contract is slice-level and needs expansion for admin/reporting flows. |
| 2 Data model + repositories | In progress | Location foundation + branch config endpoint are live; manager/admin read models pending. |
| 3 Commands/queries + access control | In progress | Check-in/out/me + force-end + branch/tenant read are live; reporting-oriented refinements pending. |
| 4 Integration + reliability | In progress | Baseline tests exist; expanded matrix pending. |
| 5 Close-out | Not started | |
| 6 Optional attendance notifications | Not started | Explicit scope bump after core attendance surfaces are complete. |

# HR Module Build Order (KB-Aligned, v0)

Status: Active planning  
Owner: backend  
Last updated: 2026-02-24

## Why this exists

We already shipped a usable HR baseline (staff projection + attendance vertical slice), but it is still incomplete versus current KB scope.
This artifact locks an implementation order so HR can be finished before additional notification-heavy workflows.

## Inputs used from KB

- `knowledge_base/BusinessLogic/5_modSpec/30_HR/staffManagement_module.md`
- `knowledge_base/BusinessLogic/5_modSpec/30_HR/attendance_module.md`
- `knowledge_base/BusinessLogic/2_domain/30_HR/shift_domain.md`
- `knowledge_base/BusinessLogic/2_domain/30_HR/work_review_domain.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/05_staff_provisioning_orchestration.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/10_work_start_end_orchestration.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/20_work_end_orchestrastion.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/30_shift_vs_attendance_evaluation.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/40_attendance_report.md`

## Current backend baseline (already implemented)

- StaffManagement write surface:
  - `POST /v0/hr/staff/memberships/:membershipId/branches`
- Attendance surface:
  - `POST /v0/attendance/check-in`
  - `POST /v0/attendance/check-out`
  - `GET /v0/attendance/me`
- Staff projection tables and attendance table exist (`007`, `009` migrations).
- Atomic command contract, idempotency, audit, outbox are wired for attendance writes.
- Integration coverage exists for:
  - `src/integration-tests/v0-workforce-provisioning.int.test.ts`
  - `src/integration-tests/v0-attendance.int.test.ts`

## Locked execution order

1. `staffManagement` hardening (canonical contract + read APIs + lifecycle completeness)
2. `attendance` expansion (manager/admin visibility, force check-out, work-end orchestration parity)
3. `shift` module (planned-work ownership)
4. `workReview` module (planned vs actual interpretation + HR insight reads)

## Why this order

- Staff assignment and lifecycle facts are prerequisites for safe attendance administration.
- Attendance must be expanded before shift/work-review can be evaluated meaningfully.
- Shift and Work Review are currently domain-defined but not module-implemented.
- Notification use-cases become clearer only after HR events and read models are stable.

## Execution rules

- Keep one HR tracker in-progress at a time.
- For each write command: enforce atomic `business + audit + outbox`.
- Register/update API contracts in `api_contract/` in the same phase as endpoint changes.
- Keep push/pull sync parity for every new HR write surface.
- Update `_refactor-artifact/01-platform/v0-command-outbox-event-catalog.md` whenever event producers/subscribers change.

## Module trackers

| Order | Module | Tracker |
|---|---|---|
| 1 | staffManagement | `_refactor-artifact/06-hr/01_staff-management-rollout-v0.md` |
| 2 | attendance | `_refactor-artifact/06-hr/02_attendance-rollout-v0.md` |
| 3 | shift | `_refactor-artifact/06-hr/03_shift-rollout-v0.md` |
| 4 | workReview | `_refactor-artifact/06-hr/04_work-review-rollout-v0.md` |

## Tracking board

| Module | Status | Notes |
|---|---|---|
| staffManagement | In progress (baseline live) | Write endpoint + projection lifecycle exist; canonical module contract/read APIs still missing. |
| attendance | In progress (baseline live) | Check-in/out + own history live; manager/admin flows + force checkout + shift-aware parity not yet implemented. |
| shift | Not started | Domain defined in KB, module not yet implemented. |
| workReview | Not started | Domain defined in KB, module not yet implemented. |

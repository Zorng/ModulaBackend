# StaffManagement Module Rollout (v0)

Status: In progress (baseline live)  
Owner context: HR

## Goal

Complete StaffManagement as the canonical owner of staff profile + branch assignment lifecycle, with clear API contract and boundary-safe read/write surface.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/30_HR/staffManagement_module.md`
- `knowledge_base/BusinessLogic/2_domain/30_HR/staff_profile_and_assignment_domain.md`
- `knowledge_base/BusinessLogic/4_process/10_WorkForce/05_staff_provisioning_orchestration.md`
- `knowledge_base/BusinessLogic/4_process/20_OrgAccount/10_tenant_membership_administration_process.md`

## Current baseline in repo

- Staff profile + assignment projections are present:
  - `v0_staff_profiles`
  - `v0_membership_pending_branch_assignments`
  - `v0_branch_assignments`
- Canonical write route exists:
  - `POST /v0/hr/staff/memberships/:membershipId/branches`
- Membership accept/provision/revoke already calls HR projection side-effects.

## Main gaps to close

- Dedicated contract is published; continue evolving endpoint depth as workflows expand.
- Baseline read APIs are now available (`/v0/hr/staff`, `/v0/hr/staff/:membershipId`, `/v0/hr/staff/memberships/:membershipId/branches`).
- Pull-sync scope does not yet expose staff-management module changes as first-class HR feed.
- Event surface is narrow (`HR_STAFF_BRANCHES_ASSIGNED` only).

## Execution phases

### Phase 0 — Offline-first DoD gate
- lock replay operation mapping for staff-management writes
- lock pull-sync entity map for staff profiles and assignments
- lock deterministic conflict/reason code taxonomy

### Phase 1 — Boundary + Contract lock
- lock canonical route surface and ownership boundaries
- draft/lock `api_contract/staff-management-v0.md`
- lock action keys and outbox event names for new commands

### Phase 2 — Data model + repositories
- extend schema only if needed for missing lifecycle facts
- complete repository read models for staff/assignment views
- keep repository ownership strictly HR tables + approved joins

### Phase 3 — Commands/queries + access control
- keep assignment write command canonical under `/v0/hr/staff/*`
- add missing read/query endpoints with tenant/branch scoping
- map all new routes in action catalog + route registry

### Phase 4 — Integration + reliability
- idempotency duplicate/conflict coverage for write commands
- membership lifecycle cross-module parity tests (invite/accept/revoke effects on HR projections)
- pull-sync convergence tests for HR projections

### Phase 5 — Close-out
- mark rollout complete
- update outbox event catalog
- add frontend integration notes in API contract

## Tracking

| Phase | Status | Notes |
|---|---|---|
| 0 Offline-first DoD gate | In progress | Replay and deterministic write semantics are locked for the canonical branch-assignment command; pull-sync expansion for future read/query surfaces remains open. |
| 1 Boundary + Contract lock | Completed | Locked canonical boundary in `_refactor-artifact/02-boundary/staff-management-boundary-v0.md` and published canonical API contract `api_contract/staff-management-v0.md` (with deprecated auth alias noted). |
| 2 Data model + repositories | Completed (baseline) | Core projection tables and repositories exist. |
| 3 Commands/queries + access control | Completed (baseline) | Added canonical read endpoints and access-control mappings for `hr.staff.list`, `hr.staff.read`, and `hr.staff.branch.list` while retaining assignment write + compatibility alias. |
| 4 Integration + reliability | In progress | Workforce provisioning integration now covers read/query flows; pull-sync and broader denial matrix coverage still pending. |
| 5 Close-out | Not started | |

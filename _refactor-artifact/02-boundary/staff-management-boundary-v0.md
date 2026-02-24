# StaffManagement Module Boundary (v0)

Status: Phase 1 locked  
Owner context: `HR`  
Canonical route prefix: `/v0/hr`

## 1) Module Identity

- Module name: `staffManagement`
- Primary KB references:
  - domain: `knowledge_base/BusinessLogic/2_domain/30_HR/staff_profile_and_assignment_domain.md`
  - process: `knowledge_base/BusinessLogic/4_process/10_WorkForce/05_staff_provisioning_orchestration.md`
  - modSpec: `knowledge_base/BusinessLogic/5_modSpec/30_HR/staffManagement_module.md`

## 2) Owned Facts (Source of Truth)

- Owned tables/projections:
  - `v0_staff_profiles`
  - `v0_membership_pending_branch_assignments`
  - `v0_branch_assignments`
- Invariants:
  - staff profile is tenant-scoped and linked to one membership/account identity
  - branch assignment is explicit (no implicit branch access by role)
  - membership status drives assignment target:
    - `INVITED` => pending assignments
    - `ACTIVE` => active assignments
    - `REVOKED` => no active operational access
- Status/state machine:
  - staff profile: `ACTIVE | REVOKED`
  - assignment: `ACTIVE | REVOKED`

## 3) Consumed Facts (Read Dependencies)

- OrgAccount membership:
  - consumed facts: `v0_tenant_memberships` status/role/tenant/account mapping
  - why: authorize assignment command + determine target lifecycle branch (`INVITED|ACTIVE`)
  - consistency mode: strong (same transaction)
- OrgAccount branch:
  - consumed facts: `branches` existence + `ACTIVE` status
  - why: reject invalid/inactive branch ids
  - consistency mode: strong
- AccessControl:
  - consumed facts: route/action authorization and tenant isolation
  - why: centralized pre-handler authorization gate
  - consistency mode: strong

## 4) Commands (Write Surface)

- Endpoint: `POST /v0/hr/staff/memberships/:membershipId/branches`
  - Action key: `hr.staff.branch.assign`
  - Required scope/effect: `TENANT / WRITE`
  - Allowed roles: `OWNER`, `ADMIN`
  - Idempotency: optional header accepted; command semantics are deterministic set/replace for target membership
  - Transaction boundary:
    - business writes: pending/active branch assignment updates
    - audit write: `hr.staff.branch.assign` success event
    - outbox write: `HR_STAFF_BRANCHES_ASSIGNED`
  - Failure reason codes:
    - `NO_MEMBERSHIP`
    - `NO_PERMISSION` (requester role cannot assign branches)
    - `MEMBERSHIP_NOT_FOUND`
    - `MEMBERSHIP_STATUS_INVALID`
    - `BRANCH_INVALID_OR_INACTIVE`

Compatibility alias (temporary):
- `POST /v0/auth/memberships/:membershipId/branches`
  - same action key + event type, owned by HR boundary

## 5) Queries (Read Surface)

Current:
- `GET /v0/hr/staff`
- `GET /v0/hr/staff/memberships/:membershipId/branches`
- `GET /v0/hr/staff/:membershipId`

## 6) Event Contract

### Produced events

- Event type: `HR_STAFF_BRANCHES_ASSIGNED`
- Triggering action key: `hr.staff.branch.assign`
- Entity type: `membership`
- Minimal payload:
  - `membershipStatus`
  - `pendingBranchCount`
  - `activeBranchCount`
  - `endpoint`
- Compatibility alias required: no (event type already canonical)

### Subscribed events

- none in current implementation
- note: provisioning/accept/revoke side effects are currently executed synchronously in command transactions (not via event subscription)

## 7) Access Control Mapping

- Route registry entries:
  - `POST /hr/staff/memberships/:membershipId/branches` -> `hr.staff.branch.assign`
  - `POST /auth/memberships/:membershipId/branches` -> `hr.staff.branch.assign` (temporary compatibility)
- Action catalog entries:
  - `hr.staff.branch.assign` (`TENANT`, `WRITE`, allowed roles `OWNER|ADMIN`)
- Entitlement bindings:
  - none currently
- Subscription/branch-status gates:
  - none currently beyond branch `ACTIVE` validation in command

## 8) API Contract Docs

- Canonical contract file: `api_contract/staff-management-v0.md`
- Compatibility alias docs: included in canonical contract as deprecated alias
- OpenAPI: `N/A` (markdown contract policy)

## 9) Test Plan (Required)

### Unit tests (module-local)
- path: `src/modules/v0/hr/staffManagement/tests/unit/*` (to add during query/validation expansion)
- cover:
  - branch id normalization
  - membership status transition behavior (`INVITED` vs `ACTIVE`)
  - deterministic assignment replacement rules

### Integration tests
- path: `src/integration-tests/v0-workforce-provisioning.int.test.ts`
- cover:
  - invited membership pending assignment
  - accept invitation hydrates active assignment
  - active membership reassignment behavior
  - tenant isolation and role denial cases

## 10) Boundary Guard Checklist

- [x] No cross-module write ownership outside HR projection tables.
- [x] Route prefix includes canonical owner surface (`/v0/hr/*`).
- [x] Action key namespace matches owner (`hr.staff.*`).
- [x] Outbox event type ownership is canonical (`HR_STAFF_*`).
- [x] Canonical + compatibility behavior documented.
- [x] Integration coverage exists for baseline behavior.

## 11) Rollout Notes

- Compatibility aliases to remove later:
  - `/v0/auth/memberships/:membershipId/branches`
- Migration/backfill needed:
  - none for Phase 1 lock; existing workforce projection tables are live
- Frontend consumption notes:
  - use canonical `/v0/hr/staff/memberships/:membershipId/branches` only
  - treat response as assignment snapshot (pending vs active by membership status)

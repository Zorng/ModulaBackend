# Shift Module Boundary (v0)

Status: Phase 1 locked  
Owner context: `HR`  
Canonical route prefix: `/v0/hr`

## 1) Module Identity

- Module name: `shift`
- Primary KB references:
  - domain: `knowledge_base/BusinessLogic/2_domain/30_HR/shift_domain.md`
  - process: `knowledge_base/BusinessLogic/4_process/10_WorkForce/30_shift_vs_attendance_evaluation.md`
  - attendance interaction: `knowledge_base/BusinessLogic/5_modSpec/30_HR/attendance_module.md`

## 2) Owned Facts (Source of Truth)

- Owned records:
  - `shift_pattern` (recurring planned work)
  - `shift_instance` (dated/ad-hoc planned work)
- Invariants:
  - each pattern/instance belongs to one `tenant_id`
  - each pattern/instance targets one membership (`membership_id`)
  - each pattern/instance is tied to one `branch_id`
  - start time must be earlier than end time
  - instance cancellation/editing is explicit (audit-friendly lifecycle, no silent overwrite)
- Status models:
  - pattern: `ACTIVE | INACTIVE`
  - instance: `PLANNED | UPDATED | CANCELLED`

## 3) Consumed Facts (Read Dependencies)

- `orgAccount.membership`:
  - membership existence/status/tenant association
  - used for planner authorization and target validation
- `staffManagement`:
  - staff assignment/profile status and branch assignment visibility
  - used for valid staff-branch planning checks
- `orgAccount.branch`:
  - branch existence and ACTIVE state
  - used to reject planning against invalid/inactive branches
- `accessControl`:
  - route/action policy and role-scoped gates
  - manager/admin planning and read segmentation

## 4) Commands (Write Surface)

Planned canonical commands (v0):

- `POST /v0/hr/shifts/patterns`
  - action key: `hr.shift.pattern.create`
  - event type: `HR_SHIFT_PATTERN_CREATED`
- `PATCH /v0/hr/shifts/patterns/:patternId`
  - action key: `hr.shift.pattern.update`
  - event type: `HR_SHIFT_PATTERN_UPDATED`
- `POST /v0/hr/shifts/patterns/:patternId/deactivate`
  - action key: `hr.shift.pattern.deactivate`
  - event type: `HR_SHIFT_PATTERN_DEACTIVATED`
- `POST /v0/hr/shifts/instances`
  - action key: `hr.shift.instance.create`
  - event type: `HR_SHIFT_INSTANCE_CREATED`
- `PATCH /v0/hr/shifts/instances/:instanceId`
  - action key: `hr.shift.instance.update`
  - event type: `HR_SHIFT_INSTANCE_UPDATED`
- `POST /v0/hr/shifts/instances/:instanceId/cancel`
  - action key: `hr.shift.instance.cancel`
  - event type: `HR_SHIFT_INSTANCE_CANCELLED`

Command rules:
- idempotency required for all write commands
- atomic write contract required: `business + audit + outbox` in one transaction
- no enforcement side-effects on attendance start/end (shift remains planning-only in v0)

## 5) Queries (Read Surface)

Planned canonical queries (v0):

- `GET /v0/hr/shifts/schedule`
  - tenant/branch scoped range query for manager/admin schedule view
- `GET /v0/hr/shifts/memberships/:membershipId`
  - target staff planning view (patterns + instances in range)
- `GET /v0/hr/shifts/instances/:instanceId`
  - direct instance detail read

## 6) Event Contract

### Produced events

- `HR_SHIFT_PATTERN_CREATED`
- `HR_SHIFT_PATTERN_UPDATED`
- `HR_SHIFT_PATTERN_DEACTIVATED`
- `HR_SHIFT_INSTANCE_CREATED`
- `HR_SHIFT_INSTANCE_UPDATED`
- `HR_SHIFT_INSTANCE_CANCELLED`

### Subscribed events (planned)

- none in baseline implementation
- downstream consumer target: `workReview` evaluation pipeline (asynchronous interpretation)

## 7) Access Control Mapping (Phase 1 lock)

Planned action namespace:
- `hr.shift.pattern.*`
- `hr.shift.instance.*`
- `hr.shift.schedule.read`

Planned role model:
- write: `OWNER | ADMIN | MANAGER`
- read: `OWNER | ADMIN | MANAGER`
- self-view extension for staff is deferred until attendance/work-review parity is finalized

## 8) API Contract Docs

- Canonical contract file: `api_contract/shift-v0.md`
- Compatibility alias policy: none (no legacy shift routes in repo)

## 9) Test Plan (Required for implementation phases)

### Unit tests

- overlap and time-range validation
- recurrence expansion behavior for patterns
- cancellation/update immutability rules for historical instances

### Integration tests

- idempotent create/update/cancel writes
- tenant and branch isolation checks
- manager/admin access checks
- pull-sync emission parity for pattern and instance changes

## 10) Boundary Guard Checklist

- [x] Owner is HR, not attendance/access-control
- [x] Shift is planning-only, no runtime attendance gating
- [x] Canonical route prefix and action namespace are locked
- [x] Event names are locked for outbox catalog alignment
- [x] No legacy alias required


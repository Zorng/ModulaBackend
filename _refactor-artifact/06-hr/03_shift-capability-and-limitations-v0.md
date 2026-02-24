# Shift v0 — Current Capability and Limitations Note

Status: Active note  
Scope: Current backend implementation under `/v0/hr/shifts`  
Last updated: 2026-02-24

## Purpose

Capture what Shift already supports in v0 baseline and what is intentionally deferred or currently constrained.

---

## Current Capabilities (Implemented)

### 1) Flexible planning model (multi-pattern per staff)
- A membership can have multiple active shift patterns in the same tenant/branch.
- Patterns support day-of-week sets (`0..6`) plus effective date window (`effectiveFrom`, `effectiveTo`).
- This supports schedules like:
  - weekdays morning pattern
  - weekend afternoon pattern

### 2) Pattern + instance model
- Recurring plan: `shift_pattern`
- Dated/ad-hoc plan: `shift_instance`
- Instance can optionally reference a pattern (`patternId`) or be standalone.

### 3) Command surface (online lane)
- Pattern commands:
  - create
  - update
  - deactivate
- Instance commands:
  - create
  - update
  - cancel

### 4) Query surface
- Branch/team schedule query with optional filters:
  - `branchId`
  - `membershipId`
  - `from`, `to`
  - pattern/instance status filters
- Membership-focused schedule query.
- Instance detail query.

### 5) Access and validation guards
- Read/write roles: `OWNER | ADMIN | MANAGER`.
- Planning target validations:
  - target membership must be ACTIVE in tenant
  - target branch must be ACTIVE in tenant
  - target membership must have ACTIVE assignment for branch

### 6) Reliability baseline
- Idempotency required on write routes.
- Atomic command path (business + audit + outbox).
- Rejected outcomes persisted and replayable (`HR_SHIFT_COMMAND_REJECTED`).
- Work-review trigger outbox event emitted on shift changes (`HR_WORK_REVIEW_EVALUATION_REQUESTED`).

### 7) Sync baseline
- Pull-sync exposure for shift entities is live (`shift_pattern`, `shift_instance`).

---

## Current Limitations / Constraints

### 1) Overnight shifts are not supported in a single record
- Validation requires `plannedStartTime < plannedEndTime` on same day.
- Example not supported in one record:
  - `22:00` → `06:00` (cross-midnight)

### 2) Overlap control is partial
- DB uniqueness prevents exact duplicate active slots.
- Partial overlap across different patterns/instances is not fully excluded by current constraints.
- Current `SHIFT_OVERLAP_CONFLICT` is mostly triggered by unique/index collisions, not full interval overlap analysis.

### 3) No automatic pattern expansion job
- Creating/updating a pattern does not auto-materialize future instances.
- Dated instances are created explicitly via instance commands.

### 4) Offline push command parity is deferred
- Shift write command mapping for `/v0/sync/push` is not yet implemented (Phase 0 deferred).
- Shift remains complete for online lane baseline.

### 5) No staff self-service read/write surface (yet)
- Current surface is manager/admin-oriented.
- Cashier/staff self-view extension is deferred.

### 6) Timezone sophistication is deferred
- Times are handled as local `HH:mm` in contract.
- No branch-specific timezone logic is implemented in shift rules yet.

### 7) Lifecycle semantics are deactivate/cancel only
- Pattern uses `ACTIVE | INACTIVE`.
- Instance uses `PLANNED | UPDATED | CANCELLED`.
- No archive/restore state machine beyond these statuses.

---

## Practical Interpretation for Product/Frontend

- Shift is ready for manager/admin schedule planning workflows in online mode.
- Multi-pattern scheduling is available and usable now.
- For cross-midnight operations, frontend must split into two records (until overnight support is added).
- UI should avoid creating overlapping patterns because backend overlap enforcement is not yet complete.

---

## Recommended Next Tightening (if prioritized)

1) Add robust interval overlap detection for patterns/instances (not only exact duplicates).  
2) Add explicit cross-midnight support model (or locked split-record policy).  
3) Implement Shift Phase 0 push-sync parity for offline write lane.  
4) Add staff self-view read contract if HR product requires it.

# v0 Module Boundary Template

Status: Template  
Usage: copy this file to `_refactor-artifact/02-boundary/<module>-boundary-v0.md` before implementation starts.

## 1) Module Identity

- Module name:
- Owner context: `IdentityAccess | OrgAccount | HR | POSOperation | Reporting | PlatformSystems`
- Canonical route prefix (example: `/v0/org`):
- Primary KB references:
  - domain:
  - process:
  - modSpec:

## 2) Owned Facts (Source of Truth)

List only facts/tables this module owns and is allowed to mutate.

- Owned table/projection:
- Invariants (must always hold):
- Status/state machine:

## 3) Consumed Facts (Read Dependencies)

List facts read from other modules. No write ownership.

- Dependency module:
- Consumed fact/table:
- Why needed:
- Consistency mode: `strong (same tx)` or `eventual (outbox subscriber)`

## 4) Commands (Write Surface)

For each command endpoint:

- Endpoint:
- Action key:
- Required scope/effect:
- Allowed roles:
- Idempotency required: `yes/no`
- Transaction boundary:
  - business writes
  - audit write
  - outbox write
- Failure reason codes:

## 5) Queries (Read Surface)

For each query endpoint:

- Endpoint:
- Action key:
- Scope:
- Filters/pagination:
- Denial reason codes:

## 6) Event Contract

### Produced events

- Event type:
- Triggering action key:
- Entity type:
- Minimal payload:
- Compatibility alias required: `yes/no` (if yes, specify temporary alias)

### Subscribed events

- Event type:
- Handler purpose:
- Idempotency strategy:

## 7) Access Control Mapping

- Route registry entries:
- Action catalog entries:
- Entitlement bindings (if any):
- Subscription/branch-status gates (if any):

## 8) API Contract Docs

- Canonical contract file(s) in `api_contract/`:
- Compatibility alias docs (if temporary):
- OpenAPI: `N/A` (markdown contract policy for now)

## 9) Test Plan (Required)

### Unit tests (module-local)
- Path: `src/modules/v0/<module>/tests/unit/*`
- Cover:
  - validator/mapper rules
  - reason-code mapping
  - invariant checks

### Integration tests
- Path: `src/integration-tests/*`
- Cover:
  - happy path command/query
  - deny paths (access control)
  - tenant isolation
  - atomic rollback (`business + audit + outbox`)
  - idempotency replay/conflict (if command is idempotent)

## 10) Boundary Guard Checklist (Must Pass Before Merge)

- [ ] No cross-module table writes in repositories.
- [ ] Route prefix matches module owner.
- [ ] Action key prefix matches module owner.
- [ ] Outbox event type prefix matches module owner.
- [ ] Canonical + compatibility behavior documented.
- [ ] Integration tests updated and passing.

## 11) Rollout Notes

- Compatibility aliases to remove later:
- Migration/backfill needed:
- Frontend consumption notes:

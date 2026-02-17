# OrgAccount Overhaul + POS Readiness Plan

Status: In Progress  
Owner: backend  
Started: 2026-02-15

## Goal

Resolve the known OrgAccount model mismatch first, then harden command atomicity, then proceed with POS core slices on stable platform seams.

## Locked Execution Order

### Phase O1 — OrgAccount Model Correction
Scope:
- Decouple tenant provisioning from branch provisioning.
- Make tenant creation support zero-branch state.
- Keep membership/assignment facts compatible with Access Control.

Exit criteria:
- `tenant.provision` no longer requires first branch creation.
- Contracts and integration tests reflect tenant-only creation flow.

### Phase O2 — Fair-Use Limit Extension (Tenant Safety)
Scope:
- Add fair-use controls for tenant provisioning abuse risk.
- Introduce tenant-specific controls:
  - `tenant_count_per_account` hard limit
  - `tenant.provision` rate limit

Exit criteria:
- Tenant provisioning path enforces fair-use guards with stable denial codes.
- KB/domain note and implementation decision are aligned.

### Phase O3 — Atomic Command Contract Rollout
Scope:
- Implement ADR contract for atomic writes:
  - business state + audit + outbox in one transaction.
- Rollout order:
  - `tenant.provision`
  - membership writes
  - attendance writes

Exit criteria:
- Integration tests prove rollback behavior and replay-safe dedupe.
- No best-effort-only audit path remains on migrated commands.

### Phase O4 — POS Core Readiness Slices
Scope:
- Build POS modules on top of stabilized seams:
  - Menu + Inventory catalogs
  - Sale/Order + Payment (cash-first)
  - Cash Session + X report dependencies
  - Receipt + printing integration seam

Exit criteria:
- Core POS write paths consistently use:
  - Access Control
  - Entitlements
  - Idempotency
  - Audit/Outbox contract

## Tracking

| Phase | Status | Notes |
|---|---|---|
| O1 OrgAccount Model Correction | Completed | `POST /v0/auth/tenants` now performs tenant-only provisioning (zero-branch). Branch provisioning is separated from tenant creation; contracts + integration coverage updated. |
| O2 Fair-Use Extension | Completed | Tenant provisioning now enforces `tenant_count_per_account` hard cap and request-frequency rate limiting with stable denial codes (`FAIRUSE_HARD_LIMIT_EXCEEDED`, `FAIRUSE_RATE_LIMITED`). |
| O3 Atomic Command Contract | Completed | Migrated `tenant.provision`, auth membership writes, and attendance writes to transactional business+audit+outbox contract (`v0_command_outbox`), with integration coverage for rollback and replay-safe dedupe. |
| O4 POS Core Readiness Slices | Not started |  |

## O3 Close-Out Notes

- Runtime dispatcher wiring added for `v0_command_outbox`:
  - `src/platform/outbox/dispatcher.ts`
  - `src/server.ts` startup integration (config-gated)
- Event catalog documented:
  - `_refactor-artifact/v0-command-outbox-event-catalog.md`
- Dispatcher integration coverage added:
  - `src/integration-tests/v0-command-outbox-dispatcher.int.test.ts`

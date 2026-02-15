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
| O1 OrgAccount Model Correction | Not started |  |
| O2 Fair-Use Extension | Not started |  |
| O3 Atomic Command Contract | Not started | ADR: `_implementation_decisions/ADR-20260215-v0-command-audit-outbox-atomicity.md` |
| O4 POS Core Readiness Slices | Not started |  |


# Offline-First DoD Template (v0 POS Modules)

Status: Reusable template  
Owner: backend  
Usage: reference this in every POS module rollout tracker as **Phase 0**

## Purpose

Standardize offline-first acceptance criteria across POS modules so we avoid per-module drift and late retrofits.

## Required Phase 0 Gates

### Gate A — Replay parity (`/v0/sync/push`)
- Every write command has a replay operation mapping.
- Replay path enforces the same business invariants as direct online path.
- Replay identity is deterministic (`clientOpId` in token context scope).

### Gate B — Pull delta emission (`/v0/sync/pull`)
- Every successful write emits sync deltas in the same transaction.
- Delta operation is explicit (`UPSERT` / `TOMBSTONE`).
- Scope isolation is enforced (no cross-tenant/branch leakage).

### Gate C — Conflict taxonomy
- All deterministic failures map to stable `code`.
- Each `code` maps to `resolution.category`:
  - `RETRYABLE`
  - `MANUAL`
  - `PERMANENT`

### Gate D — Atomic command contract
- One transaction for:
  - business write(s)
  - audit event
  - outbox event
  - sync change append
- Any failure rolls back all side effects.

### Gate E — Convergence test matrix
- Replay apply once.
- Replay duplicate safe.
- Replay payload conflict.
- Pull bootstrap + incremental convergence.
- Representative resolution-category assertions.

### Gate F — Observability minimum
- Replay counters by outcome:
  - applied
  - duplicate
  - failed by code
- Baseline timing/lag metrics where relevant.

## Phase 0 Deliverables Checklist

- [ ] Replay operation list locked for module writes.
- [ ] Pull entity map locked for module read projections.
- [ ] Conflict code + resolution matrix locked.
- [ ] Convergence integration test matrix locked.
- [ ] API contract updated with replay/pull behavior notes.

## Notes

- Read-only modules can mark replay parity as N/A, but still must define pull/hydration and deterministic query/validation error behavior.
- Inventory checklist (`05_inventory-offline-first-dod-checklist-v0.md`) is the first concrete instantiation of this template.
- Modules that depend on external payment rails may satisfy offline-first through offline intent/order capture plus deferred online settlement.
- Do not fake non-cash payments as cash to force replay parity; cash-ledger truth is non-negotiable.

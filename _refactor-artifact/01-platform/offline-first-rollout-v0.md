# Offline-First Rollout (v0)

Status: In progress (OF1 completed)  
Owner: backend  
Started: 2026-02-19

## Goal

Evolve from offline-sync foundation to full offline-first architecture:
- writes can be captured offline and replayed safely
- reads can be hydrated and incrementally updated offline
- conflict/retry behavior is deterministic per module

## Current baseline

Already done:
- replay API + idempotency + payload conflict checks
- ordered replay + halt-on-failure
- operation lease + stale `IN_PROGRESS` reclaim

Missing for full offline-first:
- canonical read-sync plane (`pull` with cursors/watermarks + tombstones)
- standardized offline envelope for all write modules
- module-specific conflict policy contract
- convergence strategy across devices/sessions

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/offlineSync_module.md`
- `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/offline_sync_domain.md`
- `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/60_offline_operation_queue_process.md`
- `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/70_offline_sync_replay_process.md`
- `knowledge_base/BusinessLogic/3_contract/10_edgecases/offline_sync_edge_case_sweep.md`

## Locked principles

- Keep two execution modes:
  - online immediate execution
  - offline replay execution
- Use one logical command contract across both modes.
- Server remains source of truth for business invariants.
- Offline behavior must be deterministic and observable.

## Execution phases

### Phase OF1 — Read Sync Contract Lock
- Define `/v0/sync/pull` contract:
  - per-module stream
  - cursor/watermark semantics
  - tombstones for archive/delete
- Lock consistency model:
  - at-least-once delivery of changes
  - idempotent client merge requirement

Exit criteria:
- `api_contract/sync-v0.md` drafted and reviewed.

### Phase OF2 — Sync State Infrastructure
- Add server-side sync cursor/version infrastructure.
- Define canonical change record shape for pull responses.
- Add retention policy for sync deltas and replay metadata.

Exit criteria:
- migrations + infra repo implemented with integration coverage.

### Phase OF3 — Command Envelope Unification
- Standardize write envelope fields for offline/online parity:
  - `clientOpId`, `deviceId`, `occurredAt`, `operationType`, `payload`, optional `dependsOn`
- Keep current replay route backward-compatible until frontend migration completes.

Exit criteria:
- envelope contract locked and accepted by frontend.

### Phase OF4 — Conflict Taxonomy + Resolution Hints
- Define deterministic error taxonomy:
  - retryable
  - permanent
  - manual-resolution required
- Include machine-usable resolution hints in failed results.

Exit criteria:
- conflict matrix doc per operation type is complete.

### Phase OF5 — Module Sync Producers
- Add change producers for active modules:
  - policy
  - menu
  - discount
  - cash session
  - attendance
- Emit data changes in sync feed shape.

Exit criteria:
- each module has pull coverage in integration tests.

### Phase OF6 — POS Core Alignment
- As inventory/sale-order/receipt land, enforce offline-first DoD:
  - replay-safe writes
  - pull-ready read deltas
  - deterministic conflict codes

Exit criteria:
- inventory + sale-order + receipt pass offline-first test suite.

### Phase OF7 — Observability + SLO
- Add offline-first telemetry:
  - replay success rate
  - permanent failure rate by code
  - queue lag
  - stale lease reclaim count
- Define SLO thresholds and alert rules.

Exit criteria:
- observability dashboard + alert starter updated.

### Phase OF8 — Rollout/Compatibility Close-Out
- Deprecate transitional behaviors if any.
- Finalize frontend integration guide and migration notes.
- Freeze v0 offline-first contract.

Exit criteria:
- contract + artifact close-out approved.

## Tracking

| Phase | Status | Notes |
|---|---|---|
| OF1 Read Sync Contract Lock | Completed | Drafted `api_contract/sync-v0.md` with cursor semantics, change envelope, tombstones, and merge rules. |
| OF2 Sync State Infrastructure | Completed | Design + migrations (`029..031`), sync module scaffolding, and `POST /v0/sync/pull` are live with unit/integration coverage (`v0-sync.int.test.ts`). |
| OF3 Command Envelope Unification | Completed | `POST /v0/sync/push` accepts canonical envelope (token-scoped context, optional `deviceId`, optional `dependsOn`), preserves legacy per-op `tenantId/branchId` compatibility, and enforces `dependsOn` preconditions with deterministic dependency failure codes. |
| OF4 Conflict Taxonomy + Resolution Hints | Completed | Replay responses include `resolution` hints (`RETRYABLE | PERMANENT | MANUAL`) with deterministic mapping for offline-sync engine errors, dependency failures, entitlement/permission denials, and representative POS invariants (`CASH_SESSION_NOT_FOUND`, `ATTENDANCE_NO_ACTIVE_CHECKIN`). Covered in `v0-push-sync.int.test.ts`. |
| OF5 Module Sync Producers | Completed | Producer wiring live for `policy`, `cashSession`, `menu`, `discount`, `attendance`, `operationalNotification`. Menu tenant-wide writes are fanned out to active branch streams. Attendance/operational notifications are account-scoped in sync feed. |
| OF6 POS Core Alignment | In progress | Inventory selected as first OF6 target. Phase 0+1 locks completed: checklist/taxonomy in `_refactor-artifact/05-pos/05_inventory-offline-first-dod-checklist-v0.md`, boundary in `_refactor-artifact/02-boundary/inventory-boundary-v0.md`, and API contract draft in `api_contract/inventory-v0.md`. |
| OF7 Observability + SLO | Not started | |
| OF8 Rollout/Compatibility Close-Out | Not started | |

## First concrete next step

Continue OF6 with inventory execution:
- implement Phase 2 data model and repositories for `inventory-v0`
- wire replay operation handlers and sync change producers for inventory writes
- add end-to-end replay + pull convergence integration coverage for inventory mutations

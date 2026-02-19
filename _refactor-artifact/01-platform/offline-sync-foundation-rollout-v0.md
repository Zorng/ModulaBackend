# Offline Sync Foundation Rollout (v0)

Status: In progress (S1 completed)  
Owner: backend  
Started: 2026-02-19

## Goal

Implement backend offline-sync foundation seams now so upcoming POS write modules (inventory, sale-order, receipt) integrate once against stable replay/idempotency contracts.

## Why now (before Inventory)

- Inventory and sale-order are high-write modules and expensive to retrofit.
- Offline replay behavior depends on shared contracts (`clientOpId`, deterministic failure reasons, dependency handling).
- We already have idempotency primitives; this phase turns them into explicit offline contracts.

## Primary KB references

- `knowledge_base/BusinessLogic/5_modSpec/60_PlatformSystems/offlineSync_module.md`
- `knowledge_base/BusinessLogic/2_domain/60_PlatformSystems/offline_sync_domain.md`
- `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/60_offline_operation_queue_process.md`
- `knowledge_base/BusinessLogic/4_process/60_PlatformSystems/70_offline_sync_replay_process.md`
- `knowledge_base/BusinessLogic/3_contract/10_edgecases/offline_sync_edge_case_sweep.md`

## Locked baseline scope (v0 foundation)

In scope:
- canonical replay envelope contract for write commands
- idempotency alignment (`clientOpId` -> command dedupe/idempotency behavior)
- deterministic rejection reason codes for replay failures
- replay-status persistence for observability and troubleshooting
- integration with existing command/audit/outbox atomic contract

Out of scope:
- client-side queue implementation
- full admin conflict-resolution UX
- cross-device reconciliation tooling

## Execution phases

### Phase S1 — Boundary + Contract lock
- lock replay envelope fields (`clientOpId`, context, occurredAt, payload)
- lock reason-code contract (`DEPENDENCY_MISSING`, frozen/entitlement/acl denials, etc.)
- draft `api_contract/offline-sync-v0.md`

### Phase S2 — Data model + repository
- add replay tracking table(s) for applied/failed outcomes
- ensure uniqueness on replay identity anchors
- implement repository APIs for status transitions and query support

### Phase S3 — Replay command surface
- implement replay endpoint/service boundary
- route supported operations to existing command handlers
- preserve server-authoritative validation and transaction boundaries

### Phase S4 — Reliability + dependency handling
- FIFO replay behavior per context/device stream
- deterministic handling for dependent failures
- integration tests for duplicate/conflict/rejection semantics

### Phase S5 — Close-out
- update `_refactor-artifact/01-platform/v0-command-outbox-event-catalog.md` for replay metadata/events
- update POS trackers that depend on offline seams
- finalize frontend integration notes in `api_contract/offline-sync-v0.md`

## Tracking

| Phase | Status | Notes |
|---|---|---|
| S1 Boundary + Contract lock | Completed | Locked module boundary and API contract: `_refactor-artifact/02-boundary/offline-sync-boundary-v0.md`, `api_contract/offline-sync-v0.md`. |
| S2 Data model + repository | Not started | |
| S3 Replay command surface | Not started | |
| S4 Reliability + dependency handling | Not started | |
| S5 Close-out | Not started | |

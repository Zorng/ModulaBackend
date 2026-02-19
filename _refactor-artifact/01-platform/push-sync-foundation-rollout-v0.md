# Push Sync Foundation Rollout (v0)

Status: Completed  
Owner: backend  
Started: 2026-02-19

## Goal

Implement backend push-sync foundation seams now so upcoming POS write modules (inventory, sale-order, receipt) integrate once against stable replay/idempotency contracts.

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
- draft `api_contract/push-sync-v0.md`

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
- finalize frontend integration notes in `api_contract/push-sync-v0.md`

## Tracking

| Phase | Status | Notes |
|---|---|---|
| S1 Boundary + Contract lock | Completed | Locked module boundary and API contract: `_refactor-artifact/02-boundary/push-sync-boundary-v0.md`, `api_contract/push-sync-v0.md`. |
| S2 Data model + repository | Completed | Added schema migration `migrations/027_create_v0_offline_sync_tables.sql` and module repository/service scaffold under `src/modules/v0/platformSystem/pushSync/*` (renamed from `offlineSync/*`). |
| S3 Replay command surface | Completed | Implemented `/v0/sync/push` and `/v0/sync/push/batches/:batchId` with operation routing to attendance/cash-session handlers, client-op replay identity, and ACL route/action registration. |
| S4 Reliability + dependency handling | Completed | Added replay claim/finalize status flow (`IN_PROGRESS -> APPLIED|DUPLICATE|FAILED`) with deterministic duplicate/conflict behavior, operation lease + stale reclaim behavior, and halt-on-failure dependency handling, with integration coverage in `src/integration-tests/v0-push-sync.int.test.ts`. |
| S5 Close-out | Completed | Synced event-catalog notes and API contract/frontend guidance; POS build-order pre-inventory platform prerequisites now satisfied. |
